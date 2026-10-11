import { Router } from 'express';
import { requireAdmin } from '../../lib/auth.js';
import { authRouter } from './auth.js';
import { dashboardRouter } from './dashboard.js';
import { customersRouter } from './customers.js';
import { bookingsRouter } from './bookings.js';
import { ordersRouter } from './orders.js';
import { vouchersRouter } from './vouchers.js';
import { branchesRouter, promotionsRouter, tiersRouter } from './catalog.js';
import { adminsRouter, settingsRouter, uploadRouter } from './system.js';

/** API trang quản trị – prefix /api/admin */
export const adminRouter = Router();

adminRouter.use('/auth', authRouter);
adminRouter.use(requireAdmin);
adminRouter.use('/dashboard', dashboardRouter);
adminRouter.use('/customers', customersRouter);
adminRouter.use('/bookings', bookingsRouter);
adminRouter.use('/orders', ordersRouter);
adminRouter.use('/vouchers', vouchersRouter);
adminRouter.use('/promotions', promotionsRouter);
adminRouter.use('/branches', branchesRouter);
adminRouter.use('/tiers', tiersRouter);
adminRouter.use('/settings', settingsRouter);
adminRouter.use('/admins', adminsRouter);
adminRouter.use('/upload', uploadRouter);
