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

/**
 * Schema cho API cập nhật (PUT): mọi trường tuỳ chọn và KHÔNG áp giá trị mặc định
 * (zod 4 vẫn điền `.default()` trong `.partial()` → cập nhật 1 trường sẽ ghi đè các trường khác về mặc định).
 */
export function updateSchemaOf<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([k, v]) => [k, v instanceof z.ZodDefault ? v.unwrap() : v]),
  );
  return z.object(shape).partial() as unknown as ReturnType<z.ZodObject<T>['partial']>;
}
