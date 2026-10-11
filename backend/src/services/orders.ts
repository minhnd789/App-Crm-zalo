import { prisma } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';
import { orderCode } from '../lib/codes.js';
import { sendOAMessage } from '../lib/zalo.js';
import { changePoints, pointsForAmount, voucherDiscountAmount } from './loyalty.js';
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
}

const vnd = (n: number) => n.toLocaleString('vi-VN') + 'đ';

export const orderInclude = {
  items: true,
  branch: true,
  usedVoucher: { include: { voucher: true } },
  customer: { include: { tier: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

/** Tạo hoá đơn (khách đã ăn xong), áp voucher, cộng điểm và xét thăng hạng */
export async function createOrder(input: CreateOrderInput, adminId: number) {
  const pointPerAmount = await getNumberSetting('pointPerAmount');

  const result = await prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: input.customerId }, include: { tier: true } });
    if (!customer) throw notFound('Khách hàng không tồn tại');

    const itemsTotal = input.items.reduce((s, i) => s + i.quantity * i.price, 0);
    const subtotal = input.items.length > 0 ? itemsTotal : (input.subtotal ?? 0);
    if (subtotal <= 0) throw badRequest('Tổng tiền hoá đơn phải lớn hơn 0');
    const discount = Math.min(input.discount ?? 0, subtotal);
    const base = subtotal - discount;

    // Voucher
    let customerVoucherId: number | null = null;
    let voucherDiscount = 0;
    if (input.voucherCode) {
      const cv = await tx.customerVoucher.findUnique({
        where: { code: input.voucherCode.trim().toUpperCase() },
        include: { voucher: true },
      });
      if (!cv || cv.customerId !== customer.id) throw badRequest('Mã voucher không thuộc về khách hàng này');
      if (cv.status !== 'AVAILABLE') throw badRequest('Voucher đã được sử dụng hoặc hết hạn');
      if (cv.expiresAt < new Date()) throw badRequest('Voucher đã hết hạn');
      if (base < cv.voucher.minOrder) throw badRequest(`Voucher áp dụng cho hoá đơn từ ${vnd(cv.voucher.minOrder)}`);
      voucherDiscount = voucherDiscountAmount(cv.voucher, base);
      customerVoucherId = cv.id;
    }
    const total = base - voucherDiscount;

    // Booking
    if (input.bookingId) {
      const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
      if (!booking || booking.customerId !== customer.id) throw badRequest('Lịch đặt bàn không thuộc về khách hàng này');
      if (!['PENDING', 'CONFIRMED', 'ARRIVED'].includes(booking.status)) {
        throw badRequest('Lịch đặt bàn đã kết thúc hoặc bị huỷ, không thể gắn vào hoá đơn');
      }
      await tx.booking.update({ where: { id: booking.id }, data: { status: 'COMPLETED' } });
    }

    const pointsEarned = pointsForAmount(total, pointPerAmount, customer.tier?.pointMultiplier ?? 1);
    const order = await tx.order.create({
      data: {
        code: orderCode(),
        customerId: customer.id,
        branchId: input.branchId ?? null,
        bookingId: input.bookingId ?? null,
        subtotal,
        discount,
        voucherDiscount,
        total,
        pointsEarned,
        note: input.note ?? null,
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

    await tx.customer.update({
      where: { id: customer.id },
      data: { totalSpent: { increment: total }, visitCount: { increment: 1 }, lastVisitAt: new Date() },
    });

    const points = await changePoints(tx, {
      customerId: customer.id,
      points: pointsEarned,
      type: 'EARN',
      description: `Tích điểm hoá đơn ${order.code}`,
      orderId: order.id,
      adminId,
    });

    return { orderId: order.id, pointsEarned, total, tierUp: points.tierUp, customer: points.customer };
  });

  const order = await prisma.order.findUniqueOrThrow({ where: { id: result.orderId }, include: orderInclude });

  const target = result.customer.zaloOAId;
  if (target) {
    let msg = `Cảm ơn bạn đã dùng bữa! Hoá đơn ${order.code}: ${vnd(result.total)}. Bạn được cộng ${result.pointsEarned} điểm, tổng điểm hiện có: ${result.customer.points}.`;
    if (result.tierUp && result.customer.tier) msg += ` Chúc mừng bạn đã lên hạng ${result.customer.tier.name}!`;
    void sendOAMessage(target, msg);
  }

  return { order, tierUp: result.tierUp };
}

/** Huỷ hoá đơn: trừ lại điểm đã cộng, trả lại voucher, giảm tổng chi tiêu */
export async function cancelOrder(orderId: number, adminId: number) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { usedVoucher: true } });
    if (!order) throw notFound('Hoá đơn không tồn tại');
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

    if (order.pointsEarned > 0) {
      await changePoints(tx, {
        customerId: order.customerId,
        points: -order.pointsEarned,
        lifetimeDelta: -order.pointsEarned,
        type: 'REFUND',
        description: `Huỷ hoá đơn ${order.code}`,
        orderId: order.id,
        adminId,
        allowNegative: true,
      });
    }
  });
  return prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
}
