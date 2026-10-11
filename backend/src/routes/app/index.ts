import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { requireCustomer, signCustomerToken } from '../../lib/auth.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { idParam, paging, phoneSchema, optionalDate } from '../../lib/http.js';
import { memberCode, bookingCode } from '../../lib/codes.js';
import { getZaloPhone, getZaloProfile, sendOAMessage } from '../../lib/zalo.js';
import {
  changePoints,
  expireVouchers,
  issueVoucher,
  membershipInfo,
  tierFor,
  voucherIneligibility,
} from '../../services/loyalty.js';
import { getNumberSetting, getPublicSettings } from '../../services/settings.js';
import { validateBookingTime } from '../../services/bookings.js';

/** API cho Zalo Mini App (khách hàng) – prefix /api/app */
export const appRouter = Router();

const activeWindow = (now: Date) => ({
  active: true,
  AND: [{ OR: [{ startDate: null }, { startDate: { lte: now } }] }, { OR: [{ endDate: null }, { endDate: { gte: now } }] }],
});

async function serializeMe(customerId: number) {
  const c = await prisma.customer.findUniqueOrThrow({ where: { id: customerId }, include: { tier: true } });
  await expireVouchers(customerId);
  const availableVouchers = await prisma.customerVoucher.count({ where: { customerId, status: 'AVAILABLE' } });
  return {
    id: c.id,
    name: c.name,
    avatar: c.avatar,
    phone: c.phone,
    birthday: c.birthday,
    gender: c.gender,
    memberCode: c.memberCode,
    points: c.points,
    lifetimePoints: c.lifetimePoints,
    totalSpent: c.totalSpent,
    visitCount: c.visitCount,
    followedOA: c.followedOA,
    createdAt: c.createdAt,
    availableVouchers,
    ...(await membershipInfo(c)),
  };
}

// ---------- Public ----------

appRouter.get('/config', async (_req, res) => {
  res.json(await getPublicSettings());
});

appRouter.get('/branches', async (_req, res) => {
  res.json(await prisma.branch.findMany({ where: { active: true }, orderBy: { id: 'asc' } }));
});

appRouter.get('/tiers', async (_req, res) => {
  res.json(await prisma.tier.findMany({ orderBy: { minPoints: 'asc' } }));
});

appRouter.get('/promotions', async (req, res) => {
  const now = new Date();
  const featured = req.query.featured === 'true';
  res.json(
    await prisma.promotion.findMany({
      where: { ...activeWindow(now), ...(featured ? { featured: true } : {}) },
      orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
    }),
  );
});

appRouter.get('/promotions/:id', async (req, res) => {
  const p = await prisma.promotion.findFirst({ where: { id: idParam(req.params.id), ...activeWindow(new Date()) } });
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

  let customer = await prisma.customer.findUnique({ where: { zaloId: profile.id } });
  let isNew = false;
  if (!customer) {
    isNew = true;
    customer = await prisma.$transaction(async (tx) => {
      let created = null;
      for (let i = 0; i < 5 && !created; i++) {
        const code = memberCode();
        if (await tx.customer.findUnique({ where: { memberCode: code } })) continue;
        const tier = await tierFor(tx, 0);
        created = await tx.customer.create({
          data: {
            zaloId: profile.id,
            name: body.name || profile.name,
            avatar: body.avatar || profile.avatar,
            zaloOAId: body.idByOA,
            followedOA: body.followedOA ?? false,
            memberCode: code,
            tierId: tier?.id,
          },
        });
      }
      if (!created) throw new Error('Không tạo được mã thành viên');
      const welcome = await getNumberSetting('welcomePoints');
      if (welcome > 0) {
        await changePoints(tx, {
          customerId: created.id,
          points: welcome,
          type: 'WELCOME',
          description: 'Quà chào mừng thành viên mới',
        });
      }
      return created;
    });
  } else {
    customer = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        avatar: body.avatar || profile.avatar || customer.avatar,
        ...(body.idByOA ? { zaloOAId: body.idByOA } : {}),
        ...(body.followedOA !== undefined ? { followedOA: body.followedOA } : {}),
      },
    });
  }

  res.json({ token: signCustomerToken(customer.id), isNew, customer: await serializeMe(customer.id) });
});

