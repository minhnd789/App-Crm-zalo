import type { Brand } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';
import { orderCode } from '../lib/codes.js';
import { sendOAMessage } from '../lib/zalo.js';
import { changePoints, ensureWallet, pointsForAmount, recomputeTier, voucherDiscountAmount } from './loyalty.js';
import { getNumberSetting } from './settings.js';

export interface CreateOrderInput {
  customerId: number;
  branchId?: number | null;
  bookingId?: number | null;
  items: { name: string; quantity: number; price: number }[];
  subtotal?: number;
  discount?: number;
  voucherCode?: string | null;
  note?: string | null;
  /** Đồng bộ từ phần mềm bán hàng (POS) – dùng sau này cho r_keeper */
  source?: 'ADMIN' | 'POS';
  externalId?: string | null;
}

const vnd = (n: number) => n.toLocaleString('vi-VN') + 'đ';

export const orderInclude = {
  items: true,
  branch: true,
  brand: { select: { id: true, name: true, code: true } },
  usedVoucher: { include: { voucher: true } },
  customer: { include: { tier: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

/** Tạo hoá đơn tại 1 thương hiệu: áp voucher, cộng điểm vào ví thương hiệu, cộng tổng chi tiêu và xét hạng chung */
export async function createOrder(brand: Brand, input: CreateOrderInput, adminId: number | null) {
  const pointPerAmount = await getNumberSetting(brand.id, 'pointPerAmount');

  const result = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: input.customerId }, include: { tier: true } });
    if (!customer) throw notFound('Khách hàng không tồn tại');

    if (input.branchId) {
      const branch = await tx.branch.findUnique({ where: { id: input.branchId } });
      if (!branch || branch.brandId !== brand.id) throw badRequest('Chi nhánh không thuộc thương hiệu này');
    }

    const itemsTotal = input.items.reduce((s, i) => s + i.quantity * i.price, 0);
    const subtotal = input.items.length > 0 ? itemsTotal : (input.subtotal ?? 0);
    if (subtotal <= 0) throw badRequest('Tổng tiền hoá đơn phải lớn hơn 0');
    const discount = Math.min(input.discount ?? 0, subtotal);
    const base = subtotal - discount;

    // Voucher – chỉ dùng được tại thương hiệu phát hành
    let customerVoucherId: number | null = null;
    let voucherDiscount = 0;
    if (input.voucherCode) {
      const cv = await tx.customerVoucher.findUnique({
        where: { code: input.voucherCode.trim().toUpperCase() },
        include: { voucher: true },
      });
      if (!cv || cv.customerId !== customer.id) throw badRequest('Mã voucher không thuộc về khách hàng này');
      if (cv.brandId !== brand.id) throw badRequest('Voucher không áp dụng cho thương hiệu này');
      if (cv.status !== 'AVAILABLE') throw badRequest('Voucher đã được sử dụng hoặc hết hạn');
      if (cv.expiresAt < new Date()) throw badRequest('Voucher đã hết hạn');
      if (base < cv.voucher.minOrder) throw badRequest(`Voucher áp dụng cho hoá đơn từ ${vnd(cv.voucher.minOrder)}`);
      voucherDiscount = voucherDiscountAmount(cv.voucher, base);
      customerVoucherId = cv.id;
    }
    const total = base - voucherDiscount;

    if (input.bookingId) {
      const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
      if (!booking || booking.customerId !== customer.id || booking.brandId !== brand.id) {
        throw badRequest('Lịch đặt bàn không thuộc về khách hàng này');
      }
      if (!['PENDING', 'CONFIRMED', 'ARRIVED'].includes(booking.status)) {
        throw badRequest('Lịch đặt bàn đã kết thúc hoặc bị huỷ, không thể gắn vào hoá đơn');
      }
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'COMPLETED' } });
    }

    // Điểm tính theo hạng hiện tại (trước khi cộng chi tiêu của hoá đơn này)
    const pointsEarned = pointsForAmount(total, pointPerAmount, customer.tier?.pointMultiplier ?? 1);
    const order = await tx.order.create({
      data: {
        code: orderCode(),
        brandId: brand.id,
        customerId: customer.id,
        branchId: input.branchId ?? null,
        bookingId: input.bookingId ?? null,
        subtotal,
        discount,
        voucherDiscount,
        total,
        pointsEarned,
        note: input.note ?? null,
        source: input.source ?? 'ADMIN',
        externalId: input.externalId ?? null,
        createdById: adminId,
        items: { create: input.items },
      },
    });

    if (customerVoucherId) {
      // updateMany có điều kiện status để không dùng 1 voucher 2 lần khi 2 hoá đơn tạo đồng thời
      const used = await tx.customerVoucher.updateMany({
        where: { id: customerVoucherId, status: 'AVAILABLE' },
        data: { status: 'USED', usedAt: new Date(), orderId: order.id },
      });
      if (used.count === 0) throw badRequest('Voucher đã được sử dụng');
    }

    const now = new Date();
    await tx.customer.update({
      where: { id: customer.id },
      data: { totalSpent: { increment: total }, visitCount: { increment: 1 }, lastVisitAt: now },
    });
    const wallet = await ensureWallet(tx, customer.id, brand.id);
    await tx.customerWallet.update({
      where: { id: wallet.id },
      data: { totalSpent: { increment: total }, visitCount: { increment: 1 }, lastVisitAt: now },
    });

    const updatedWallet = await changePoints(tx, {
      customerId: customer.id,
      brandId: brand.id,
      points: pointsEarned,
      type: 'EARN',
      description: `Tích điểm hoá đơn ${order.code}`,
      orderId: order.id,
      adminId: adminId ?? undefined,
    });
    const tierResult = await recomputeTier(tx, customer.id);

    return { orderId: order.id, pointsEarned, total, balance: updatedWallet.points, ...tierResult };
  });

  const order = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId }, include: orderInclude });

  const account = await prisma.customerZaloAccount.findUnique({
    where: { customerId_brandId: { customerId: order.customerId, brandId: brand.id } },
  });
  if (account?.zaloOAId) {
    let msg = `Cảm ơn bạn đã dùng bữa tại ${brand.name}! Hoá đơn ${order.code}: ${vnd(result.total)}. Bạn được cộng ${result.pointsEarned} điểm, điểm hiện có: ${result.balance}.`;
    if (result.tierUp && result.tier) msg += ` Chúc mừng bạn đã lên hạng ${result.tier.name}!`;
    void sendOAMessage(brand.zaloOaAccessToken, account.zaloOAId, msg);
  }

  return { order, tierUp: result.tierUp, tier: result.tier, balance: result.balance };
}

