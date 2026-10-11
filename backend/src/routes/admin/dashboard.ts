import { Router } from 'express';
import { prisma } from '../../db.js';

export const dashboardRouter = Router();

const startOfDayVN = (d = new Date()) => {
  // 00:00 giờ Việt Nam (UTC+7)
  const vn = new Date(d.getTime() + 7 * 3600_000);
  vn.setUTCHours(0, 0, 0, 0);
  return new Date(vn.getTime() - 7 * 3600_000);
};

dashboardRouter.get('/', async (_req, res) => {
  const today = startOfDayVN();
  const tomorrow = new Date(today.getTime() + 86400_000);
  const monthStart = new Date(today);
  monthStart.setUTCDate(1);
  const days30 = new Date(today.getTime() - 29 * 86400_000);

  const [
    totalCustomers,
    newCustomersToday,
    bookingsToday,
    pendingBookings,
    revenueToday,
    revenueMonth,
    tiers,
    recentOrders,
    upcomingBookings,
    orders30,
    vouchersUsedMonth,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.customer.count({ where: { createdAt: { gte: today } } }),
    prisma.booking.count({ where: { bookingTime: { gte: today, lt: tomorrow }, status: { not: 'CANCELLED' } } }),
    prisma.booking.count({ where: { status: 'PENDING' } }),
    prisma.order.aggregate({ where: { status: 'COMPLETED', createdAt: { gte: today } }, _sum: { total: true }, _count: true }),
    prisma.order.aggregate({ where: { status: 'COMPLETED', createdAt: { gte: monthStart } }, _sum: { total: true }, _count: true }),
    prisma.tier.findMany({ orderBy: { minPoints: 'asc' }, include: { _count: { select: { customers: true } } } }),
    prisma.order.findMany({
      where: { status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { customer: { select: { id: true, name: true, phone: true } } },
    }),
    prisma.booking.findMany({
      where: { bookingTime: { gte: new Date() }, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { bookingTime: 'asc' },
      take: 8,
      include: { branch: { select: { name: true } } },
    }),
    prisma.order.findMany({
      where: { status: 'COMPLETED', createdAt: { gte: days30 } },
      select: { total: true, createdAt: true },
    }),
    prisma.customerVoucher.count({ where: { status: 'USED', usedAt: { gte: monthStart } } }),
  ]);

  // Doanh thu 30 ngày theo ngày (giờ VN)
  const daily = new Map<string, { date: string; revenue: number; orders: number }>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(days30.getTime() + i * 86400_000 + 7 * 3600_000).toISOString().slice(0, 10);
    daily.set(d, { date: d, revenue: 0, orders: 0 });
  }
  for (const o of orders30) {
    const d = new Date(o.createdAt.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
    const row = daily.get(d);
    if (row) {
      row.revenue += o.total;
      row.orders += 1;
    }
  }

  res.json({
    totalCustomers,
    newCustomersToday,
    bookingsToday,
    pendingBookings,
    revenueToday: revenueToday._sum.total ?? 0,
    ordersToday: revenueToday._count,
    revenueMonth: revenueMonth._sum.total ?? 0,
    ordersMonth: revenueMonth._count,
    vouchersUsedMonth,
    tierDistribution: tiers.map((t) => ({ id: t.id, name: t.name, color: t.color, count: t._count.customers })),
    revenueByDay: [...daily.values()],
    recentOrders,
    upcomingBookings,
  });
});
