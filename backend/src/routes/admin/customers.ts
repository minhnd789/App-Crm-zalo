import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { idParam, optionalDate, paging, phoneSchema } from '../../lib/http.js';
import { changePoints, expireVouchers, issueVoucher, membershipInfo } from '../../services/loyalty.js';
import { brandForWrite, brandWhere, requireManager } from '../../lib/auth.js';

/**
 * Khách hàng dùng chung mọi thương hiệu. Khi có thương hiệu đang chọn (X-Brand-Id),
 * kèm theo ví điểm (`wallet`) của khách tại thương hiệu đó.
 */
export const customersRouter = Router();

const brandSel = { select: { id: true, name: true, code: true, primaryColor: true } } as const;
const branchSel = { select: { id: true, name: true } } as const;

/** Đọc id tuỳ chọn từ query (rỗng = không lọc) */
const optionalId = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));

/**
 * Danh sách khách dùng chung. Lọc:
 * - thương hiệu (bộ lọc X-Brand-Id): chỉ khách là thành viên (có ví) của thương hiệu
 * - `branchId`: cơ sở khách chọn khi đăng ký; `registered=true|false`; `tierId`; `birthMonth=1..12`; `q`
 */
customersRouter.get('/', async (req, res) => {
  const { page, pageSize, skip, take } = paging(req.query);
  const own = req.admin!.brandId;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const tierId = optionalId(req.query.tierId);
  const branchId = optionalId(req.query.branchId);
  const birthMonth = optionalId(req.query.birthMonth);
  const registered = req.query.registered === 'true' ? true : req.query.registered === 'false' ? false : undefined;
  const sort = typeof req.query.sort === 'string' ? req.query.sort : 'createdAt';

  const walletFilter: Prisma.CustomerWalletWhereInput = {
    ...brandWhere(req),
    ...(branchId ? { homeBranchId: branchId } : {}),
    ...(registered === true ? { registeredAt: { not: null } } : registered === false ? { registeredAt: null } : {}),
  };
  const needWallet = !!req.brand || !!branchId || registered !== undefined;

  let idsByBirthMonth: number[] | undefined;
  if (birthMonth) {
    // SQLite/Postgres khác nhau về hàm ngày tháng → lọc tháng sinh trong ứng dụng
    const withBirthday = await prisma.customer.findMany({ where: { birthday: { not: null } }, select: { id: true, birthday: true } });
    idsByBirthMonth = withBirthday
      .filter((c) => new Date(c.birthday!.getTime() + 7 * 3600_000).getUTCMonth() + 1 === birthMonth)
      .map((c) => c.id);
  }

  const where: Prisma.CustomerWhereInput = {
    ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }, { memberCode: { contains: q } }] } : {}),
    ...(tierId ? { tierId } : {}),
    ...(needWallet ? { wallets: { some: walletFilter } } : {}),
    ...(idsByBirthMonth ? { id: { in: idsByBirthMonth } } : {}),
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
        // Tài khoản gắn thương hiệu chỉ thấy ví của thương hiệu mình
        wallets: {
          where: { ...(own !== null ? { brandId: own } : brandWhere(req)) },
          include: { brand: brandSel, homeBranch: branchSel },
          orderBy: { brandId: 'asc' },
        },
      },
      orderBy,
      skip,
      take,
    }),
    prisma.customer.count({ where }),
  ]);
  const items = rows.map((c) => ({
    ...c,
    // ví của thương hiệu đang lọc (nếu có)
    wallet: req.brand ? (c.wallets.find((w) => w.brandId === req.brand!.id) ?? null) : null,
  }));
  res.json({ items, total, page, pageSize });
});

/**
 * Tìm nhanh khách theo SĐT hoặc mã thành viên (quét QR) khi tạo hoá đơn.
 * Cần thương hiệu: bộ lọc hiện tại hoặc `brandId` (thương hiệu của cơ sở đang xuất hoá đơn).
 */
customersRouter.get('/lookup', async (req, res) => {
  const brandId = (await brandForWrite(req, optionalId(req.query.brandId))).id;
  const q = String(req.query.q ?? '').trim();
  if (!q) throw badRequest('Nhập số điện thoại hoặc mã thành viên');
  const normalizedPhone = q.replace(/[\s.-]/g, '').replace(/^\+?84/, '0');
  const c = await prisma.customer.findFirst({
    where: { OR: [{ memberCode: q }, { phone: normalizedPhone }] },
    include: { tier: true, wallets: { where: { brandId }, include: { homeBranch: branchSel } } },
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

/** Chi tiết khách. Đơn, đặt bàn, voucher, lịch sử điểm lọc theo thương hiệu đang lọc (nếu có). */
customersRouter.get('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const byBrand = brandWhere(req);
  await expireVouchers(id);
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      tier: true,
      wallets: { include: { brand: brandSel, homeBranch: branchSel }, orderBy: { brandId: 'asc' } },
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
  res.json({
    ...c,
    wallet: req.brand ? (c.wallets.find((w) => w.brandId === req.brand!.id) ?? null) : null,
    ...(await membershipInfo(c)),
  });
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

/** Cộng/trừ điểm thủ công vào ví của 1 thương hiệu (bộ lọc hoặc `brandId`) – chỉ quản lý */
customersRouter.post('/:id/points', requireManager, async (req, res) => {
  const body = z
    .object({
      points: z.number().int().refine((n) => n !== 0, 'Số điểm phải khác 0'),
      description: z.string().trim().min(1, 'Vui lòng nhập lý do'),
      brandId: z.number().int().positive().optional(),
    })
    .parse(req.body);
  const brandId = (await brandForWrite(req, body.brandId)).id;
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

/** Tặng voucher (của thương hiệu phát hành voucher) cho khách – bỏ qua điều kiện điểm/hạng */
customersRouter.post('/:id/vouchers', async (req, res) => {
  const { voucherId } = z.object({ voucherId: z.number().int().positive() }).parse(req.body);
  const voucher = await prisma.voucher.findUnique({ where: { id: voucherId } });
  if (!voucher) throw notFound('Voucher không tồn tại');
  const brandId = (await brandForWrite(req, voucher.brandId)).id;
  const cv = await prisma.$transaction((tx) =>
    issueVoucher(tx, { customerId: idParam(req.params.id), brandId, voucherId, source: 'GIFT', adminId: req.admin!.id }),
  );
  res.status(201).json(cv);
});
