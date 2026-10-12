import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { publicBrand, requireAdmin, signAdminToken } from '../../lib/auth.js';
import { badRequest, unauthorized } from '../../lib/errors.js';

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { username, password } = z.object({ username: z.string(), password: z.string() }).parse(req.body);
  const admin = await prisma.admin.findUnique({ where: { username } });
  if (!admin || !admin.active || !(await bcrypt.compare(password, admin.passwordHash))) {
    throw unauthorized('Sai tên đăng nhập hoặc mật khẩu');
  }
  res.json({
    token: signAdminToken(admin.id),
    admin: { id: admin.id, username: admin.username, name: admin.name, role: admin.role, brandId: admin.brandId },
  });
});

/** Admin hiện tại + danh sách thương hiệu được phép thao tác */
authRouter.get('/me', requireAdmin, async (req, res) => {
  const brands = await prisma.brand.findMany({
    where: req.admin!.brandId ? { id: req.admin!.brandId } : {},
    orderBy: { id: 'asc' },
  });
  res.json({ ...req.admin, brands: brands.map(publicBrand) });
});

authRouter.post('/change-password', requireAdmin, async (req, res) => {
  const { oldPassword, newPassword } = z
    .object({ oldPassword: z.string(), newPassword: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự') })
    .parse(req.body);
  const admin = await prisma.admin.findUniqueOrThrow({ where: { id: req.admin!.id } });
  if (!(await bcrypt.compare(oldPassword, admin.passwordHash))) throw badRequest('Mật khẩu cũ không đúng');
  await prisma.admin.update({ where: { id: admin.id }, data: { passwordHash: await bcrypt.hash(newPassword, 10) } });
  res.json({ ok: true });
});
