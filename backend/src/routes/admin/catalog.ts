import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { idParam, optionalDate } from '../../lib/http.js';
import { requireManager, requireSuperAdmin } from '../../lib/auth.js';
import { tierForSpent } from '../../services/loyalty.js';

// ---------- Chương trình ưu đãi (theo thương hiệu) ----------
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

async function ownPromotion(id: number, brandId: number) {
  const p = await prisma.promotion.findUnique({ where: { id } });
  if (!p || p.brandId !== brandId) throw notFound('Chương trình không tồn tại');
}

promotionsRouter.get('/', async (req, res) => {
  res.json(await prisma.promotion.findMany({ where: { brandId: req.brand!.id }, orderBy: { createdAt: 'desc' } }));
});
promotionsRouter.post('/', requireManager, async (req, res) => {
  res.status(201).json(await prisma.promotion.create({ data: { ...promotionSchema.parse(req.body), brandId: req.brand!.id } }));
});
promotionsRouter.put('/:id', requireManager, async (req, res) => {
  const id = idParam(req.params.id);
  await ownPromotion(id, req.brand!.id);
  res.json(await prisma.promotion.update({ where: { id }, data: promotionSchema.partial().parse(req.body) }));
});
promotionsRouter.delete('/:id', requireManager, async (req, res) => {
  const id = idParam(req.params.id);
  await ownPromotion(id, req.brand!.id);
  await prisma.promotion.delete({ where: { id } });
  res.json({ deleted: true });
});

// ---------- Chi nhánh (theo thương hiệu) ----------
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

async function ownBranch(id: number, brandId: number) {
  const b = await prisma.branch.findUnique({ where: { id } });
  if (!b || b.brandId !== brandId) throw notFound('Chi nhánh không tồn tại');
}

branchesRouter.get('/', async (req, res) => {
  res.json(await prisma.branch.findMany({ where: { brandId: req.brand!.id }, orderBy: { id: 'asc' } }));
});
branchesRouter.post('/', requireManager, async (req, res) => {
  res.status(201).json(await prisma.branch.create({ data: { ...branchSchema.parse(req.body), brandId: req.brand!.id } }));
});
branchesRouter.put('/:id', requireManager, async (req, res) => {
  const id = idParam(req.params.id);
  await ownBranch(id, req.brand!.id);
  res.json(await prisma.branch.update({ where: { id }, data: branchSchema.partial().parse(req.body) }));
});
branchesRouter.delete('/:id', requireManager, async (req, res) => {
  const id = idParam(req.params.id);
  await ownBranch(id, req.brand!.id);
  const used = (await prisma.booking.count({ where: { branchId: id } })) + (await prisma.order.count({ where: { branchId: id } }));
  if (used > 0) {
    await prisma.branch.update({ where: { id }, data: { active: false } });
    res.json({ deleted: false, deactivated: true });
    return;
  }
  await prisma.branch.delete({ where: { id } });
  res.json({ deleted: true });
});

// ---------- Hạng thành viên (dùng chung mọi thương hiệu) ----------
export const tiersRouter = Router();

const tierSchema = z.object({
  name: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(50).toUpperCase(),
  minSpent: z.number().int().min(0),
  pointMultiplier: z.number().min(0).max(100).default(1),
  benefits: z.string().max(5000).nullable().optional(),
  color: z.string().max(20).default('#9E9E9E'),
});

/** Xếp lại hạng cho toàn bộ khách sau khi thay đổi cấu hình hạng */
async function recalcAllTiers() {
  const customers = await prisma.customer.findMany({ select: { id: true, totalSpent: true, tierId: true } });
  await prisma.$transaction(async (tx) => {
    for (const c of customers) {
      const t = await tierForSpent(tx, c.totalSpent);
      if ((t?.id ?? null) !== c.tierId) await tx.customer.update({ where: { id: c.id }, data: { tierId: t?.id ?? null } });
    }
  });
}

tiersRouter.get('/', async (_req, res) => {
  res.json(await prisma.tier.findMany({ orderBy: { minSpent: 'asc' }, include: { _count: { select: { customers: true } } } }));
});
tiersRouter.post('/', requireSuperAdmin, async (req, res) => {
  const t = await prisma.tier.create({ data: tierSchema.parse(req.body) });
  await recalcAllTiers();
  res.status(201).json(t);
});
tiersRouter.put('/:id', requireSuperAdmin, async (req, res) => {
  const t = await prisma.tier.update({ where: { id: idParam(req.params.id) }, data: tierSchema.partial().parse(req.body) });
  await recalcAllTiers();
  res.json(t);
});
tiersRouter.delete('/:id', requireSuperAdmin, async (req, res) => {
  const id = idParam(req.params.id);
  if ((await prisma.voucher.count({ where: { minTierId: id } })) > 0) {
    throw badRequest('Hạng đang được dùng làm điều kiện voucher, hãy sửa voucher trước');
  }
  await prisma.customer.updateMany({ where: { tierId: id }, data: { tierId: null } });
  await prisma.tier.delete({ where: { id } });
  await recalcAllTiers();
  res.json({ deleted: true });
});
