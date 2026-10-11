import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { config } from '../../config.js';
import { badRequest } from '../../lib/errors.js';
import { idParam } from '../../lib/http.js';
import { requireManager } from '../../lib/auth.js';
import { DEFAULT_SETTINGS, getSettings } from '../../services/settings.js';

// ---------- Cấu hình (theo thương hiệu) ----------
export const settingsRouter = Router();

settingsRouter.get('/', async (req, res) => {
  res.json(await getSettings(req.brand!.id));
});

settingsRouter.put('/', requireManager, async (req, res) => {
  const brandId = req.brand!.id;
  const body = z.record(z.string(), z.union([z.string(), z.number()])).parse(req.body);
  for (const [key, raw] of Object.entries(body)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    const value = String(raw);
    // Mọi cấu hình hiện tại đều là số nguyên không âm
    if (!/^\d+$/.test(value) || (key === 'pointPerAmount' && Number(value) <= 0)) {
      throw badRequest(`Giá trị "${key}" phải là số nguyên dương`);
    }
    await prisma.setting.upsert({
      where: { brandId_key: { brandId, key } },
      create: { brandId, key, value },
      update: { value },
    });
  }
  res.json(await getSettings(brandId));
});

// ---------- Tài khoản quản trị ----------
// Quản trị toàn hệ thống quản lý mọi tài khoản; quản lý thương hiệu chỉ quản lý tài khoản trong thương hiệu mình.
export const adminsRouter = Router();
adminsRouter.use(requireManager);

const select = {
  id: true,
  username: true,
  name: true,
  role: true,
  brandId: true,
  brand: { select: { id: true, name: true } },
  active: true,
  createdAt: true,
} as const;

adminsRouter.get('/', async (req, res) => {
  const own = req.admin!.brandId;
  res.json(await prisma.admin.findMany({ where: own ? { brandId: own } : {}, select, orderBy: { id: 'asc' } }));
});

/** Quản lý thương hiệu không được tạo/sửa tài khoản ngoài thương hiệu mình */
function checkBrandScope(actorBrandId: number | null, targetBrandId: number | null | undefined) {
  if (actorBrandId !== null && targetBrandId !== actorBrandId) {
    throw badRequest('Bạn chỉ được quản lý tài khoản trong thương hiệu của mình');
  }
}

adminsRouter.post('/', async (req, res) => {
  const body = z
    .object({
      username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9_.]+$/, 'Chỉ dùng chữ, số, dấu _ và .'),
      name: z.string().trim().min(1).max(100),
      password: z.string().min(6),
      role: z.enum(['ADMIN', 'STAFF']).default('STAFF'),
      brandId: z.number().int().positive().nullable().optional(),
    })
    .parse(req.body);
  const own = req.admin!.brandId;
  // Không gửi brandId → mặc định thương hiệu của người tạo
  const brandId = body.brandId !== undefined ? body.brandId : own;
  checkBrandScope(own, brandId);
  const { password, ...rest } = { ...body, brandId };
  res.status(201).json(await prisma.admin.create({ data: { ...rest, passwordHash: await bcrypt.hash(password, 10) }, select }));
});

adminsRouter.put('/:id', async (req, res) => {
  const id = idParam(req.params.id);
  const body = z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      password: z.string().min(6).optional(),
      role: z.enum(['ADMIN', 'STAFF']).optional(),
      active: z.boolean().optional(),
      brandId: z.number().int().positive().nullable().optional(),
    })
    .parse(req.body);
  const target = await prisma.admin.findUnique({ where: { id } });
  if (!target) throw badRequest('Tài khoản không tồn tại');
  const own = req.admin!.brandId;
  checkBrandScope(own, target.brandId);
  if (body.brandId !== undefined) checkBrandScope(own, body.brandId);
  if (id === req.admin!.id && body.brandId !== undefined && body.brandId !== target.brandId) {
    throw badRequest('Không thể tự đổi thương hiệu của chính mình');
  }
  if (id === req.admin!.id && (body.active === false || body.role === 'STAFF')) {
    throw badRequest('Không thể tự khoá hoặc hạ quyền tài khoản của chính mình');
  }
  const { password, ...rest } = body;
  res.json(
    await prisma.admin.update({
      where: { id },
      data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
      select,
    }),
  );
});

// ---------- Upload ảnh ----------
export const uploadRouter = Router();

fs.mkdirSync(config.uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)),
});

uploadRouter.post('/', upload.single('file'), (req, res) => {
  if (!req.file) throw badRequest('Chỉ chấp nhận ảnh PNG/JPG/WEBP/GIF tối đa 5MB');
  const base = `${req.protocol}://${req.get('host')}`;
  res.status(201).json({ url: `${base}/uploads/${req.file.filename}` });
});
