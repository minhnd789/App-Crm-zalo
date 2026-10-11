import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { appBrand, requireCustomer, signCustomerToken } from '../../lib/auth.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { idParam, paging, phoneSchema, optionalDate } from '../../lib/http.js';
import { bookingCode } from '../../lib/codes.js';
import { getZaloPhone, getZaloProfile, sendOAMessage } from '../../lib/zalo.js';
import { expireVouchers, issueVoucher, membershipInfo, voucherIneligibility } from '../../services/loyalty.js';
import { getPublicConfig } from '../../services/settings.js';
import { validateBookingTime } from '../../services/bookings.js';
import { loginWithZalo, mergeCustomers } from '../../services/customers.js';

/**
 * API cho Zalo Mini App (khách hàng) – prefix /api/app.
 * Mọi request phải có header `X-Brand: <mã thương hiệu>` – mỗi thương hiệu là 1 Mini App riêng.
 */
export const appRouter = Router();
appRouter.use(appBrand);

const activeWindow = (now: Date) => ({
  active: true,
  AND: [{ OR: [{ startDate: null }, { startDate: { lte: now } }] }, { OR: [{ endDate: null }, { endDate: { gte: now } }] }],
});

/** Thông tin khách hiển thị trong Mini App của 1 thương hiệu */
async function serializeMe(customerId: number, brandId: number) {
  const c = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    include: {
      tier: true,
      wallets: { include: { brand: { select: { id: true, name: true, code: true } } } },
      zaloAccounts: { where: { brandId } },
    },
  });
  await expireVouchers(customerId);
  const availableVouchers = await prisma.customerVoucher.count({ where: { customerId, brandId, status: 'AVAILABLE' } });
  const wallet = c.wallets.find((w) => w.brandId === brandId);
  return {
    id: c.id,
    name: c.name,
    avatar: c.avatar,
    phone: c.phone,
    birthday: c.birthday,
    gender: c.gender,
    memberCode: c.memberCode,
    /** Điểm tại thương hiệu này */
    points: wallet?.points ?? 0,
    lifetimePoints: wallet?.lifetimePoints ?? 0,
    brandSpent: wallet?.totalSpent ?? 0,
    brandVisitCount: wallet?.visitCount ?? 0,
    /** Tổng chi tiêu & số lần ghé ở mọi thương hiệu – dùng xét hạng chung */
    totalSpent: c.totalSpent,
    visitCount: c.visitCount,
    followedOA: c.zaloAccounts[0]?.followedOA ?? false,
    createdAt: c.createdAt,
    availableVouchers,
    /** Điểm ở các thương hiệu khác (để khách biết) */
    otherWallets: c.wallets
      .filter((w) => w.brandId !== brandId)
      .map((w) => ({ brand: w.brand, points: w.points })),
    ...(await membershipInfo(c)),
  };
}

// ---------- Public ----------

appRouter.get('/config', async (req, res) => {
  res.json(await getPublicConfig(req.brand!));
});

appRouter.get('/branches', async (req, res) => {
  res.json(await prisma.branch.findMany({ where: { brandId: req.brand!.id, active: true }, orderBy: { id: 'asc' } }));
});

/** Hạng thành viên dùng chung mọi thương hiệu */
appRouter.get('/tiers', async (_req, res) => {
  res.json(await prisma.tier.findMany({ orderBy: { minSpent: 'asc' } }));
});

appRouter.get('/promotions', async (req, res) => {
  const now = new Date();
  const featured = req.query.featured === 'true';
  res.json(
    await prisma.promotion.findMany({
      where: { brandId: req.brand!.id, ...activeWindow(now), ...(featured ? { featured: true } : {}) },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    }),
  );
});

appRouter.get('/promotions/:id', async (req, res) => {
  const p = await prisma.promotion.findFirst({
    where: { id: idParam(req.params.id), brandId: req.brand!.id, ...activeWindow(new Date()) },
  });
  if (!p) throw notFound('Chương trình không tồn tại hoặc đã kết thúc');
  res.json(p);
});

// ---------- Auth ----------

