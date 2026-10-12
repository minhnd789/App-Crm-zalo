import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);
export const notFound = (msg = 'Không tìm thấy dữ liệu') => new HttpError(404, msg);
export const forbidden = (msg = 'Bạn không có quyền thực hiện thao tác này') => new HttpError(403, msg);
export const unauthorized = (msg = 'Phiên đăng nhập không hợp lệ') => new HttpError(401, msg);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    res.status(400).json({
      error: first ? `${first.path.join('.') || 'dữ liệu'}: ${first.message}` : 'Dữ liệu không hợp lệ',
      issues: err.issues,
    });
    return;
  }
  // Prisma unique constraint
  if (err?.code === 'P2002') {
    res.status(409).json({ error: 'Dữ liệu bị trùng (đã tồn tại)' });
    return;
  }
  if (err?.code === 'P2025') {
    res.status(404).json({ error: 'Không tìm thấy dữ liệu' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Lỗi hệ thống, vui lòng thử lại sau' });
};
