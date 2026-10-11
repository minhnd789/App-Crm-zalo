/**
 * Kết nối phần mềm bán hàng (r_keeper qua DCorp).
 *
 * - OUT (CRM → POS): khi khách đăng ký / cập nhật thông tin thành viên, CRM đưa sự kiện CUSTOMER_UPSERT vào hàng đợi
 *   và gửi tới `brand.posWebhookUrl` (connector r_keeper / DCorp), ký HMAC bằng `brand.posWebhookSecret`.
 *   Lỗi sẽ tự gửi lại với thời gian chờ tăng dần.
 * - IN (POS → CRM): POS gửi bill đã thanh toán về `POST /api/pos/bills` để cộng điểm tích luỹ (ví thương hiệu)
 *   và chi tiêu xét hạng (dùng chung). Bill trùng mã bị bỏ qua; bill huỷ thì hoàn điểm.
 *
 * Định dạng dữ liệu xem docs/POS-INTEGRATION.md.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { Brand, PosSyncLog, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { HttpError, badRequest } from '../lib/errors.js';
import { cancelOrder, createOrder } from './orders.js';

const MAX_ATTEMPTS = 8;
const WEBHOOK_TIMEOUT_MS = 10_000;

export const hashApiKey = (key: string) => createHash('sha256').update(key).digest('hex');

/** Tạo API key mới cho thương hiệu – chỉ trả về bản rõ 1 lần */
export async function rotatePosApiKey(brandId: number) {
  const key = `pos_${randomBytes(24).toString('base64url')}`;
  await prisma.brand.update({ where: { id: brandId }, data: { posApiKeyHash: hashApiKey(key) } });
  return key;
}

export const signBody = (secret: string, body: string) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

// =====================================================================
// OUT: CRM → POS (khách hàng mới / cập nhật)
// =====================================================================

/** Đưa khách vào hàng đợi đồng bộ sang POS của các thương hiệu khách đã đăng ký (hoặc 1 thương hiệu) */
export async function enqueueCustomerUpsert(customerId: number, onlyBrandId?: number) {
  const wallets = await prisma.customerWallet.findMany({
    where: {
      customerId,
      registeredAt: { not: null },
      brand: { posEnabled: true, posWebhookUrl: { not: null } },
      ...(onlyBrandId ? { brandId: onlyBrandId } : {}),
    },
    select: { brandId: true },
  });
  for (const w of wallets) {
    // Gộp các sự kiện chưa gửi của cùng khách → chỉ giữ 1 bản đang chờ
    const pending = await prisma.posSyncLog.findFirst({
      where: { brandId: w.brandId, direction: 'OUT', type: 'CUSTOMER_UPSERT', customerId, status: 'PENDING' },
    });
    if (pending) continue;
    await prisma.posSyncLog.create({
      data: {
        brandId: w.brandId,
        direction: 'OUT',
        type: 'CUSTOMER_UPSERT',
        customerId,
        externalId: String(customerId),
        payload: '{}', // dựng lại lúc gửi để luôn là dữ liệu mới nhất
        nextRetryAt: new Date(),
      },
    });
  }
}

/** Dữ liệu khách gửi sang POS */
export async function customerPayload(customerId: number, brandId: number) {
  const c = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    include: { tier: true, wallets: { where: { brandId }, include: { homeBranch: true, brand: true } } },
  });
  const w = c.wallets[0];
  return {
    event: 'customer.upsert',
    brand: w ? { code: w.brand.code, name: w.brand.name } : null,
    customer: {
      crmId: c.id,
      memberCode: c.memberCode, // in trên QR thành viên – POS có thể quét để nhận diện khách
      posCustomerId: w?.posCustomerId ?? null,
      name: c.name,
      phone: c.phone,
      birthday: c.birthday ? c.birthday.toISOString().slice(0, 10) : null,
      gender: c.gender,
      homeBranch: w?.homeBranch ? { id: w.homeBranch.id, name: w.homeBranch.name, posCode: w.homeBranch.posCode } : null,
      tier: c.tier ? { code: c.tier.code, name: c.tier.name, pointMultiplier: c.tier.pointMultiplier } : null,
      points: w?.points ?? 0,
      totalSpent: c.totalSpent,
      registeredAt: w?.registeredAt?.toISOString() ?? null,
    },
  };
}

