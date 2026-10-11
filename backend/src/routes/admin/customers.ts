import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { idParam, optionalDate, paging, phoneSchema } from '../../lib/http.js';
import { changePoints, expireVouchers, issueVoucher, membershipInfo } from '../../services/loyalty.js';
import { requireManager } from '../../lib/auth.js';

export const customersRouter = Router();

customersRouter.get('/', async (req, res) => {
  const { page, pageSize, skip, take } = paging(req.query);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const tierId = req.query.tierId ? Number(req.query.tierId) : undefined;
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'createdAt';
  const where: Prisma.CustomerWhereInput = {
    ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }, { memberCode: { contains: q } }] } : {}),
    ...(tierId ? { tierId } : {}),
  };
  const orderBy: Prisma.CustomerOrderByWithRelationInput =
    sort === 'points'
      ? { points: 'desc' }
      : sort === 'totalSpent'
        ? { totalSpent: 'desc' }
        : sort === 'lastVisitAt'
          ? { lastVisitAt: { sort: 'desc', nulls: 'last' } }
          : { createdAt: 'desc' };
  const [items, total] = await Promise.all([
    prisma.customer.findMany({ where, include: { tier: true }, orderBy, skip, take }),
    prisma.customer.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

/** Tìm nhanh khách theo SĐT hoặc mã thành viên (quét QR) – dùng khi tạo hoá đơn */
customersRouter.get('/lookup', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) throw badRequest('Nhập số điện thoại hoặc mã thành viên');
  const normalizedPhone = q.replace(/[\s.-]/g, '').replace(/^\+?84/, '0');
  const c = await prisma.customer.findFirst({
    where: { OR: [{ memberCode: q }, { phone: normalizedPhone }] },
    include: { tier: true },
  });
  if (!c) throw notFound('Không tìm thấy khách hàng');
  await expireVouchers(c.id);
  const vouchers = await prisma.customerVoucher.findMany({
    where: { customerId: c.id, status: 'AVAILABLE' },
    include: { voucher: true },
    orderBy: { expiresAt: 'asc' },
  });
  const bookings = await prisma.booking.findMany({
    where: { customerId: c.id, status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED'] } },
    include: { branch: true },
    orderBy: { bookingTime: 'asc' },
  });
  res.json({ ...c, vouchers, bookings });
});

customersRouter.get('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  await expireVouchers(id);
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      tier: true,
      orders: { orderBy: { createdAt: 'desc' }, take: 50, include: { branch: true } },
      bookings: { orderBy: { bookingTime: 'desc' }, take: 50, include: { branch: true } },
      vouchers: { orderBy: { createdAt: 'desc' }, include: { voucher: true } },
      pointTransactions: {
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { admin: { select: { id: true, name: true } } },
      },
    },
  });
  if (!c) throw notFound('Khách hàng không tồn tại');
  res.json({ ...c, ...(await membershipInfo(c)) });
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: phoneSchema.nullable().optional(),
  birthday: optionalDate,
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

customersRouter.put('/:id', async (req, res) => {
  const data = updateSchema.parse(req.body);
  res.json(await prisma.customer.update({ where: { id: idParam(req.params.id) }, data, include: { tier: true } }));
});

/** Cộng/trừ điểm thủ công (chỉ quản lý) */
customersRouter.post('/:id/points', requireManager, async (req, res) => {
  const body = z
    .object({
      points: z.number().int().refine((n) => n !== 0, 'Số điểm phải khác 0'),
      description: z.string().trim().min(1, 'Vui lòng nhập lý do'),
      /** true = cũng tính vào điểm xét hạng */
      affectTier: z.boolean().default(false),
    })
    .parse(req.body);
  const result = await prisma.$transaction((tx) =>
    changePoints(tx, {
      customerId: idParam(req.params.id),
      points: body.points,
      type: 'ADJUST',
      description: body.description,
      adminId: req.admin!.id,
      lifetimeDelta: body.affectTier ? body.points : 0,
    }),
  );
  res.json(result);
});

/** Tặng voucher cho khách (bỏ qua điều kiện điểm/hạng) */
customersRouter.post('/:id/vouchers', async (req, res) => {
  const { voucherId } = z.object({ voucherId: z.number().int().positive() }).parse(req.body);
  const cv = await prisma.$transaction((tx) =>
    issueVoucher(tx, { customerId: idParam(req.params.id), voucherId, source: 'GIFT', adminId: req.admin!.id }),
  );
  res.status(201).json(cv);
});
