import type { Customer, Tier, Voucher } from '@prisma/client';
import { prisma, type Tx } from '../db.js';
import { badRequest } from '../lib/errors.js';
import { voucherCode } from '../lib/codes.js';

export type PointType = 'EARN' | 'REDEEM' | 'ADJUST' | 'REFUND' | 'WELCOME';

const DAY = 24 * 60 * 60 * 1000;

/** Hạng cao nhất mà khách đạt được với số điểm tích luỹ trọn đời */
export async function tierFor(tx: Tx, lifetimePoints: number): Promise<Tier | null> {
  return tx.tier.findFirst({ where: { minPoints: { lte: lifetimePoints } }, orderBy: { minPoints: 'desc' } });
}

/**
 * Cộng/trừ điểm cho khách trong 1 transaction và ghi lịch sử.
 * - `lifetimeDelta`: thay đổi điểm tích luỹ trọn đời (dùng để xét hạng). Mặc định = points nếu points > 0
 *   với các loại EARN/WELCOME, ngược lại 0.
 * - Không cho số dư âm trừ khi `allowNegative`.
 */
export async function changePoints(
  tx: Tx,
  input: {
    customerId: number;
    points: number;
    type: PointType;
    description: string;
    orderId?: number;
    adminId?: number;
    lifetimeDelta?: number;
    allowNegative?: boolean;
  },
) {
  const customer = await tx.customer.findUniqueOrThrow({ where: { id: input.customerId }, include: { tier: true } });
  const balance = customer.points + input.points;
  // Chỉ chặn khi đang trừ điểm; cộng điểm vào số dư âm (sau khi huỷ hoá đơn) vẫn được phép
  if (input.points < 0 && balance < 0 && !input.allowNegative) {
    throw badRequest(`Không đủ điểm (hiện có ${customer.points} điểm)`);
  }
  const lifetimeDelta =
    input.lifetimeDelta ?? (input.points > 0 && (input.type === 'EARN' || input.type === 'WELCOME') ? input.points : 0);
  const lifetimePoints = Math.max(0, customer.lifetimePoints + lifetimeDelta);
  const tier = await tierFor(tx, lifetimePoints);

  const updated = await tx.customer.update({
    where: { id: customer.id },
    data: { points: balance, lifetimePoints, tierId: tier?.id ?? null },
    include: { tier: true },
  });
  if (input.points !== 0) {
    await tx.pointTransaction.create({
      data: {
        customerId: customer.id,
        type: input.type,
        points: input.points,
        balanceAfter: balance,
        description: input.description,
        orderId: input.orderId,
        adminId: input.adminId,
      },
    });
  }
  const tierUp = !!tier && (customer.tier?.minPoints ?? -1) < tier.minPoints;
  return { customer: updated, tierUp, previousTier: customer.tier };
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

/**
 * Kiểm tra khách có thể nhận/đổi voucher không. Trả về lý do nếu không được, null nếu hợp lệ.
 */
export function voucherIneligibility(
  v: VoucherWithTier,
  customer: Pick<Customer, 'points'> & { tier: Tier | null },
  ownedCount: number,
  now = new Date(),
): string | null {
  if (!v.active) return 'Ưu đãi đã ngừng áp dụng';
  if (v.startDate && v.startDate > now) return 'Ưu đãi chưa bắt đầu';
  if (v.endDate && v.endDate < now) return 'Ưu đãi đã kết thúc';
  if (v.totalQuantity !== null && v.issuedCount >= v.totalQuantity) return 'Ưu đãi đã hết lượt';
  if (ownedCount >= v.perCustomerLimit) return 'Bạn đã nhận tối đa ưu đãi này';
  if (v.minTier && (customer.tier?.minPoints ?? -1) < v.minTier.minPoints) return `Dành cho hạng ${v.minTier.name} trở lên`;
  if (v.pointCost > customer.points) return `Cần ${v.pointCost} điểm`;
  return null;
}

/**
 * Phát voucher cho khách: CLAIM (nhận miễn phí), REDEEM (đổi điểm), GIFT (nhà hàng tặng – bỏ qua điều kiện điểm/hạng).
 */
export async function issueVoucher(
  tx: Tx,
  input: { customerId: number; voucherId: number; source: 'CLAIM' | 'REDEEM' | 'GIFT'; adminId?: number },
) {
  const now = new Date();
  const v = await tx.voucher.findUnique({ where: { id: input.voucherId }, include: { minTier: true } });
  if (!v) throw badRequest('Ưu đãi không tồn tại');
  const customer = await tx.customer.findUniqueOrThrow({ where: { id: input.customerId }, include: { tier: true } });

  if (input.source === 'GIFT') {
    if (v.totalQuantity !== null && v.issuedCount >= v.totalQuantity) throw badRequest('Ưu đãi đã hết lượt');
  } else {
    const ownedCount = await tx.customerVoucher.count({ where: { customerId: customer.id, voucherId: v.id } });
    const reason = voucherIneligibility(v, customer, ownedCount, now);
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
      points: -pointsSpent,
      type: 'REDEEM',
      description: `Đổi ưu đãi: ${v.title}`,
    });
  }

  return tx.customerVoucher.create({
    data: {
      code: voucherCode(),
      customerId: customer.id,
      voucherId: v.id,
      source: input.source,
      pointsSpent,
      expiresAt,
    },
    include: { voucher: true },
  });
}

/** Thông tin hạng hiện tại / hạng kế tiếp để hiển thị tiến trình */
export async function membershipInfo(customer: Pick<Customer, 'lifetimePoints'> & { tier: Tier | null }) {
  const nextTier = await prisma.tier.findFirst({
    where: { minPoints: { gt: customer.lifetimePoints } },
    orderBy: { minPoints: 'asc' },
  });
  return {
    tier: customer.tier,
    nextTier,
    pointsToNextTier: nextTier ? nextTier.minPoints - customer.lifetimePoints : 0,
  };
}