const loginSchema = z.object({
  /** access token từ zmp-sdk getAccessToken() */
  accessToken: z.string().optional(),
  /** Thông tin bổ sung từ zmp-sdk getUserInfo() */
  name: z.string().optional(),
  avatar: z.string().optional(),
  idByOA: z.string().optional(),
  followedOA: z.boolean().optional(),
  /** Chỉ dùng khi ZALO_MOCK=true */
  mockZaloId: z.string().optional(),
});

appRouter.post('/auth/login', async (req, res) => {
  const body = loginSchema.parse(req.body);
  let profile: { id: string; name: string; avatar?: string };
  if (config.zalo.mock && body.mockZaloId) {
    profile = { id: body.mockZaloId, name: body.name ?? 'Khách thử nghiệm', avatar: body.avatar };
  } else {
    if (!body.accessToken) throw badRequest('Thiếu accessToken');
    profile = await getZaloProfile(body.accessToken);
  }
  const brand = req.brand!;
  const { customerId, isNew } = await prisma.$transaction((tx) =>
    loginWithZalo(tx, brand, {
      zaloId: profile.id,
      name: body.name || profile.name,
      avatar: body.avatar || profile.avatar,
      zaloOAId: body.idByOA,
      followedOA: body.followedOA,
    }),
  );
  res.json({ token: signCustomerToken(customerId, brand.id), isNew, customer: await serializeMe(customerId, brand.id) });
});

// ---------- Cần đăng nhập ----------

appRouter.use(requireCustomer);

appRouter.get('/me', async (req, res) => {
  res.json(await serializeMe(req.customerId!, req.brand!.id));
});

const profileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  birthday: optionalDate,
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
  followedOA: z.boolean().optional(),
  idByOA: z.string().optional(),
});

appRouter.put('/me', async (req, res) => {
  const { idByOA, followedOA, ...body } = profileSchema.parse(req.body);
  await prisma.customer.update({ where: { id: req.customerId! }, data: body });
  if (idByOA || followedOA !== undefined) {
    await prisma.customerZaloAccount.update({
      where: { customerId_brandId: { customerId: req.customerId!, brandId: req.brand!.id } },
      data: { ...(idByOA ? { zaloOAId: idByOA } : {}), ...(followedOA !== undefined ? { followedOA } : {}) },
    });
  }
  res.json(await serializeMe(req.customerId!, req.brand!.id));
});

const phoneBody = z.object({
  /** token từ zmp-sdk getPhoneNumber() */
  token: z.string().optional(),
  accessToken: z.string().optional(),
  /** Chỉ dùng khi ZALO_MOCK=true */
  phone: z.string().optional(),
});

/**
 * Liên kết số điện thoại. Nếu SĐT đã là thành viên (vd đã dùng Mini App của thương hiệu khác
 * hoặc được nhân viên tạo hoá đơn), tài khoản hiện tại được gộp vào thành viên đó và trả về token mới.
 */
appRouter.post('/me/phone', async (req, res) => {
  const body = phoneBody.parse(req.body);
  let phone: string;
  if (config.zalo.mock && body.phone) {
    phone = phoneSchema.parse(body.phone);
  } else {
    if (!body.token || !body.accessToken) throw badRequest('Thiếu token hoặc accessToken');
    phone = phoneSchema.parse(await getZaloPhone(body.accessToken, body.token, req.brand!.zaloAppSecretKey));
  }
  const me = req.customerId!;
  const finalId = await prisma.$transaction(async (tx) => {
    const owner = await tx.customer.findUnique({ where: { phone } });
    if (owner && owner.id !== me) {
      const current = await tx.customer.findUniqueOrThrow({ where: { id: me } });
      if (current.phone && current.phone !== phone) {
        throw badRequest('Tài khoản đã liên kết số điện thoại khác, vui lòng liên hệ nhà hàng');
      }
      await mergeCustomers(tx, me, owner.id);
      return { id: owner.id, merged: true };
    }
    await tx.customer.update({ where: { id: me }, data: { phone } });
    return { id: me, merged: false };
  });
  res.json({
    ...(await serializeMe(finalId.id, req.brand!.id)),
    merged: finalId.merged,
    // Token mới khi tài khoản được gộp (client phải thay token cũ)
    token: finalId.merged ? signCustomerToken(finalId.id, req.brand!.id) : undefined,
  });
});

