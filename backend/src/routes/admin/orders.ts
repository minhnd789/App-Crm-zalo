import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { notFound } from '../../lib/errors.js';
import { idParam, paging } from '../../lib/http.js';
import { assertBrandAccess, brandForWrite, brandWhere, requireManager } from '../../lib/auth.js';
import { cancelOrder, orderInclude } from '../../services/orders.js';

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
    ...brandWhere(req),
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
      include: {
        branch: true,
        brand: { select: { id: true, name: true, primaryColor: true } },
        customer: { select: { id: true, name: true, phone: true } },
        createdBy: { select: { name: true } },
      },
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
  assertBrandAccess(req, o.brandId, 'Hoá đơn không tồn tại');
  res.json(o);
});

// Hoá đơn chỉ được tạo từ phần mềm bán hàng (r_keeper qua DCorp) – trang quản trị chỉ xem và huỷ để điều chỉnh.

ordersRouter.post('/:id/cancel', requireManager, async (req, res) => {
  const id = idParam(req.params.id);
  const o = await prisma.order.findUnique({ where: { id } });
  if (!o) throw notFound('Hoá đơn không tồn tại');
  assertBrandAccess(req, o.brandId, 'Hoá đơn không tồn tại');
  await brandForWrite(req, o.brandId);
  res.json(await cancelOrder(o.brandId, id, req.admin!.id));
});
