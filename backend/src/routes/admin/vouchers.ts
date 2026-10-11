import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { idParam, optionalDate, paging, updateSchemaOf } from '../../lib/http.js';
import { assertBrandAccess, brandForWrite, brandWhere, requireManager } from '../../lib/auth.js';
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
  /** Thương hiệu phát hành (khi tạo từ chế độ xem tất cả thương hiệu) */
  brandId: z.number().int().positive().optional(),
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
    ...brandWhere(req),
    ...(q ? { title: { contains: q } } : {}),
    ...(type === 'free' ? { pointCost: 0 } : type === 'points' ? { pointCost: { gt: 0 } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.voucher.findMany({
      where,
      include: { minTier: true, brand: { select: { id: true, name: true, primaryColor: true } } },
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
  assertBrandAccess(req, cv.brandId, 'Mã voucher không tồn tại trong thương hiệu này');
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

/** Xác nhận khách dùng voucher tại quầy (khi chưa có kết nối phần mềm bán hàng) */
vouchersRouter.post('/redeem', async (req, res) => {
  const { code } = z.object({ code: z.string().trim().min(1, 'Nhập mã voucher') }).parse(req.body);
  await expireVouchers();
  const cv = await prisma.customerVoucher.findUnique({ where: { code: code.toUpperCase() } });
  if (!cv) throw notFound('Mã voucher không tồn tại');
  assertBrandAccess(req, cv.brandId, 'Mã voucher không tồn tại trong thương hiệu này');
  await brandForWrite(req, cv.brandId);
  // updateMany có điều kiện để 2 nhân viên không xác nhận cùng 1 voucher 2 lần
  const used = await prisma.customerVoucher.updateMany({
    where: { id: cv.id, status: 'AVAILABLE', expiresAt: { gte: new Date() } },
    data: { status: 'USED', usedAt: new Date() },
  });
  if (used.count === 0) throw badRequest(cv.status === 'USED' ? 'Voucher đã được sử dụng' : 'Voucher đã hết hạn');
  res.json(
    await prisma.customerVoucher.findUniqueOrThrow({
      where: { id: cv.id },
      include: { voucher: true, customer: { select: { id: true, name: true, phone: true } } },
    }),
  );
});

vouchersRouter.get('/:id', async (req, res) => {
  const v = await prisma.voucher.findUnique({ where: { id: idParam(req.params.id) }, include: { minTier: true } });
  if (!v) throw notFound('Voucher không tồn tại');
  assertBrandAccess(req, v.brandId, 'Voucher không tồn tại');
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
  const brand = await brandForWrite(req, data.brandId);
  res.status(201).json(await prisma.voucher.create({ data: { ...data, brandId: brand.id } }));
});

vouchersRouter.put('/:id', requireManager, async (req, res) => {
  const id = idParam(req.params.id);
  const { brandId: _ignored, ...data } = updateSchemaOf(voucherSchema).parse(req.body);
  const current = await prisma.voucher.findUnique({ where: { id } });
  if (!current) throw notFound('Voucher không tồn tại');
  assertBrandAccess(req, current.brandId, 'Voucher không tồn tại');
  await brandForWrite(req, current.brandId);
  checkVoucher({ discountType: current.discountType as 'PERCENT', discountValue: current.discountValue, startDate: current.startDate, endDate: current.endDate, ...data });
  if (data.totalQuantity != null && data.totalQuantity < current.issuedCount) {
    throw badRequest(`Số lượng không được nhỏ hơn số đã phát (${current.issuedCount})`);
  }
  res.json(await prisma.voucher.update({ where: { id }, data }));
});

vouchersRouter.delete('/:id', requireManager, async (req, res) => {
  const id = idParam(req.params.id);
  const v = await prisma.voucher.findUnique({ where: { id } });
  if (!v) throw notFound('Voucher không tồn tại');
  assertBrandAccess(req, v.brandId, 'Voucher không tồn tại');
  await brandForWrite(req, v.brandId);
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
    .object({
      customerIds: z.array(z.number().int().positive()).optional(),
      /** Lọc theo hạng và/hoặc cơ sở khách đã chọn khi đăng ký (khách đã là thành viên của thương hiệu) */
      tierId: z.number().int().positive().optional(),
      branchId: z.number().int().positive().optional(),
    })
    .refine((b) => b.customerIds?.length || b.tierId || b.branchId, 'Chọn khách hàng, hạng thành viên hoặc cơ sở')
    .parse(req.body);
  const voucherId = idParam(req.params.id);
  const v = await prisma.voucher.findUnique({ where: { id: voucherId } });
  if (!v) throw notFound('Voucher không tồn tại');
  assertBrandAccess(req, v.brandId, 'Voucher không tồn tại');
  const brandId = (await brandForWrite(req, v.brandId)).id;
  const ids = body.customerIds?.length
    ? body.customerIds
    : (
        await prisma.customer.findMany({
          where: {
            ...(body.tierId ? { tierId: body.tierId } : {}),
            wallets: { some: { brandId, ...(body.branchId ? { homeBranchId: body.branchId } : {}) } },
          },
          select: { id: true },
        })
      ).map((c) => c.id);
  let success = 0;
  const errors: { customerId: number; error: string }[] = [];
  for (const customerId of ids) {
    try {
      await prisma.$transaction((tx) => issueVoucher(tx, { customerId, brandId, voucherId, source: 'GIFT', adminId: req.admin!.id }));
      success++;
    } catch (e) {
      errors.push({ customerId, error: e instanceof Error ? e.message : String(e) });
    }
  }
  res.json({ success, failed: errors.length, errors: errors.slice(0, 20) });
});
