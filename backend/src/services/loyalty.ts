import type { Tier, Voucher } from '@prisma/client';
import { prisma, type Tx } from '../db.js';
import { badRequest } from '../lib/errors.js';
import { voucherCode } from '../lib/codes.js';

export type PointType = 'EARN' | 'REDEEM' | 'ADJUST' | 'REFUND' | 'WELCOME';

const DAY = 24 * 60 * 60 * 1000;

/** Hạng cao nhất mà khách đạt được với tổng chi tiêu ở mọi thương hiệu */
export async function tierForSpent(tx: Tx, totalSpent: number): Promise<Tier | null> {
  return tx.tier.findFirst({ where: { minSpent: { lte: totalSpent } }, orderBy: { minSpent: 'desc' } });
}

/** Xếp lại hạng theo tổng chi tiêu hiện tại. Trả về hạng mới và có thăng hạng hay không. */
export async function recomputeTier(tx: Tx, customerId: number) {
  const c = await tx.customer.findUniqueOrThrow({ where: { id: customerId }, include: { tier: true } });
  const tier = await tierForSpent(tx, c.totalSpent);
  if ((tier?.id ?? null) !== c.tierId) {
    await tx.customer.update({ where: { id: c.id }, data: { tierId: tier?.id ?? null } });
  }
  const tierUp = !!tier && (c.tier?.minSpent ?? -1) < tier.minSpent;
  return { tier, tierUp, previousTier: c.tier };
}

/** Lấy (hoặc tạo) ví điểm của khách tại thương hiệu */
export function ensureWallet(tx: Tx, customerId: number, brandId: number) {
  return tx.customerWallet.upsert({
    where: { customerId_brandId: { customerId, brandId } },
    create: { customerId, brandId },
    update: {},
  });
}

/**
 * Cộng/trừ điểm trong ví của khách tại 1 thương hiệu và ghi lịch sử.
 * Điểm không ảnh hưởng hạng (hạng xét theo tổng chi tiêu).
 * Không cho trừ xuống âm trừ khi `allowNegative`.
 */
export async function changePoints(
  tx: Tx,
  input: {
    customerId: number;
    brandId: number;
    points: number;
    type: PointType;
    description: string;
    orderId?: number;
    adminId?: number;
    allowNegative?: boolean;
  },
) {
  const wallet = await ensureWallet(tx, input.customerId, input.brandId);
  const balance = wallet.points + input.points;
  // Chỉ chặn khi đang trừ điểm; cộng điểm vào số dư âm (sau khi huỷ hoá đơn) vẫn được phép
  if (input.points < 0 && balance < 0 && !input.allowNegative) {
    throw badRequest(`Không đủ điểm (hiện có ${wallet.points} điểm)`);
  }
  const earned = input.points > 0 && (input.type === 'EARN' || input.type === 'WELCOME' || input.type === 'ADJUST');
  const reverted = input.type === 'REFUND';
  const updated = await tx.customerWallet.update({
    where: { id: wallet.id },
    data: {
      points: balance,
      ...(earned ? { lifetimePoints: { increment: input.points } } : {}),
      ...(reverted ? { lifetimePoints: { decrement: Math.abs(input.points) } } : {}),
    },
  });
  if (input.points !== 0) {
    await tx.pointTransaction.create({
      data: {
        customerId: input.customerId,
        brandId: input.brandId,
        type: input.type,
        points: input.points,
        balanceAfter: balance,
        description: input.description,
        orderId: input.orderId,
        adminId: input.adminId,
      },
    });
  }
  return updated;
}

/** Số điểm nhận được cho 1 hoá đơn */
export function pointsForAmount(amount: number, pointPerAmount: number, multiplier: number): number {
  if (amount <= 0 || pointPerAmount <= 0) return 0;
  return Math.floor((amount / pointPerAmount) * multiplier);
}

/** Số tiền giảm khi áp voucher cho hoá đơn `amount` */
export function voucherDiscountAmount(v: Pick<Voucher, 'discountType' | 'discountValue' | 'maxDiscount'>, amount: number) {
  let d = 0;
  if (v.discountType === 'PERCENT') {
    d = Math.floor((amount * v.discountValue) / 100);
    if (v.maxDiscount) d = Math.min(d, v.maxDiscount);
  } else if (v.discountType === 'AMOUNT') {
    d = v.discountValue;
  }
  return Math.max(0, Math.min(d, amount));
}

/** Đánh dấu hết hạn các voucher đã quá hạn (gọi lười trước khi đọc) */
export async function expireVouchers(customerId?: number) {
  await prisma.customerVoucher.updateMany({
    where: { status: 'AVAILABLE', expiresAt: { lt: new Date() }, ...(customerId ? { customerId } : {}) },
    data: { status: 'EXPIRED' },
  });
}

