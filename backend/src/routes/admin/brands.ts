import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { idParam, updateSchemaOf } from '../../lib/http.js';
import { publicBrand, requireSuperAdmin } from '../../lib/auth.js';
import { rotatePosApiKey } from '../../services/pos.js';

/** Quản lý thương hiệu – chỉ quản trị toàn hệ thống */
export const brandsRouter = Router();
brandsRouter.use(requireSuperAdmin);

const brandSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(30)
    .regex(/^[A-Za-z0-9_-]+$/, 'Mã chỉ gồm chữ, số, dấu _ và -')
    .toUpperCase(),
  name: z.string().trim().min(1).max(200),
  logoUrl: z.string().max(1000).nullable().optional(),
  primaryColor: z.string().max(20).default('#C2410C'),
  hotline: z.string().max(30).nullable().optional(),
  about: z.string().max(5000).nullable().optional(),
  zaloAppId: z.string().max(100).nullable().optional(),
  zaloOaId: z.string().max(100).nullable().optional(),
  /** Trường bí mật: bỏ trống / không gửi = giữ nguyên, null = xoá */
  zaloAppSecretKey: z.string().max(500).nullable().optional(),
  zaloOaAccessToken: z.string().max(2000).nullable().optional(),
  /** Kết nối phần mềm bán hàng (r_keeper qua DCorp) */
  posEnabled: z.boolean().default(false),
  posWebhookUrl: z.url('URL không hợp lệ').max(1000).nullable().optional().or(z.literal('').transform(() => null)),
  posWebhookSecret: z.string().max(500).nullable().optional(),
  active: z.boolean().default(true),
});

/** Chuỗi rỗng ở trường bí mật nghĩa là "không đổi" */
function dropEmptySecrets<
  T extends { zaloAppSecretKey?: string | null; zaloOaAccessToken?: string | null; posWebhookSecret?: string | null },
>(d: T): T {
  const r = { ...d };
  if (r.zaloAppSecretKey === '') delete r.zaloAppSecretKey;
  if (r.zaloOaAccessToken === '') delete r.zaloOaAccessToken;
  if (r.posWebhookSecret === '') delete r.posWebhookSecret;
  return r;
}

brandsRouter.get('/', async (_req, res) => {
  const brands = await prisma.brand.findMany({
    orderBy: { id: 'asc' },
    include: { _count: { select: { branches: true, wallets: true } } },
  });
  res.json(brands.map((b) => ({ ...publicBrand(b), _count: b._count })));
});

brandsRouter.post('/', async (req, res) => {
  const b = await prisma.brand.create({ data: dropEmptySecrets(brandSchema.parse(req.body)) });
  res.status(201).json(publicBrand(b));
});

brandsRouter.put('/:id', async (req, res) => {
  const b = await prisma.brand.update({
    where: { id: idParam(req.params.id) },
    data: dropEmptySecrets(updateSchemaOf(brandSchema).parse(req.body)),
  });
  res.json(publicBrand(b));
});

/** Tạo API key mới để phần mềm bán hàng gửi bill về (key cũ hết hiệu lực). Key chỉ hiển thị 1 lần. */
brandsRouter.post('/:id/pos-api-key', async (req, res) => {
  const id = idParam(req.params.id);
  await prisma.brand.findUniqueOrThrow({ where: { id } });
  res.json({ apiKey: await rotatePosApiKey(id) });
});
