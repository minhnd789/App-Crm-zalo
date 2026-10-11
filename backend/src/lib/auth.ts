import type { RequestHandler, Request } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { forbidden, unauthorized } from './errors.js';

export interface AdminPrincipal {
  id: number;
  username: string;
  name: string;
  role: 'ADMIN' | 'STAFF';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      customerId?: number;
      admin?: AdminPrincipal;
    }
  }
}

function bearer(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  return h.slice(7);
}

export const signCustomerToken = (customerId: number) =>
  jwt.sign({ sub: String(customerId), aud: 'app' }, config.jwtSecretApp, { expiresIn: '30d' });

export const signAdminToken = (adminId: number) =>
  jwt.sign({ sub: String(adminId), aud: 'admin' }, config.jwtSecretAdmin, { expiresIn: '12h' });

export const requireCustomer: RequestHandler = async (req, _res, next) => {
  const token = bearer(req);
  if (!token) throw unauthorized('Vui lòng đăng nhập');
  let sub: string;
  try {
    sub = (jwt.verify(token, config.jwtSecretApp, { audience: 'app' }) as jwt.JwtPayload).sub!;
  } catch {
    throw unauthorized();
  }
  const customer = await prisma.customer.findUnique({ where: { id: Number(sub) }, select: { id: true } });
  if (!customer) throw unauthorized();
  req.customerId = customer.id;
  next();
};

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
  req.admin = { id: admin.id, username: admin.username, name: admin.name, role: admin.role as AdminPrincipal['role'] };
  next();
};

/** Chỉ cho phép role ADMIN (quản lý). STAFF chỉ thao tác nghiệp vụ hằng ngày. */
export const requireManager: RequestHandler = (req, _res, next) => {
  if (req.admin?.role !== 'ADMIN') throw forbidden();
  next();
};
