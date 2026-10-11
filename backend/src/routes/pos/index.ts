import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { unauthorized, notFound } from '../../lib/errors.js';
import { expireVouchers, membershipInfo } from '../../services/loyalty.js';
import { hashApiKey, normalizeBillAmounts, processPosBill, resolvePosCustomer } from '../../services/pos.js';

/**
 * API cho phần mềm bán hàng (r_keeper qua connector DCorp) – prefix /api/pos.
 * Xác thực bằng header `X-Api-Key` (mỗi thương hiệu 1 key, tạo trên trang quản trị).
 * Đặc tả: docs/POS-INTEGRATION.md
 */
export const posRouter = Router();

const posAuth: RequestHandler = async (req, _res, next) => {
  const key = req.header('x-api-key');
  if (!key) throw unauthorized('Thiếu X-Api-Key');
  const brand = await prisma.brand.findFirst({ where: { posApiKeyHash: hashApiKey(key), posEnabled: true, active: true } });
  if (!brand) throw unauthorized('API key không hợp lệ hoặc thương hiệu chưa bật kết nối POS');
  req.brand = brand;
  next();
};
posRouter.use(posAuth);

const money = z.number().int().min(0);
const billSchema = z
  .object({
    /** Mã bill / check bên r_keeper – duy nhất trong thương hiệu, dùng chống ghi nhận trùng */
    billId: z.union([z.string(), z.number()]).transform(String).pipe(z.string().trim().min(1).max(100)),
    status: z.enum(['PAID', 'VOID']).default('PAID'),
    /** Mã nhà hàng / điểm bán bên r_keeper (khai báo ở mục Cơ sở trên trang quản trị) */
    branchCode: z.string().trim().max(50).optional(),
    customer: z
      .object({
        memberCode: z.string().trim().max(50).optional(),
        phone: z.string().trim().max(20).optional(),
        posCustomerId: z.union([z.string(), z.number()]).transform(String).optional(),
      })
      .optional(),
    subtotal: money,
    discount: money.optional(),
    total: money.optional(),
    items: z
      .array(z.object({ name: z.string().trim().min(1).max(200), quantity: z.number().positive(), price: z.number().int() }))
      .default([]),
    voucherCode: z.string().trim().max(50).optional(),
    paidAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)).optional(),
  })
  .transform((b) => ({
    ...b,
    ...normalizeBillAmounts(b),
    // r_keeper có thể gửi số lượng lẻ (0.5 suất) → lưu làm tròn lên, giá dòng giữ nguyên
    items: b.items.map((i) => ({ name: i.name, quantity: Math.max(1, Math.round(i.quantity)), price: i.price })),
  }));

/**
 * Nhận bill từ POS.
 * 201 – đã cộng điểm; 200 – bill đã ghi nhận trước đó (gửi lại); 202 – đã lưu nhưng chưa khớp khách / cơ sở
 * (quản trị xử lý trên trang "Đồng bộ POS", POS KHÔNG cần gửi lại).
 */
posRouter.post('/bills', async (req, res) => {
  const bill = billSchema.parse(req.body);
  const brand = req.brand!;
  const result = await processPosBill(brand, bill);
  // Lưu phản hồi vào nhật ký để quản trị phân biệt bill gửi lại (duplicate) với bill gốc
  const respond = async (code: number, body: Record<string, unknown>) => {
    await prisma.posSyncLog.update({ where: { id: result.logId }, data: { response: JSON.stringify(body) } });
    res.status(code).json(body);
  };
  if (result.status !== 'SUCCESS') {
    await respond(202, { status: result.status, message: result.message, logId: result.logId });
    return;
  }
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: result.orderId },
    include: { customer: { include: { tier: true } } },
  });
  const wallet = await prisma.customerWallet.findUnique({
    where: { customerId_brandId: { customerId: order.customerId, brandId: brand.id } },
  });
  await respond(result.duplicate ? 200 : 201, {
    status: order.status === 'CANCELLED' ? 'CANCELLED' : 'SUCCESS',
    duplicate: result.duplicate,
    warning: result.warning ?? null,
    orderCode: order.code,
    pointsEarned: order.pointsEarned,
    customer: {
      memberCode: order.customer.memberCode,
      name: order.customer.name,
      points: wallet?.points ?? 0,
      tier: order.customer.tier ? { code: order.customer.tier.code, name: order.customer.tier.name } : null,
      totalSpent: order.customer.totalSpent,
    },
  });
});

/** Tra cứu thành viên tại máy POS (quét QR / nhập SĐT): điểm, hạng, voucher còn dùng được */
posRouter.get('/customers/lookup', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const brandId = req.brand!.id;
  const customerId = await resolvePosCustomer(brandId, { memberCode: q, phone: q, posCustomerId: q });
  if (!customerId) throw notFound('Không tìm thấy thành viên');
  await expireVouchers(customerId);
  const c = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    include: { tier: true, wallets: { where: { brandId }, include: { homeBranch: true } } },
  });
  const vouchers = await prisma.customerVoucher.findMany({
    where: { customerId, brandId, status: 'AVAILABLE' },
    include: { voucher: true },
    orderBy: { expiresAt: 'asc' },
  });
  const w = c.wallets[0];
  res.json({
    memberCode: c.memberCode,
    posCustomerId: w?.posCustomerId ?? null,
    name: c.name,
    phone: c.phone,
    birthday: c.birthday ? c.birthday.toISOString().slice(0, 10) : null,
    registered: !!w?.registeredAt,
    homeBranch: w?.homeBranch ? { name: w.homeBranch.name, posCode: w.homeBranch.posCode } : null,
    points: w?.points ?? 0,
    totalSpent: c.totalSpent,
    ...(await membershipInfo(c)),
    vouchers: vouchers.map((v) => ({
      code: v.code,
      title: v.voucher.title,
      discountType: v.voucher.discountType,
      discountValue: v.voucher.discountValue,
      maxDiscount: v.voucher.maxDiscount,
      minOrder: v.voucher.minOrder,
      expiresAt: v.expiresAt,
    })),
  });
});
