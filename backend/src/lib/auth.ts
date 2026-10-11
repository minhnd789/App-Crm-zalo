import type { RequestHandler, Request } from 'express';
import type { Brand } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { badRequest, forbidden, unauthorized } from './errors.js';

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
  const { zaloAppSecretKey, zaloOaAccessToken, ...rest } = b;
  return { ...rest, hasZaloAppSecretKey: !!zaloAppSecretKey, hasZaloOaAccessToken: !!zaloOaAccessToken };
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
 * Xác định thương hiệu đang thao tác qua header `X-Brand-Id`.
 * Tài khoản thuộc 1 thương hiệu luôn bị giới hạn trong thương hiệu đó.
 * `required = false`: không có header thì để trống (dùng cho dữ liệu dùng chung như khách hàng).
 */
export const adminBrand =
  (required = true): RequestHandler =>
  async (req, _res, next) => {
    const raw = req.header('x-brand-id');
    const own = req.admin!.brandId;
    let brandId = raw ? Number(raw) : own;
    if (raw && (!Number.isInteger(brandId) || brandId! <= 0)) throw badRequest('X-Brand-Id không hợp lệ');
    if (own !== null && brandId !== own) throw forbidden('Bạn chỉ được thao tác trong thương hiệu của mình');
    if (brandId == null) {
      if (required) throw badRequest('Vui lòng chọn thương hiệu');
      next();
      return;
    }
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) throw badRequest('Thương hiệu không tồn tại');
    req.brand = brand;
    next();
  };

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
