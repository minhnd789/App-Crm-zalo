import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest } from '../../lib/errors.js';
import { idParam, optionalDate } from '../../lib/http.js';
import { requireManager } from '../../lib/auth.js';
import { tierFor } from '../../services/loyalty.js';

// ---------- Chương trình ưu đãi ----------
export const promotionsRouter = Router();

const promotionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().max(500).nullable().optional(),
  content: z.string().max(20000).nullable().optional(),
  imageUrl: z.string().max(1000).nullable().optional(),
  startDate: optionalDate,
  endDate: optionalDate,
  featured: z.boolean().default(false),
  active: z.boolean().default(true),
});

promotionsRouter.get('/', async (_req, res) => {
  res.json(await prisma.promotion.findMany({ orderBy: { createdAt: 'desc' } }));
});
promotionsRouter.post('/', requireManager, async (req, res) => {
  res.status(201).json(await prisma.promotion.create({ data: promotionSchema.parse(req.body) }));
});
promotionsRouter.put('/:id', requireManager, async (req, res) => {
  res.json(await prisma.promotion.update({ where: { id: idParam(req.params.id) }, data: promotionSchema.partial().parse(req.body) }));
});
promotionsRouter.delete('/:id', requireManager, async (req, res) => {
  await prisma.promotion.delete({ where: { id: idParam(req.params.id) } });
  res.json({ deleted: true });
});

// ---------- Chi nhánh ----------
export const branchesRouter = Router();

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Định dạng giờ HH:mm');
const branchSchema = z.object({
  name: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1).max(500),
  phone: z.string().max(20).nullable().optional(),
  openTime: hhmm.default('10:00'),
  closeTime: hhmm.default('22:00'),
  imageUrl: z.string().max(1000).nullable().optional(),
  active: z.boolean().default(true),
});

branchesRouter.get('/', async (_req, res) => {
  res.json(await prisma.branch.findMany({ orderBy: { id: 'asc' } }));
});
branchesRouter.post('/', requireManager, async (req, res) => {
  res.status(201).json(await prisma.branch.create({ data: branchSchema.parse(req.body) }));
});
branchesRouter.put('/:id', requireManager, async (req, res) => {
  res.json(await prisma.branch.update({ where: { id: idParam(req.params.id) }, data: branchSchema.partial().parse(req.body) }));
});
branchesRouter.delete('/:id', requireManager, async (req, res) => {
  const id = idParam(req.params.id);
  const used = (await prisma.booking.count({ where: { branchId: id } })) + (await prisma.order.count({ where: { branchId: id } }));
  if (used > 0) {
    await prisma.branch.update({ where: { id }, data: { active: false } });
    res.json({ deleted: false, deactivated: true });
    return;
  }
  await prisma.branch.delete({ where: { id } });
  res.json({ deleted: true });
});

// ---------- Hạng thành viên ----------
export const tiersRouter = Router();

const tierSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(50).toUpperCase(),
  minPoints: z.number().int().min(0),
  pointMultiplier: z.number().min(0).max(100).default(1),
  benefits: z.string().max(5000).nullable().optional(),
  color: z.string().max(20).default('#9E9E9E'),
});

/** Xếp lại hạng cho toàn bộ khách sau khi thay đổi cấu hình hạng */
async function recalcAllTiers() {
  const customers = await prisma.customer.findMany({ select: { id: true, lifetimePoints: true, tierId: true } });
  await prisma.$transaction(async (tx) => {
    for (const c of customers) {
      const t = await tierFor(tx, c.lifetimePoints);
      if ((t?.id ?? null) !== c.tierId) await tx.customer.update({ where: { id: c.id }, data: { tierId: t?.id ?? null } });
    }
  });
}

tiersRouter.get('/', async (_req, res) => {
  res.json(
    await prisma.tier.findMany({ orderBy: { minPoints: 'asc' }, include: { _count: { select: { customers: true } } } }),
  );
});
tiersRouter.post('/', requireManager, async (req, res) => {
  const t = await prisma.tier.create({ data: tierSchema.parse(req.body) });
  await recalcAllTiers();
  res.status(201).json(t);
});
tiersRouter.put('/:id', requireManager, async (req, res) => {
  const t = await prisma.tier.update({ where: { id: idParam(req.params.id) }, data: tierSchema.partial().parse(req.body) });
  await recalcAllTiers();
  res.json(t);
});
tiersRouter.delete('/:id', requireManager, async (req, res) => {
  const id = idParam(req.params.id);
  if ((await prisma.voucher.count({ where: { minTierId: id } })) > 0) {
    throw badRequest('Hạng đang được dùng làm điều kiện voucher, hãy sửa voucher trước');
  }
  await prisma.customer.updateMany({ where: { tierId: id }, data: { tierId: null } });
  await prisma.tier.delete({ where: { id } });
  await recalcAllTiers();
  res.json({ deleted: true });
});
