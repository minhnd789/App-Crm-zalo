import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { idParam, optionalDate, paging } from '../../lib/http.js';
import { requireManager } from '../../lib/auth.js';
import { expireVouchers, issueVoucher, voucherDiscountAmount } from '../../services/loyalty.js';

export const vouchersRouter = Router();

const voucherSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  imageUrl: z.string().max(1000).nullable().optional(),
  discountType: z.enum(['PERCENT', 'AMOUNT', 'GIFT']),
  discountValue: z.number().int().min(0).default(0),
  maxDiscount: z.number().int().min(0).nullable().optional(),
  minOrder: z.number().int().min(0).default(0),
  pointCost: z.number().int().min(0).default(0),
  totalQuantity: z.number().int().min(0).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).default(1),
  validDays: z.number().int().min(1).default(30),
  startDate: optionalDate,
  endDate: optionalDate,
  minTierId: z.number().int().positive().nullable().optional(),
  active: z.boolean().default(true),
});

function checkVoucher(v: Partial<z.infer<typeof voucherSchema>>) {
  if (v.discountType === 'PERCENT' && (v.discountValue ?? 0) > 100) throw badRequest('Phần trăm giảm tối đa 100');
  if (v.startDate && v.endDate && v.startDate > v.endDate) throw badRequest('Ngày kết thúc phải sau ngày bắt đầu');
}

vouchersRouter.get('/', async (req, res) => {
  const { page, pageSize, skip, take } = paging(req.query);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const type = req.query.type;
  const where: Prisma.VoucherWhereInput = {
    ...(q ? { title: { contains: q } } : {}),
    ...(type === 'free' ? { pointCost: 0 } : type === 'points' ? { pointCost: { gt: 0 } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.voucher.findMany({
      where,
      include: { minTier: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.voucher.count({ where }),
  ]);
  const used = await prisma.customerVoucher.groupBy({
    by: ['voucherId'],
    where: { voucherId: { in: items.map((i) => i.id) }, status: 'USED' },
    _count: { _all: true },
  });
  const usedMap = new Map(used.map((u) => [u.voucherId, u._count._all]));
  res.json({ items: items.map((i) => ({ ...i, usedCount: usedMap.get(i.id) ?? 0 })), total, page, pageSize });
});

/** Kiểm tra mã voucher của khách (khi khách đưa mã tại quầy) */
vouchersRouter.get('/check', async (req, res) => {
  const code = String(req.query.code ?? '').trim().toUpperCase();
  const amount = Number(req.query.amount ?? 0);
  if (!code) throw badRequest('Nhập mã voucher');
  await expireVouchers();
  const cv = await prisma.customerVoucher.findUnique({
    where: { code },
    include: { voucher: true, customer: { include: { tier: true } }, order: { select: { id: true, code: true } } },
  });
  if (!cv) throw notFound('Mã voucher không tồn tại');
  const valid = cv.status === 'AVAILABLE';
  let reason: string | null = valid ? null : cv.status === 'USED' ? 'Voucher đã được sử dụng' : 'Voucher đã hết hạn';
  if (valid && amount > 0 && amount < cv.voucher.minOrder) reason = `Hoá đơn tối thiểu ${cv.voucher.minOrder.toLocaleString('vi-VN')}đ`;
  res.json({
    ...cv,
    valid: !reason,
    reason,
    discount: amount > 0 && !reason ? voucherDiscountAmount(cv.voucher, amount) : null,
  });
});

vouchersRouter.get('/:id', async (req, res) => {
  const v = await prisma.voucher.findUnique({ where: { id: idParam(req.params.id) }, include: { minTier: true } });
  if (!v) throw notFound('Voucher không tồn tại');
  const stats = await prisma.customerVoucher.groupBy({ by: ['status'], where: { voucherId: v.id }, _count: { _all: true } });
  const recent = await prisma.customerVoucher.findMany({
    where: { voucherId: v.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { customer: { select: { id: true, name: true, phone: true } } },
  });
  res.json({ ...v, stats: Object.fromEntries(stats.map((s) => [s.status, s._count._all])), recent });
});

vouchersRouter.post('/', requireManager, async (req, res) => {
  const data = voucherSchema.parse(req.body);
  checkVoucher(data);
  res.status(201).json(await prisma.voucher.create({ data }));
});

vouchersRouter.put('/:id', requireManager, async (req, res) => {
  const data = voucherSchema.partial().parse(req.body);
  checkVoucher(data);
  res.json(await prisma.voucher.update({ where: { id: idParam(req.params.id) }, data }));
});

vouchersRouter.delete('/:id', requireManager, async (req, res) => {
  const id = idParam(req.params.id);
  const issued = await prisma.customerVoucher.count({ where: { voucherId: id } });
  if (issued > 0) {
    // Đã phát cho khách → chỉ ngừng hoạt động để giữ lịch sử
    await prisma.voucher.update({ where: { id }, data: { active: false } });
    res.json({ deleted: false, deactivated: true });
    return;
  }
  await prisma.voucher.delete({ where: { id } });
  res.json({ deleted: true });
});

/** Tặng voucher hàng loạt cho danh sách khách hoặc cả 1 hạng */
vouchersRouter.post('/:id/gift', requireManager, async (req, res) => {
  const body = z
    .object({ customerIds: z.array(z.number().int().positive()).optional(), tierId: z.number().int().positive().optional() })
    .refine((b) => b.customerIds?.length || b.tierId, 'Chọn khách hàng hoặc hạng thành viên')
    .parse(req.body);
  const voucherId = idParam(req.params.id);
  const ids = body.customerIds?.length
    ? body.customerIds
    : (await prisma.customer.findMany({ where: { tierId: body.tierId }, select: { id: true } })).map((c) => c.id);
  let success = 0;
  const errors: { customerId: number; error: string }[] = [];
  for (const customerId of ids) {
    try {
      await prisma.$transaction((tx) => issueVoucher(tx, { customerId, voucherId, source: 'GIFT', adminId: req.admin!.id }));
      success++;
    } catch (e) {
      errors.push({ customerId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  res.json({ success, failed: errors.length, errors: errors.slice(0, 20) });
});