/** Huỷ hoá đơn: trừ lại điểm đã cộng, trả lại voucher, giảm tổng chi tiêu và xét lại hạng */
export async function cancelOrder(brandId: number, orderId: number, adminId: number) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { usedVoucher: true } });
    if (!order || order.brandId !== brandId) throw notFound('Hoá đơn không tồn tại');
    if (order.status === 'CANCELLED') throw badRequest('Hoá đơn đã bị huỷ trước đó');

    await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });

    // Trả lịch đặt bàn về trạng thái "Đã đến" nếu không còn hoá đơn hợp lệ nào gắn với nó
    if (order.bookingId) {
      const others = await tx.order.count({ where: { bookingId: order.bookingId, status: 'COMPLETED' } });
      if (others === 0) {
        await tx.booking.updateMany({ where: { id: order.bookingId, status: 'COMPLETED' }, data: { status: 'ARRIVED' } });
      }
    }

    if (order.usedVoucher) {
      const expired = order.usedVoucher.expiresAt < new Date();
      await tx.customerVoucher.update({
        where: { id: order.usedVoucher.id },
        data: { status: expired ? 'EXPIRED' : 'AVAILABLE', usedAt: null, orderId: null },
      });
    }

    await tx.customer.update({
      where: { id: order.customerId },
      data: { totalSpent: { decrement: order.total }, visitCount: { decrement: 1 } },
    });
    await tx.customerWallet.update({
      where: { customerId_brandId: { customerId: order.customerId, brandId } },
      data: { totalSpent: { decrement: order.total }, visitCount: { decrement: 1 } },
    });

    if (order.pointsEarned > 0) {
      await changePoints(tx, {
        customerId: order.customerId,
        brandId,
        points: -order.pointsEarned,
        type: 'REFUND',
        description: `Huỷ hoá đơn ${order.code}`,
        orderId: order.id,
        adminId,
        allowNegative: true,
      });
    }
    await recomputeTier(tx, order.customerId);
  });
  return prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
}
