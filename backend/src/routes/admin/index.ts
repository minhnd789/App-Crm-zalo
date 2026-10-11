import { Router } from 'express';
import { adminBrand, requireAdmin } from '../../lib/auth.js';
import { authRouter } from './auth.js';
import { brandsRouter } from './brands.js';
import { dashboardRouter } from './dashboard.js';
import { customersRouter } from './customers.js';
import { bookingsRouter } from './bookings.js';
import { ordersRouter } from './orders.js';
import { vouchersRouter } from './vouchers.js';
import { branchesRouter, promotionsRouter, tiersRouter } from './catalog.js';
import { adminsRouter, settingsRouter, uploadRouter } from './system.js';

/**
 * API trang quản trị trung tâm – prefix /api/admin.
 * Lọc theo thương hiệu qua header `X-Brand-Id` (không gửi = tất cả thương hiệu);
 * tài khoản gắn với 1 thương hiệu luôn bị giới hạn trong thương hiệu đó.
 */
export const adminRouter = Router();

adminRouter.use('/auth', authRouter);
adminRouter.use(requireAdmin);

// Dữ liệu dùng chung mọi thương hiệu
adminRouter.use('/brands', brandsRouter);
adminRouter.use('/tiers', tiersRouter);
adminRouter.use('/admins', adminsRouter);
adminRouter.use('/upload', uploadRouter);

// Dữ liệu lọc theo thương hiệu
adminRouter.use('/customers', adminBrand, customersRouter);
adminRouter.use('/dashboard', adminBrand, dashboardRouter);
adminRouter.use('/bookings', adminBrand, bookingsRouter);
adminRouter.use('/orders', adminBrand, ordersRouter);
adminRouter.use('/vouchers', adminBrand, vouchersRouter);
adminRouter.use('/promotions', adminBrand, promotionsRouter);
adminRouter.use('/branches', adminBrand, branchesRouter);
adminRouter.use('/settings', adminBrand, settingsRouter);