appRouter.get('/me/points', async (req, res) => {
  const { page, pageSize, skip, take } = paging(req.query);
  const where = { customerId: req.customerId!, brandId: req.brand!.id };
  const [items, total] = await Promise.all([
    prisma.pointTransaction.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.pointTransaction.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

// ----- Voucher -----

async function walletPoints(customerId: number, brandId: number) {
  const w = await prisma.customerWallet.findUnique({ where: { customerId_brandId: { customerId, brandId } } });
  return w?.points ?? 0;
}

/** Danh sách ưu đãi có thể nhận (pointCost = 0) hoặc đổi điểm (pointCost > 0) của thương hiệu */
appRouter.get('/vouchers', async (req, res) => {
  const now = new Date();
  const brandId = req.brand!.id;
  const type = req.query.type; // 'free' | 'points' | undefined
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: req.customerId! }, include: { tier: true } });
  const points = await walletPoints(customer.id, brandId);
  const vouchers = await prisma.voucher.findMany({
    where: {
      brandId,
      ...activeWindow(now),
      ...(type === 'free' ? { pointCost: 0 } : type === 'points' ? { pointCost: { gt: 0 } } : {}),
    },
    include: { minTier: true },
    orderBy: [{ pointCost: 'asc' }, { createdAt: 'desc' }],
  });
  const owned = await prisma.customerVoucher.groupBy({
    by: ['voucherId'],
    where: { customerId: customer.id, brandId },
    _count: { _all: true },
  });
  const ownedMap = new Map(owned.map((o) => [o.voucherId, o._count._all]));
  res.json(
    vouchers.map((v) => {
      const reason = voucherIneligibility(v, customer, points, ownedMap.get(v.id) ?? 0, now);
      const remaining = v.totalQuantity === null ? null : Math.max(0, v.totalQuantity - v.issuedCount);
      return { ...v, remaining, ownedCount: ownedMap.get(v.id) ?? 0, canClaim: !reason, reason };
    }),
  );
});

appRouter.get('/vouchers/:id', async (req, res) => {
  const v = await prisma.voucher.findUnique({ where: { id: idParam(req.params.id) }, include: { minTier: true } });
  if (!v || !v.active || v.brandId !== req.brand!.id) throw notFound('Ưu đãi không tồn tại');
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: req.customerId! }, include: { tier: true } });
  const ownedCount = await prisma.customerVoucher.count({ where: { customerId: customer.id, voucherId: v.id } });
  const reason = voucherIneligibility(v, customer, await walletPoints(customer.id, v.brandId), ownedCount);
  const remaining = v.totalQuantity === null ? null : Math.max(0, v.totalQuantity - v.issuedCount);
  res.json({ ...v, remaining, ownedCount, canClaim: !reason, reason });
});

/** Nhận voucher miễn phí hoặc đổi điểm lấy voucher */
appRouter.post('/vouchers/:id/claim', async (req, res) => {
  const voucherId = idParam(req.params.id);
  const v = await prisma.voucher.findUnique({ where: { id: voucherId } });
  if (!v || v.brandId !== req.brand!.id) throw notFound('Ưu đãi không tồn tại');
  const cv = await prisma.$transaction((tx) =>
    issueVoucher(tx, {
      customerId: req.customerId!,
      brandId: v.brandId,
      voucherId,
      source: v.pointCost > 0 ? 'REDEEM' : 'CLAIM',
    }),
  );
  res.status(201).json(cv);
});

appRouter.get('/my-vouchers', async (req, res) => {
  await expireVouchers(req.customerId);
  const status = z.enum(['AVAILABLE', 'USED', 'EXPIRED']).optional().parse(req.query.status || undefined);
  res.json(
    await prisma.customerVoucher.findMany({
      where: { customerId: req.customerId!, brandId: req.brand!.id, ...(status ? { status } : {}) },
      include: { voucher: true },
      orderBy: [{ status: 'asc' }, { expiresAt: 'asc' }],
    }),
  );
});

appRouter.get('/my-vouchers/:id', async (req, res) => {
  await expireVouchers(req.customerId);
  const cv = await prisma.customerVoucher.findFirst({
    where: { id: idParam(req.params.id), customerId: req.customerId!, brandId: req.brand!.id },
    include: { voucher: true, order: { select: { id: true, code: true, createdAt: true } } },
  });
  if (!cv) throw notFound('Voucher không tồn tại');
  res.json(cv);
});

