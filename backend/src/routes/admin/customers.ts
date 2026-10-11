import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { idParam, optionalDate, paging, phoneSchema } from '../../lib/http.js';
import { changePoints, expireVouchers, issueVoucher, membershipInfo } from '../../services/loyalty.js';
import { requireManager } from '../../lib/auth.js';

/**
 * Khách hàng dùng chung mọi thương hiệu. Khi có thương hiệu đang chọn (X-Brand-Id),
 * kèm theo ví điểm (`wallet`) của khách tại thương hiệu đó.
 */
export const customersRouter = Router();

const requireBrand = (brandId: number | undefined) => {
  if (!brandId) throw badRequest('Vui lòng chọn thương hiệu');
  return brandId;
};

customersRouter.get('/', async (req, res) => {
  const { page, pageSize, skip, take } = paging(req.query);
  const brandId = req.brand?.id;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const tierId = req.query.tierId ? Number(req.query.tierId) : undefined;
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'createdAt';
  // onlyBrand=true: chỉ khách đã dùng Mini App hoặc có giao dịch tại thương hiệu đang chọn
  const onlyBrand = req.query.onlyBrand === 'true' && brandId;
  const where: Prisma.CustomerWhereInput = {
    ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }, { memberCode: { contains: q } }] } : {}),
    ...(tierId ? { tierId } : {}),
    ...(onlyBrand ? { wallets: { some: { brandId } } } : {}),
  };
  const orderBy: Prisma.CustomerOrderByWithRelationInput =
    sort === 'totalSpent'
      ? { totalSpent: 'desc' }
      : sort === 'lastVisitAt'
        ? { lastVisitAt: { sort: 'desc', nulls: 'last' } }
        : { createdAt: 'desc' };
  const [rows, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
        tier: true,
        wallets: brandId ? { where: { brandId } } : false,
        zaloAccounts: { select: { brandId: true } },
      },
      orderBy,
      skip,
      take,
    }),
    prisma.customer.count({ where }),
  ]);
  const own = req.admin!.brandId;
  const items = rows.map(({ wallets, zaloAccounts, ...c }) => ({
    ...c,
    wallet: wallets?.[0] ?? null,
    // Tài khoản gắn thương hiệu không thấy khách dùng Mini App thương hiệu nào khác
    brandIds: zaloAccounts.map((a) => a.brandId).filter((id) => own === null || id === own),
  }));
  res.json({ items, total, page, pageSize });
});

/** Tìm nhanh khách theo SĐT hoặc mã thành viên (quét QR) – dùng khi tạo hoá đơn tại thương hiệu đang chọn */
customersRouter.get('/lookup', async (req, res) => {
  const brandId = requireBrand(req.brand?.id);
  const q = String(req.query.q ?? '').trim();
  if (!q) throw badRequest('Nhập số điện thoại hoặc mã thành viên');
  const normalizedPhone = q.replace(/[\s.-]/g, '').replace(/^\+?84/, '0');
  const c = await prisma.customer.findFirst({
    where: { OR: [{ memberCode: q }, { phone: normalizedPhone }] },
    include: { tier: true, wallets: { where: { brandId } } },
  });
  if (!c) throw notFound('Không tìm thấy khách hàng');
  await expireVouchers(c.id);
  const [vouchers, bookings] = await Promise.all([
    prisma.customerVoucher.findMany({
      where: { customerId: c.id, brandId, status: 'AVAILABLE' },
      include: { voucher: true },
      orderBy: { expiresAt: 'asc' },
    }),
    prisma.booking.findMany({
      where: { customerId: c.id, brandId, status: { in: ['PENDING', 'CONFIRMED', 'ARRIVED'] } },
      include: { branch: true },
      orderBy: { bookingTime: 'asc' },
    }),
  ]);
  const { wallets, ...rest } = c;
  res.json({ ...rest, wallet: wallets[0] ?? null, vouchers, bookings });
});

/** Chi tiết khách. Đơn, đặt bàn, voucher, lịch sử điểm lọc theo thương hiệu đang chọn (nếu có). */
customersRouter.get('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const brandId = req.brand?.id;
  const byBrand = brandId ? { brandId } : {};
  const brandSel = { select: { id: true, name: true, code: true } };
  await expireVouchers(id);
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      tier: true,
      wallets: { include: { brand: brandSel } },
      zaloAccounts: { include: { brand: brandSel } },
      orders: { where: byBrand, orderBy: { createdAt: 'desc' }, take: 50, include: { branch: true, brand: brandSel } },
      bookings: { where: byBrand, orderBy: { bookingTime: 'desc' }, take: 50, include: { branch: true, brand: brandSel } },
      vouchers: { where: byBrand, orderBy: { createdAt: 'desc' }, include: { voucher: true, brand: brandSel } },
      pointTransactions: {
        where: byBrand,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { admin: { select: { id: true, name: true } }, brand: brandSel },
      },
    },
  });
  if (!c) throw notFound('Khách hàng không tồn tại');
  // Tài khoản gắn thương hiệu chỉ thấy ví điểm / tài khoản Zalo của thương hiệu mình
  // (tổng chi tiêu chung vẫn hiển thị vì dùng để xét hạng)
  const own = req.admin!.brandId;
  if (own !== null) {
    c.wallets = c.wallets.filter((w) => w.brandId === own);
    c.zaloAccounts = c.zaloAccounts.filter((a) => a.brandId === own);
  }
  res.json({ ...c, wallet: brandId ? (c.wallets.find((w) => w.brandId === brandId) ?? null) : null, ...(await membershipInfo(c)) });
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

/** Cộng/trừ điểm thủ công vào ví của thương hiệu đang chọn (chỉ quản lý) */
customersRouter.post('/:id/points', requireManager, async (req, res) => {
  const brandId = requireBrand(req.brand?.id);
  const body = z
    .object({
      points: z.number().int().refine((n) => n !== 0, 'Số điểm phải khác 0'),
      description: z.string().trim().min(1, 'Vui lòng nhập lý do'),
    })
    .parse(req.body);
  const wallet = await prisma.$transaction((tx) =>
    changePoints(tx, {
      customerId: idParam(req.params.id),
      brandId,
      points: body.points,
      type: 'ADJUST',
      description: body.description,
      adminId: req.admin!.id,
    }),
  );
  res.json({ wallet });
});

/** Tặng voucher của thương hiệu đang chọn (bỏ qua điều kiện điểm/hạng) */
customersRouter.post('/:id/vouchers', async (req, res) => {
  const brandId = requireBrand(req.brand?.id);
  const { voucherId } = z.object({ voucherId: z.number().int().positive() }).parse(req.body);
  const cv = await prisma.$transaction((tx) =>
    issueVoucher(tx, { customerId: idParam(req.params.id), brandId, voucherId, source: 'GIFT', adminId: req.admin!.id }),
  );
  res.status(201).json(cv);
});
