import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { idParam, paging } from '../../lib/http.js';
import { assertBrandAccess, brandForWrite, brandWhere, requireManager } from '../../lib/auth.js';
import { processOutbox, processPosBill, type PosBill } from '../../services/pos.js';

/** Nhật ký đồng bộ phần mềm bán hàng (r_keeper) – xem, gửi lại, gán khách cho bill chưa khớp */
export const posAdminRouter = Router();

posAdminRouter.get('/logs', async (req, res) => {
  const { page, pageSize, skip, take } = paging(req.query);
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  const q = str(req.query.q);
  const where: Prisma.PosSyncLogWhereInput = {
    ...brandWhere(req),
    ...(str(req.query.direction) ? { direction: str(req.query.direction) } : {}),
    ...(str(req.query.status) ? { status: str(req.query.status) } : {}),
    ...(str(req.query.type) ? { type: str(req.query.type) } : {}),
    ...(q ? { externalId: { contains: q } } : {}),
  };
  const [items, total, counts] = await Promise.all([
    prisma.posSyncLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { brand: { select: { id: true, name: true, primaryColor: true } } },
    }),
    prisma.posSyncLog.count({ where }),
    prisma.posSyncLog.groupBy({ by: ['status'], where: brandWhere(req), _count: { _all: true } }),
  ]);
  // Gắn tên khách / mã hoá đơn để hiển thị
  const customerIds = [...new Set(items.map((i) => i.customerId).filter((x): x is number => !!x))];
  const orderIds = [...new Set(items.map((i) => i.orderId).filter((x): x is number => !!x))];
  const [customers, orders] = await Promise.all([
    prisma.customer.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true, phone: true } }),
    prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, code: true, total: true, pointsEarned: true, status: true } }),
  ]);
  res.json({
    items: items.map((i) => ({
      ...i,
      customer: customers.find((c) => c.id === i.customerId) ?? null,
      order: orders.find((o) => o.id === i.orderId) ?? null,
    })),
    total,
    page,
    pageSize,
    statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
  });
});

/**
 * Gửi lại / xử lý lại 1 bản ghi:
 * - OUT (khách → POS): đưa lại vào hàng đợi và gửi ngay.
 * - IN (bill chưa khớp / lỗi): xử lý lại; có thể truyền `customerId` để gán khách cho bill không có thông tin thành viên.
 */
posAdminRouter.post('/logs/:id/retry', requireManager, async (req, res) => {
  const { customerId } = z.object({ customerId: z.number().int().positive().optional() }).parse(req.body ?? {});
  const log = await prisma.posSyncLog.findUnique({ where: { id: idParam(req.params.id) }, include: { brand: true } });
  if (!log) throw notFound('Không tìm thấy bản ghi');
  assertBrandAccess(req, log.brandId, 'Không tìm thấy bản ghi');
  await brandForWrite(req, log.brandId);

  if (log.direction === 'OUT') {
    await prisma.posSyncLog.update({
      where: { id: log.id },
      data: { status: 'PENDING', nextRetryAt: new Date(), ...(log.status === 'FAILED' ? { attempts: 0 } : {}) },
    });
    await processOutbox();
  } else {
    if (!['UNMATCHED', 'FAILED'].includes(log.status)) throw badRequest('Chỉ xử lý lại bill chưa khớp hoặc bị lỗi');
    if (customerId && !(await prisma.customer.findUnique({ where: { id: customerId } }))) throw badRequest('Khách hàng không tồn tại');
    const raw = JSON.parse(log.payload) as PosBill & { paidAt?: string };
    const bill: PosBill = { ...raw, paidAt: raw.paidAt ? new Date(raw.paidAt) : undefined };
    try {
      await processPosBill(log.brand, bill, { logId: log.id, customerId });
    } catch {
      /* lỗi đã ghi vào nhật ký */
    }
  }
  res.json(await prisma.posSyncLog.findUniqueOrThrow({ where: { id: log.id } }));
});