// ----- Đặt bàn -----

const bookingSchema = z.object({
  branchId: z.number().int().positive(),
  bookingTime: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
  partySize: z.number().int().min(1),
  contactName: z.string().trim().min(1).max(100),
  contactPhone: phoneSchema,
  note: z.string().trim().max(500).optional(),
});

appRouter.get('/bookings', async (req, res) => {
  const scope = req.query.scope; // 'upcoming' | 'past'
  const now = new Date();
  res.json(
    await prisma.booking.findMany({
      where: {
        customerId: req.customerId!,
        brandId: req.brand!.id,
        ...(scope === 'upcoming'
          ? { bookingTime: { gte: now }, status: { in: ['PENDING', 'CONFIRMED'] } }
          : scope === 'past'
            ? { OR: [{ bookingTime: { lt: now } }, { status: { notIn: ['PENDING', 'CONFIRMED'] } }] }
            : {}),
      },
      include: { branch: true },
      orderBy: { bookingTime: scope === 'upcoming' ? 'asc' : 'desc' },
      take: 50,
    }),
  );
});

appRouter.get('/bookings/:id', async (req, res) => {
  const b = await prisma.booking.findFirst({
    where: { id: idParam(req.params.id), customerId: req.customerId!, brandId: req.brand!.id },
    include: { branch: true },
  });
  if (!b) throw notFound('Lịch đặt bàn không tồn tại');
  res.json(b);
});

appRouter.post('/bookings', async (req, res) => {
  const body = bookingSchema.parse(req.body);
  const brandId = req.brand!.id;
  const branch = await prisma.branch.findFirst({ where: { id: body.branchId, brandId, active: true } });
  if (!branch) throw badRequest('Chi nhánh không tồn tại');
  await validateBookingTime(body.bookingTime, body.partySize, branch);

  const pending = await prisma.booking.count({
    where: { customerId: req.customerId!, brandId, status: { in: ['PENDING', 'CONFIRMED'] }, bookingTime: { gte: new Date() } },
  });
  if (pending >= 3) throw badRequest('Bạn đang có 3 lịch đặt bàn chưa diễn ra, vui lòng huỷ bớt hoặc liên hệ nhà hàng');

  const booking = await prisma.booking.create({
    data: { ...body, code: bookingCode(), brandId, customerId: req.customerId! },
    include: { branch: true },
  });
  res.status(201).json(booking);
});

appRouter.post('/bookings/:id/cancel', async (req, res) => {
  const brand = req.brand!;
  const b = await prisma.booking.findFirst({
    where: { id: idParam(req.params.id), customerId: req.customerId!, brandId: brand.id },
  });
  if (!b) throw notFound('Lịch đặt bàn không tồn tại');
  if (!['PENDING', 'CONFIRMED'].includes(b.status)) throw badRequest('Không thể huỷ lịch đặt bàn này');
  if (b.bookingTime < new Date()) throw badRequest('Lịch đặt bàn đã qua, vui lòng liên hệ nhà hàng');
  const updated = await prisma.booking.update({ where: { id: b.id }, data: { status: 'CANCELLED' }, include: { branch: true } });
  const account = await prisma.customerZaloAccount.findUnique({
    where: { customerId_brandId: { customerId: b.customerId, brandId: brand.id } },
  });
  void sendOAMessage(brand.zaloOaAccessToken, account?.zaloOAId, `Bạn đã huỷ lịch đặt bàn ${updated.code}. Hẹn gặp lại bạn lần sau!`);
  res.json(updated);
});

// ----- Lịch sử ăn uống (tại thương hiệu này) -----

appRouter.get('/orders', async (req, res) => {
  const { page, pageSize, skip, take } = paging(req.query);
  const where = { customerId: req.customerId!, brandId: req.brand!.id };
  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { branch: true, _count: { select: { items: true } } },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.order.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

appRouter.get('/orders/:id', async (req, res) => {
  const o = await prisma.order.findFirst({
    where: { id: idParam(req.params.id), customerId: req.customerId!, brandId: req.brand!.id },
    include: { items: true, branch: true, usedVoucher: { include: { voucher: true } } },
  });
  if (!o) throw notFound('Hoá đơn không tồn tại');
  res.json(o);
});
