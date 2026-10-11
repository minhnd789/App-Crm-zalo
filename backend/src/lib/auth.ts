import type { RequestHandler, Request } from 'express';
import type { Brand } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { badRequest, forbidden, notFound, unauthorized } from './errors.js';

export interface AdminPrincipal {
  id: number;
  username: string;
  name: string;
  role: 'ADMIN' | 'STAFF';
  /** null = quản trị toàn hệ thống */
  brandId: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customerId?: number;
      admin?: AdminPrincipal;
      /** Thương hiệu đang thao tác (Mini App: theo header X-Brand / token; Admin: theo header X-Brand-Id) */
      brand?: Brand;
    }
  }
}

function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  return h.slice(7);
}

/** Bỏ các trường bí mật trước khi trả Brand ra API */
export function publicBrand(b: Brand) {
  const { zaloAppSecretKey, zaloOaAccessToken, posApiKeyHash, posWebhookSecret, ...rest } = b;
  return {
    ...rest,
    hasZaloAppSecretKey: !!zaloAppSecretKey,
    hasZaloOaAccessToken: !!zaloOaAccessToken,
    hasPosApiKey: !!posApiKeyHash,
    hasPosWebhookSecret: !!posWebhookSecret,
  };
}

// ---------------- Mini App ----------------

export const signCustomerToken = (customerId: number, brandId: number) =>
  jwt.sign({ sub: String(customerId), brand: brandId, aud: 'app' }, config.jwtSecretApp, { expiresIn: '30d' });

/** Xác định thương hiệu của Mini App qua header `X-Brand: <mã thương hiệu>` */
export const appBrand: RequestHandler = async (req, _res, next) => {
  const code = req.header('x-brand');
  if (!code) throw badRequest('Thiếu header X-Brand');
  const brand = await prisma.brand.findUnique({ where: { code } });
  if (!brand || !brand.active) throw badRequest('Thương hiệu không tồn tại hoặc đã ngừng hoạt động');
  req.brand = brand;
  next();
};

/** Bắt buộc đăng nhập khách hàng. Token chỉ dùng được trong Mini App của thương hiệu đã cấp. */
export const requireCustomer: RequestHandler = async (req, _res, next) => {
  const token = bearer(req);
  if (!token) throw unauthorized('Vui lòng đăng nhập');
  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecretApp, { audience: 'app' }) as jwt.JwtPayload;
  } catch {
    throw unauthorized();
  }
  if (payload.brand !== req.brand!.id) throw unauthorized();
  const customer = await prisma.customer.findUnique({ where: { id: Number(payload.sub) }, select: { id: true } });
  if (!customer) throw unauthorized();
  req.customerId = customer.id;
  next();
};

// ---------------- Trang quản trị ----------------

export const signAdminToken = (adminId: number) =>
  jwt.sign({ sub: String(adminId), aud: 'admin' }, config.jwtSecretAdmin, { expiresIn: '12h' });

export const requireAdmin: RequestHandler = async (req, _res, next) => {
  const token = bearer(req);
  if (!token) throw unauthorized('Vui lòng đăng nhập');
  let sub: string;
  try {
    sub = (jwt.verify(token, config.jwtSecretAdmin, { audience: 'admin' }) as jwt.JwtPayload).sub!;
  } catch {
    throw unauthorized();
  }
  const admin = await prisma.admin.findUnique({ where: { id: Number(sub) } });
  if (!admin || !admin.active) throw unauthorized();
  req.admin = {
    id: admin.id,
    username: admin.username,
    name: admin.name,
    role: admin.role as AdminPrincipal['role'],
    brandId: admin.brandId,
  };
  next();
};

/**
 * Bộ lọc thương hiệu của trang quản trị trung tâm qua header `X-Brand-Id`.
 * - Không gửi header (tài khoản toàn hệ thống) → xem dữ liệu TẤT CẢ thương hiệu (`req.brand` để trống).
 * - Tài khoản gắn 1 thương hiệu luôn bị giới hạn trong thương hiệu đó.
 */
export const adminBrand: RequestHandler = async (req, _res, next) => {
  const raw = req.header('x-brand-id');
  const own = req.admin!.brandId;
  const brandId = raw ? Number(raw) : own;
  if (raw && (!Number.isInteger(brandId) || brandId! <= 0)) throw badRequest('X-Brand-Id không hợp lệ');
  if (own !== null && brandId !== own) throw forbidden('Bạn chỉ được thao tác trong thương hiệu của mình');
  if (brandId != null) {
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw badRequest('Thương hiệu không tồn tại');
    req.brand = brand;
  }
  next();
};

/** Điều kiện lọc Prisma theo thương hiệu đang lọc (rỗng = mọi thương hiệu) */
export const brandWhere = (req: Request) => (req.brand ? { brandId: req.brand.id } : {});

/** Bản ghi phải thuộc thương hiệu đang lọc (nếu có), nếu không coi như không tồn tại */
export function assertBrandAccess(req: Request, brandId: number, msg = 'Không tìm thấy dữ liệu') {
  if (req.brand && req.brand.id !== brandId) throw notFound(msg);
}

/**
 * Thương hiệu dùng khi tạo mới dữ liệu: lấy từ body `brandId` hoặc bộ lọc đang chọn.
 * Tài khoản gắn thương hiệu chỉ tạo được trong thương hiệu mình.
 */
export async function brandForWrite(req: Request, bodyBrandId?: number | null): Promise<Brand> {
  if (req.brand) {
    if (bodyBrandId && bodyBrandId !== req.brand.id) throw forbidden('Bạn chỉ được thao tác trong thương hiệu đang chọn');
    return req.brand;
  }
  if (!bodyBrandId) throw badRequest('Vui lòng chọn thương hiệu');
  const brand = await prisma.brand.findUnique({ where: { id: bodyBrandId } });
  if (!brand) throw badRequest('Thương hiệu không tồn tại');
  return brand;
}

/** Quản lý (role ADMIN) – của thương hiệu hoặc toàn hệ thống */
export const requireManager: RequestHandler = (req, _res, next) => {
  if (req.admin?.role !== 'ADMIN') throw forbidden();
  next();
};

/** Quản trị toàn hệ thống (role ADMIN, không gắn thương hiệu) – quản lý thương hiệu, hạng dùng chung */
export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (req.admin?.role !== 'ADMIN' || req.admin.brandId !== null) {
    throw forbidden('Chỉ quản trị toàn hệ thống được thực hiện thao tác này');
  }
  next();
};