export type VoucherWithTier = Voucher & { minTier: Tier | null };

/** Lý do khách không thể nhận/đổi voucher, hoặc null nếu hợp lệ */
export function voucherIneligibility(
  v: VoucherWithTier,
  customer: { tier: Tier | null },
  walletPoints: number,
  ownedCount: number,
  now = new Date(),
): string | null {
  if (!v.active) return 'Ưu đãi đã ngừng áp dụng';
  if (v.startDate && v.startDate > now) return 'Ưu đãi chưa bắt đầu';
  if (v.endDate && v.endDate < now) return 'Ưu đãi đã kết thúc';
  if (v.totalQuantity !== null && v.issuedCount >= v.totalQuantity) return 'Ưu đãi đã hết lượt';
  if (ownedCount >= v.perCustomerLimit) return 'Bạn đã nhận tối đa ưu đãi này';
  if (v.minTier && (customer.tier?.minSpent ?? -1) < v.minTier.minSpent) return `Dành cho hạng ${v.minTier.name} trở lên`;
  if (v.pointCost > walletPoints) return `Cần ${v.pointCost} điểm`;
  return null;
}

/**
 * Phát voucher cho khách: CLAIM (nhận miễn phí), REDEEM (đổi điểm), GIFT (nhà hàng tặng – bỏ qua điều kiện điểm/hạng).
 * Voucher phải thuộc `brandId`; điểm trừ từ ví của thương hiệu đó.
 */
export async function issueVoucher(
  tx: Tx,
  input: { customerId: number; brandId: number; voucherId: number; source: 'CLAIM' | 'REDEEM' | 'GIFT'; adminId?: number },
) {
  const now = new Date();
  const v = await tx.voucher.findUnique({ where: { id: input.voucherId }, include: { minTier: true } });
  if (!v || v.brandId !== input.brandId) throw badRequest('Ưu đãi không tồn tại');
  const customer = await tx.customer.findUniqueOrThrow({ where: { id: input.customerId }, include: { tier: true } });
  const wallet = await ensureWallet(tx, customer.id, input.brandId);

  if (input.source === 'GIFT') {
    if (v.totalQuantity !== null && v.issuedCount >= v.totalQuantity) throw badRequest('Ưu đãi đã hết lượt');
  } else {
    const ownedCount = await tx.customerVoucher.count({ where: { customerId: customer.id, voucherId: v.id } });
    const reason = voucherIneligibility(v, customer, wallet.points, ownedCount, now);
    if (reason) throw badRequest(reason);
    if (input.source === 'CLAIM' && v.pointCost > 0) throw badRequest('Ưu đãi này cần đổi bằng điểm');
    if (input.source === 'REDEEM' && v.pointCost <= 0) throw badRequest('Ưu đãi này nhận miễn phí');
  }

  // Tăng issuedCount có điều kiện để tránh phát vượt số lượng khi nhiều người nhận cùng lúc
  const inc = await tx.voucher.updateMany({
    where: { id: v.id, ...(v.totalQuantity !== null ? { issuedCount: { lt: v.totalQuantity } } : {}) },
    data: { issuedCount: { increment: 1 } },
  });
  if (inc.count === 0) throw badRequest('Ưu đãi đã hết lượt');

  let expiresAt = new Date(now.getTime() + v.validDays * DAY);
  if (v.endDate && v.endDate < expiresAt) expiresAt = v.endDate;

  const pointsSpent = input.source === 'REDEEM' ? v.pointCost : 0;
  if (pointsSpent > 0) {
    await changePoints(tx, {
      customerId: customer.id,
      brandId: input.brandId,
      points: -pointsSpent,
      type: 'REDEEM',
      description: `Đổi ưu đãi: ${v.title}`,
    });
  }

  return tx.customerVoucher.create({
    data: {
      code: voucherCode(),
      brandId: input.brandId,
      customerId: customer.id,
      voucherId: v.id,
      source: input.source,
      pointsSpent,
      expiresAt,
    },
    include: { voucher: true },
  });
}

/** Hạng hiện tại / hạng kế tiếp (theo tổng chi tiêu) để hiển thị tiến trình */
export async function membershipInfo(customer: { totalSpent: number; tier: Tier | null }) {
  const nextTier = await prisma.tier.findFirst({
    where: { minSpent: { gt: customer.totalSpent } },
    orderBy: { minSpent: 'asc' },
  });
  return {
    tier: customer.tier,
    nextTier,
    amountToNextTier: nextTier ? nextTier.minSpent - customer.totalSpent : 0,
  };
}
