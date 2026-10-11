import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { idParam, paging } from '../../lib/http.js';
import { sendOAMessage } from '../../lib/zalo.js';
import { BOOKING_STATUSES, BOOKING_STATUS_LABEL } from '../../services/bookings.js';

export const bookingsRouter = Router();

bookingsRouter.get('/', async (req, res) => {
  const { page, pageSize, skip, take } = paging(req.query);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  // from/to: ISO datetime (client tự tính đầu/cuối ngày theo giờ địa phương)
  const from = typeof req.query.from === 'string' && req.query.from ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === 'string' && req.query.to ? new Date(req.query.to) : undefined;
  const where: Prisma.BookingWhereInput = {
    brandId: req.brand!.id,
    ...(status ? { status } : {}),
    ...(branchId ? { branchId } : {}),
    ...(from || to ? { bookingTime: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    ...(q ? { OR: [{ code: { contains: q } }, { contactName: { contains: q } }, { contactPhone: { contains: q } }] } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: { branch: true, customer: { select: { id: true, name: true, phone: true, memberCode: true } } },
      orderBy: { bookingTime: req.query.order === 'desc' ? 'desc' : 'asc' },
      skip,
      take,
    }),
    prisma.booking.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

bookingsRouter.get('/:id', async (req, res) => {
  const b = await prisma.booking.findFirst({
    where: { id: idParam(req.params.id), brandId: req.brand!.id },
    include: { branch: true, customer: { include: { tier: true } }, orders: true },
  });
  if (!b) throw notFound('Lịch đặt bàn không tồn tại');
  res.json(b);
});

const TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ARRIVED', 'CANCELLED', 'NO_SHOW', 'PENDING'],
  ARRIVED: ['COMPLETED', 'CONFIRMED'],
  COMPLETED: [],
  CANCELLED: ['PENDING'],
  NO_SHOW: ['CONFIRMED'],
};

bookingsRouter.patch('/:id', async (req, res) => {
  const body = z
    .object({
      status: z.enum(BOOKING_STATUSES).optional(),
      adminNote: z.string().max(1000).nullable().optional(),
      notify: z.boolean().default(true),
    })
    .parse(req.body);
  const brand = req.brand!;
  const b = await prisma.booking.findFirst({ where: { id: idParam(req.params.id), brandId: brand.id } });
  if (!b) throw notFound('Lịch đặt bàn không tồn tại');
  if (body.status && body.status !== b.status && !TRANSITIONS[b.status]?.includes(body.status)) {
    throw badRequest(
      `Không thể chuyển từ "${BOOKING_STATUS_LABEL[b.status as keyof typeof BOOKING_STATUS_LABEL]}" sang "${BOOKING_STATUS_LABEL[body.status]}"`,
    );
  }
  const updated = await prisma.booking.update({
    where: { id: b.id },
    data: { status: body.status, adminNote: body.adminNote },
    include: { branch: true, customer: { select: { id: true, name: true, phone: true } } },
  });

  const account = await prisma.customerZaloAccount.findUnique({
    where: { customerId_brandId: { customerId: b.customerId, brandId: brand.id } },
  });
  if (body.notify && body.status && body.status !== b.status && account?.zaloOAId) {
    const time = updated.bookingTime.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });
    const msgs: Partial<Record<string, string>> = {
      CONFIRMED: `${brand.name} đã xác nhận lịch đặt bàn ${updated.code} lúc ${time} cho ${updated.partySize} khách tại ${updated.branch.name}. Hẹn gặp bạn!`,
      CANCELLED: `Rất tiếc, lịch đặt bàn ${updated.code} lúc ${time} đã bị huỷ.${body.adminNote ? ` Lý do: ${body.adminNote}` : ''}`,
    };
    const msg = msgs[body.status];
    if (msg) void sendOAMessage(brand.zaloOaAccessToken, account.zaloOAId, msg);
  }
  res.json(updated);
});