// ---------- Cần đăng nhập ----------

appRouter.use(requireCustomer);

appRouter.get('/me', async (req, res) => {
  res.json(await serializeMe(req.customerId!));
});

const profileSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  birthday: optionalDate,
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).nullable().optional(),
  followedOA: z.boolean().optional(),
  idByOA: z.string().optional(),
});

appRouter.put('/me', async (req, res) => {
  const { idByOA, ...body } = profileSchema.parse(req.body);
  await prisma.customer.update({
    where: { id: req.customerId! },
    data: { ...body, ...(idByOA ? { zaloOAId: idByOA } : {}) },
  });
  res.json(await serializeMe(req.customerId!));
});

const phoneBody = z.object({
  /** token từ zmp-sdk getPhoneNumber() */
  token: z.string().optional(),
  accessToken: z.string().optional(),
  /** Chỉ dùng khi ZALO_MOCK=true */
  phone: z.string().optional(),
});

appRouter.post('/me/phone', async (req, res) => {
  const body = phoneBody.parse(req.body);
  let phone: string;
  if (config.zalo.mock && body.phone) {
    phone = phoneSchema.parse(body.phone);
  } else {
    if (!body.token || !body.accessToken) throw badRequest('Thiếu token hoặc accessToken');
    phone = phoneSchema.parse(await getZaloPhone(body.accessToken, body.token));
  }
  const owner = await prisma.customer.findUnique({ where: { phone } });
  if (owner && owner.id !== req.customerId) {
    throw badRequest('Số điện thoại đã gắn với tài khoản khác, vui lòng liên hệ nhà hàng');
  }
  await prisma.customer.update({ where: { id: req.customerId! }, data: { phone } });
  res.json(await serializeMe(req.customerId!));
});

appRouter.get('/me/points', async (req, res) => {
  const { page, pageSize, skip, take } = paging(req.query);
  const where = { customerId: req.customerId! };
  const [items, total] = await Promise.all([
    prisma.pointTransaction.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    prisma.pointTransaction.count({ where }),
  ]);
  res.json({ items, total, page, pageSize });
});

// ----- Voucher -----

/** Danh sách ưu đãi có thể nhận (pointCost = 0) hoặc đổi điểm (pointCost > 0) */
appRouter.get('/vouchers', async (req, res) => {
  const now = new Date();
  const type = req.query.type; // 'free' | 'points' | undefined
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: req.customerId! }, include: { tier: true } });
  const vouchers = await prisma.voucher.findMany({
    where: {
      ...activeWindow(now),
      ...(type === 'free' ? { pointCost: 0 } : type === 'points' ? { pointCost: { gt: 0 } } : {}),
    },
    include: { minTier: true },
    orderBy: [{ pointCost: 'asc' }, { createdAt: 'desc' }],
  });
  const owned = await prisma.customerVoucher.groupBy({
    by: ['voucherId'],
    where: { customerId: customer.id },
    _count: { _all: true },
  });
  const ownedMap = new Map(owned.map((o) => [o.voucherId, o._count._all]));
  res.json(
    vouchers.map((v) => {
      const reason = voucherIneligibility(v, customer, ownedMap.get(v.id) ?? 0, now);
      const remaining = v.totalQuantity === null ? null : Math.max(0, v.totalQuantity - v.issuedCount);
      return { ...v, remaining, ownedCount: ownedMap.get(v.id) ?? 0, canClaim: !reason, reason };
    }),
  );
});

appRouter.get('/vouchers/:id', async (req, res) => {
  const v = await prisma.voucher.findUnique({ where: { id: idParam(req.params.id) }, include: { minTier: true } });
  if (!v || !v.active) throw notFound('Ưu đãi không tồn tại');
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: req.customerId! }, include: { tier: true } });
  const ownedCount = await prisma.customerVoucher.count({ where: { customerId: customer.id, voucherId: v.id } });
  const reason = voucherIneligibility(v, customer, ownedCount);
  const remaining = v.totalQuantity === null ? null : Math.max(0, v.totalQuantity - v.issuedCount);
  res.json({ ...v, remaining, ownedCount, canClaim: !reason, reason });
});