async function deliver(log: PosSyncLog & { brand: Brand }) {
  const brand = log.brand;
  if (!brand.posEnabled || !brand.posWebhookUrl) {
    await prisma.posSyncLog.update({ where: { id: log.id }, data: { status: 'IGNORED', error: 'Thương hiệu chưa bật kết nối POS', nextRetryAt: null } });
    return;
  }
  const customer = await prisma.customer.findUnique({ where: { id: log.customerId! } });
  if (!customer) {
    // Khách đã bị gộp vào hồ sơ khác → hồ sơ mới sẽ có sự kiện riêng
    await prisma.posSyncLog.update({ where: { id: log.id }, data: { status: 'IGNORED', error: 'Khách không còn tồn tại (đã gộp)', nextRetryAt: null } });
    return;
  }
  const payload = await customerPayload(customer.id, brand.id);
  const body = JSON.stringify(payload);
  const attempts = log.attempts + 1;
  try {
    const res = await fetch(brand.posWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CRM-Event': 'customer.upsert',
        'X-CRM-Delivery': String(log.id),
        ...(brand.posWebhookSecret ? { 'X-CRM-Signature': signBody(brand.posWebhookSecret, body) } : {}),
      },
      body,
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    // POS có thể trả về mã khách bên r_keeper: { "posCustomerId": "..." }
    let posCustomerId: string | undefined;
    try {
      const json = JSON.parse(text) as { posCustomerId?: unknown };
      if (json.posCustomerId != null && json.posCustomerId !== '') posCustomerId = String(json.posCustomerId);
    } catch {
      /* phản hồi không phải JSON – bỏ qua */
    }
    await prisma.$transaction([
      prisma.posSyncLog.update({
        where: { id: log.id },
        data: { status: 'SUCCESS', attempts, payload: body, response: text.slice(0, 2000), error: null, nextRetryAt: null },
      }),
      prisma.customerWallet.update({
        where: { customerId_brandId: { customerId: customer.id, brandId: brand.id } },
        data: { posSyncedAt: new Date(), ...(posCustomerId ? { posCustomerId } : {}) },
      }),
    ]);
  } catch (e) {
    const giveUp = attempts >= MAX_ATTEMPTS;
    const delayMin = Math.min(2 ** attempts, 360); // 2, 4, 8 ... tối đa 6 giờ
    await prisma.posSyncLog.update({
      where: { id: log.id },
      data: {
        status: giveUp ? 'FAILED' : 'PENDING',
        attempts,
        payload: body,
        error: e instanceof Error ? e.message : String(e),
        nextRetryAt: giveUp ? null : new Date(Date.now() + delayMin * 60_000),
      },
    });
  }
}

let running = false;
/** Gửi các sự kiện OUT đến hạn. Gọi định kỳ từ worker (src/index.ts) hoặc khi gửi lại thủ công. */
export async function processOutbox(limit = 20) {
  if (running) return 0;
  running = true;
  try {
    const due = await prisma.posSyncLog.findMany({
      where: { direction: 'OUT', status: 'PENDING', nextRetryAt: { lte: new Date() } },
      include: { brand: true },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
    });
    for (const log of due) await deliver(log);
    return due.length;
  } finally {
    running = false;
  }
}

export function startPosWorker(intervalMs = 30_000) {
  const timer = setInterval(() => {
    processOutbox().catch((e) => console.error('[POS] lỗi gửi hàng đợi:', e));
  }, intervalMs);
  timer.unref();
  return timer;
}

// =====================================================================
// IN: POS → CRM (bill thanh toán)
// =====================================================================

export interface PosBill {
  billId: string;
  status: 'PAID' | 'VOID';
  branchCode?: string;
  customer?: { memberCode?: string; phone?: string; posCustomerId?: string };
  subtotal: number;
  discount: number;
  total: number;
  items: { name: string; quantity: number; price: number }[];
  voucherCode?: string;
  paidAt?: Date;
}

/** Tìm khách theo thông tin POS gửi: mã thẻ r_keeper → mã thành viên (QR) → SĐT */
export async function resolvePosCustomer(brandId: number, c: PosBill['customer'], tx: Prisma.TransactionClient = prisma) {
  if (!c) return null;
  if (c.posCustomerId) {
    const w = await tx.customerWallet.findUnique({ where: { brandId_posCustomerId: { brandId, posCustomerId: c.posCustomerId } } });
    if (w) return w.customerId;
  }
  if (c.memberCode) {
    const found = await tx.customer.findUnique({ where: { memberCode: c.memberCode.trim() } });
    if (found) return found.id;
  }
  if (c.phone) {
    const phone = c.phone.replace(/[\s.-]/g, '').replace(/^\+?84/, '0');
    const found = await tx.customer.findUnique({ where: { phone } });
    if (found) return found.id;
  }
  return null;
}

type BillResult =
  | { status: 'SUCCESS'; duplicate: boolean; logId: number; orderId: number; warning?: string }
  | { status: 'UNMATCHED' | 'IGNORED'; logId: number; message: string };

/**
 * Xử lý bill từ POS. Luôn ghi nhật ký (kể cả khi không nhận diện được khách) để quản trị xử lý tay.
 * `logId` truyền vào khi xử lý lại 1 bill từ nhật ký; `customerId` khi quản trị gán khách cho bill chưa khớp.
 */
