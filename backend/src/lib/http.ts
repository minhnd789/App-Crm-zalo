import { z } from 'zod';
import { badRequest } from './errors.js';

export const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function paging(query: unknown) {
  const { page, pageSize } = pagingSchema.parse(query);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function idParam(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('ID không hợp lệ');
  return id;
}

/** Ngày dạng chuỗi ISO / YYYY-MM-DD, cho phép null để xoá */
export const optionalDate = z
  .union([z.string().min(1), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === null) return v;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'Ngày không hợp lệ' });
      return z.NEVER;
    }
    return d;
  });

export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s.-]/g, '').replace(/^\+?84/, '0'))
  .pipe(z.string().regex(/^0\d{9,10}$/, 'Số điện thoại không hợp lệ'));