/** Nhận voucher miễn phí hoặc đổi điểm lấy voucher */
appRouter.post('/vouchers/:id/claim', async (req, res) => {
  const voucherId = idParam(req.params.id);
  const v = await prisma.voucher.findUnique({ where: { id: voucherId } });
  if (!v) throw notFound('Ưu đãi không tồn tại');
  const cv = await prisma.$transaction((tx) =>
    issueVoucher(tx, { customerId: req.customerId!, voucherId, source: v.pointCost > 0 ? 'REDEEM' : 'CLAIM' }),
  );
  res.status(201).json(cv);
});

appRouter.get('/my-vouchers', async (req, res) => {
  await expireVouchers(req.customerId);
  const status = z.enum(['AVAILABLE', 'USED', 'EXPIRED']).optional().parse(req.query.status || undefined);
  res.json(
    await prisma.customerVoucher.findMany({
      where: { customerId: req.customerId!, ...(status ? { status } : {}) },
      include: { voucher: true },
      orderBy: [{ status: 'asc' }, { expiresAt: 'asc' }],
    }),
  );
});

appRouter.get('/my-vouchers/:id', async (req, res) => {
  await expireVouchers(req.customerId);
  const cv = await prisma.customerVoucher.findFirst({
    where: { id: idParam(req.params.id), customerId: req.customerId! },
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
    where: { id: idParam(req.params.id), customerId: req.customerId! },
    include: { branch: true },
  });
  if (!b) throw notFound('Lịch đặt bàn không tồn tại');
  res.json(b);
});

appRouter.post('/bookings', async (req, res) => {
  const body = bookingSchema.parse(req.body);
  const branch = await prisma.branch.findFirst({ where: { id: body.branchId, active: true } });
  if (!branch) throw badRequest('Chi nhánh không tồn tại');
  await validateBookingTime(body.bookingTime, body.partySize, branch);

  const pending = await prisma.booking.count({
    where: { customerId: req.customerId!, status: { in: ['PENDING', 'CONFIRMED'] }, bookingTime: { gte: new Date() } },
  });
  if (pending >= 3) throw badRequest('Bạn đang có 3 lịch đặt bàn chưa diễn ra, vui lòng huỷ bớt hoặc liên hệ nhà hàng');

  const booking = await prisma.booking.create({
    data: { ...body, code: bookingCode(), customerId: req.customerId! },
    include: { branch: true },
  });
  res.status(201).json(booking);
});

appRouter.post('/bookings/:id/cancel', async (req, res) => {
  const b = await prisma.booking.findFirst({ where: { id: idParam(req.params.id), customerId: req.customerId! } });
  if (!b) throw notFound('Lịch đặt bàn không tồn tại');
  if (!['PENDING', 'CONFIRMED'].includes(b.status)) throw badRequest('Không thể huỷ lịch đặt bàn này');
  if (b.bookingTime < new Date()) throw badRequest('Lịch đặt bàn đã qua, vui lòng liên hệ nhà hàng');
  const updated = await prisma.booking.update({
    where: { id: b.id },
    data: { status: 'CANCELLED' },
    include: { branch: true, customer: true },
  });
  if (updated.customer.zaloOAId) {
    void sendOAMessage(updated.customer.zaloOAId, `Bạn đã huỷ lịch đặt bàn ${updated.code}. Hẹn gặp lại bạn lần sau!`);
  }
  const { customer: _c, ...rest } = updated;
  res.json(rest);
});

// ----- Lịch sử ăn uống -----

appRouter.get('/orders', async (req, res) => {
  const { page, pageSize, skip, take } = paging(req.query);
  const where = { customerId: req.customerId! };
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
    where: { id: idParam(req.params.id), customerId: req.customerId! },
    include: { items: true, branch: true, usedVoucher: { include: { voucher: true } } },
  });
  if (!o) throw notFound('Hoá đơn không tồn tại');
  res.json(o);
});