export async function processPosBill(brand: Brand, bill: PosBill, opts: { logId?: number; customerId?: number } = {}): Promise<BillResult> {
  const type = bill.status === 'VOID' ? 'BILL_VOID' : 'BILL_PAID';
  const payload = JSON.stringify(bill);
  const log = opts.logId
    ? await prisma.posSyncLog.update({ where: { id: opts.logId }, data: { attempts: { increment: 1 } } })
    : await prisma.posSyncLog.create({
        data: { brandId: brand.id, direction: 'IN', type, externalId: bill.billId, payload, attempts: 1 },
      });
  const finish = (data: Prisma.PosSyncLogUpdateInput) => prisma.posSyncLog.update({ where: { id: log.id }, data });

  const existing = await prisma.order.findUnique({ where: { brandId_externalId: { brandId: brand.id, externalId: bill.billId } } });

  // ----- Huỷ bill -----
  if (bill.status === 'VOID') {
    if (!existing) {
      await finish({ status: 'IGNORED', error: 'Không có hoá đơn tương ứng trong CRM' });
      return { status: 'IGNORED', logId: log.id, message: 'Không có hoá đơn tương ứng trong CRM' };
    }
    if (existing.status !== 'CANCELLED') await cancelOrder(brand.id, existing.id, null);
    await finish({ status: 'SUCCESS', orderId: existing.id, customerId: existing.customerId, error: null });
    return { status: 'SUCCESS', duplicate: existing.status === 'CANCELLED', logId: log.id, orderId: existing.id };
  }

  // ----- Bill thanh toán -----
  if (existing) {
    // POS gửi lại cùng 1 bill → không cộng điểm lần 2
    await finish({ status: 'SUCCESS', orderId: existing.id, customerId: existing.customerId, error: null });
    return { status: 'SUCCESS', duplicate: true, logId: log.id, orderId: existing.id };
  }

  let branchId: number | null = null;
  if (bill.branchCode) {
    const branch = await prisma.branch.findFirst({ where: { brandId: brand.id, posCode: bill.branchCode } });
    if (!branch) {
      const message = `Không tìm thấy cơ sở có mã POS "${bill.branchCode}"`;
      await finish({ status: 'UNMATCHED', error: message });
      return { status: 'UNMATCHED', logId: log.id, message };
    }
    branchId = branch.id;
  }

  const customerId = opts.customerId ?? (await resolvePosCustomer(brand.id, bill.customer));
  if (!customerId) {
    const message = 'Không nhận diện được khách hàng (bill không có thông tin thành viên hoặc khách chưa đăng ký)';
    await finish({ status: 'UNMATCHED', error: message });
    return { status: 'UNMATCHED', logId: log.id, message };
  }

  const base = {
    customerId,
    branchId,
    items: bill.items,
    subtotal: bill.subtotal,
    discount: bill.discount,
    note: null,
    source: 'POS' as const,
    externalId: bill.billId,
    discountsAppliedByPos: true,
    paidAt: bill.paidAt,
  };
  let warning: string | undefined;
  let result;
  try {
    result = await createOrder(brand, { ...base, voucherCode: bill.voucherCode ?? null }, null);
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      // 2 request cùng mã bill đến đồng thời → bản kia đã ghi nhận
      const dup = await prisma.order.findUniqueOrThrow({ where: { brandId_externalId: { brandId: brand.id, externalId: bill.billId } } });
      await finish({ status: 'SUCCESS', orderId: dup.id, customerId: dup.customerId, error: null });
      return { status: 'SUCCESS', duplicate: true, logId: log.id, orderId: dup.id };
    }
    if (!(e instanceof HttpError) || !bill.voucherCode) {
      await finish({ status: 'FAILED', customerId, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
    // Voucher không hợp lệ không được làm mất điểm của khách → vẫn ghi nhận bill, bỏ qua voucher
    warning = `Bỏ qua voucher ${bill.voucherCode}: ${e.message}`;
    result = await createOrder(brand, { ...base, voucherCode: null }, null);
  }
  await finish({ status: 'SUCCESS', customerId, orderId: result.order.id, error: warning ?? null });
  return { status: 'SUCCESS', duplicate: false, logId: log.id, orderId: result.order.id, warning };
}

/** Kiểm tra tổng tiền bill hợp lệ (dùng khi nhận từ API) */
export function normalizeBillAmounts(b: { subtotal: number; discount?: number; total?: number }) {
  const discount = b.discount ?? (b.total !== undefined ? b.subtotal - b.total : 0);
  const total = b.total ?? b.subtotal - discount;
  if (discount < 0 || total < 0 || b.subtotal - discount !== total) {
    throw badRequest('Tổng tiền không khớp: total phải bằng subtotal - discount');
  }
  return { discount, total };
}
