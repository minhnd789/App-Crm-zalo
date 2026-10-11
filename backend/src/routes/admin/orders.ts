import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { notFound } from '../../lib/errors.js';
import { idParam, paging } from '../../lib/http.js';
import { requireManager } from '../../lib/auth.js';
import { cancelOrder, createOrder, orderInclude } from '../../services/orders.js';

export const ordersRouter = Router();

ordersRouter.get('/', async (req, res) => {
  const { page, pageSize, skip, take } = paging(req.query);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  const status = typeof req.query.status === 'string' && req.query.status ? req.query.status : undefined;
  const from = typeof req.query.from === 'string' && req.query.from ? new Date(req.query.from) : undefined;
  const to = typeof req.query.to === 'string' && req.query.to ? new Date(req.query.to) : undefined;
  const where: Prisma.OrderWhereInput = {
    ...(customerId ? { customerId } : {}),
    ...(branchId ? { branchId } : {}),
    ...(status ? { status } : {}),
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
    ...(q
      ? { OR: [{ code: { contains: q } }, { customer: { name: { contains: q } } }, { customer: { phone: { contains: q } } }] }
      : {}),
  };
  const [items, total, sum] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { branch: true, customer: { select: { id: true, name: true, phone: true } }, createdBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.order.count({ where }),
    prisma.order.aggregate({ where: { ...where, status: 'COMPLETED' }, _sum: { total: true, pointsEarned: true } }),
  ]);
  res.json({ items, total, page, pageSize, sumTotal: sum._sum.total ?? 0, sumPoints: sum._sum.pointsEarned ?? 0 });
});

ordersRouter.get('/:id', async (req, res) => {
  const o = await prisma.order.findUnique({ where: { id: idParam(req.params.id) }, include: orderInclude });
  if (!o) throw notFound('Hoá đơn không tồn tại');
  res.json(o);
});

const itemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().int().min(1),
  price: z.number().int().min(0),
});

const createSchema = z
  .object({
    customerId: z.number().int().positive(),
    branchId: z.number().int().positive().nullable().optional(),
    bookingId: z.number().int().positive().nullable().optional(),
    items: z.array(itemSchema).default([]),
    /** Dùng khi không nhập từng món – chỉ nhập tổng tiền từ máy POS */
    subtotal: z.number().int().min(0).optional(),
    discount: z.number().int().min(0).default(0),
    voucherCode: z.string().trim().nullable().optional(),
    note: z.string().max(1000).nullable().optional(),
  })
  .refine((v) => v.items.length > 0 || (v.subtotal ?? 0) > 0, { message: 'Nhập danh sách món hoặc tổng tiền', path: ['items'] });

ordersRouter.post('/', async (req, res) => {
  const body = createSchema.parse(req.body);
  res.status(201).json(await createOrder(body, req.admin!.id));
});

ordersRouter.post('/:id/cancel', requireManager, async (req, res) => {
  res.json(await cancelOrder(idParam(req.params.id), req.admin!.id));
});
