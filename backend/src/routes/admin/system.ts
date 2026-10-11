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
import { DEFAULT_SETTINGS, NUMERIC_SETTINGS, getSettings, type SettingKey } from '../../services/settings.js';

// ---------- Cấu hình ----------
export const settingsRouter = Router();

settingsRouter.get('/', async (_req, res) => {
  res.json(await getSettings());
});

settingsRouter.put('/', requireManager, async (req, res) => {
  const body = z.record(z.string(), z.union([z.string(), z.number()])).parse(req.body);
  for (const [key, raw] of Object.entries(body)) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    const value = String(raw);
    if (NUMERIC_SETTINGS.includes(key as SettingKey) && (!/^\d+$/.test(value) || (key === 'pointPerAmount' && Number(value) <= 0))) {
      throw badRequest(`Giá trị "${key}" phải là số nguyên dương`);
    }
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  res.json(await getSettings());
});

// ---------- Tài khoản quản trị ----------
export const adminsRouter = Router();
adminsRouter.use(requireManager);

const select = { id: true, username: true, name: true, role: true, active: true, createdAt: true } as const;

adminsRouter.get('/', async (_req, res) => {
  res.json(await prisma.admin.findMany({ select, orderBy: { id: 'asc' } }));
});

adminsRouter.post('/', async (req, res) => {
  const body = z
    .object({
      username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9_.]+$/, 'Chỉ dùng chữ, số, dấu _ và .'),
      name: z.string().trim().min(1).max(100),
      password: z.string().min(6),
      role: z.enum(['ADMIN', 'STAFF']).default('STAFF'),
    })
    .parse(req.body);
  const { password, ...rest } = body;
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
    })
    .parse(req.body);
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
