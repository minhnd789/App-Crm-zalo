import { Router } from 'express';
import { prisma } from '../../db.js';
import { brandWhere } from '../../lib/auth.js';

/** Số liệu tổng quan: 1 thương hiệu (X-Brand-Id) hoặc toàn hệ thống; lọc thêm theo cơ sở `?branchId=` */
export const dashboardRouter = Router();

const startOfDayVN = (d = new Date()) => {
  // 00:00 giờ Việt Nam (UTC+7)
  const vn = new Date(d.getTime() + 7 * 3600_000);
  vn.setUTCHours(0, 0, 0, 0);
  return new Date(vn.getTime() - 7 * 3600_000);
};

dashboardRouter.get('/', async (req, res) => {
  const bw = brandWhere(req);
  const branchId = req.query.branchId ? Number(req.query.branchId) : undefined;
  // Lọc theo cơ sở: hoá đơn/đặt bàn tại cơ sở; khách theo cơ sở đã chọn khi đăng ký
  const bb = { ...bw, ...(branchId ? { branchId } : {}) };
  // Chỉ đếm khách đã hoàn tất đăng ký thành viên (bỏ qua người mới mở Mini App)
  const wb = { ...bw, registeredAt: { not: null }, ...(branchId ? { homeBranchId: branchId } : {}) };
  const today = startOfDayVN();
  const tomorrow = new Date(today.getTime() + 86400_000);
  // 00:00 ngày 1 của tháng hiện tại theo giờ VN
  const vnNow = new Date(Date.now() + 7 * 3600_000);
  const monthStart = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), 1) - 7 * 3600_000);
  const days30 = new Date(today.getTime() - 29 * 86400_000);
  const members = { wallets: { some: wb } };

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
    prisma.customer.count({ where: members }),
    prisma.customer.count({ where: { wallets: { some: { ...wb, registeredAt: { gte: today } } } } }),
    prisma.booking.count({ where: { ...bb, bookingTime: { gte: today, lt: tomorrow }, status: { not: 'CANCELLED' } } }),
    prisma.booking.count({ where: { ...bb, status: 'PENDING' } }),
    prisma.order.aggregate({ where: { ...bb, status: 'COMPLETED', createdAt: { gte: today } }, _sum: { total: true }, _count: true }),
    prisma.order.aggregate({ where: { ...bb, status: 'COMPLETED', createdAt: { gte: monthStart } }, _sum: { total: true }, _count: true }),
    prisma.tier.findMany({
      orderBy: { minSpent: 'asc' },
      include: { _count: { select: { customers: { where: members } } } },
    }),
    prisma.order.findMany({
      where: { ...bb, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        brand: { select: { id: true, name: true, primaryColor: true } },
        branch: { select: { id: true, name: true } },
      },
    }),
    prisma.booking.findMany({
      where: { ...bb, bookingTime: { gte: new Date() }, status: { in: ['PENDING', 'CONFIRMED'] } },
      orderBy: { bookingTime: 'asc' },
      take: 8,
      include: { branch: { select: { name: true } }, brand: { select: { id: true, name: true, primaryColor: true } } },
    }),
    prisma.order.findMany({
      where: { ...bb, status: 'COMPLETED', createdAt: { gte: days30 } },
      select: { total: true, createdAt: true },
    }),
    prisma.customerVoucher.count({
      where: { ...bw, status: 'USED', usedAt: { gte: monthStart }, ...(branchId ? { order: { branchId } } : {}) },
    }),
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

  // Doanh thu tháng theo thương hiệu (khi xem toàn hệ thống) và theo cơ sở
  const monthWhere = { ...bb, status: 'COMPLETED', createdAt: { gte: monthStart } };
  const [byBrandRaw, byBranchRaw, brands, branches] = await Promise.all([
    prisma.order.groupBy({ by: ['brandId'], where: monthWhere, _sum: { total: true }, _count: true }),
    prisma.order.groupBy({ by: ['branchId'], where: monthWhere, _sum: { total: true }, _count: true }),
    prisma.brand.findMany({ where: req.brand ? { id: req.brand.id } : {}, select: { id: true, name: true, primaryColor: true } }),
    prisma.branch.findMany({ where: bw, select: { id: true, name: true, brandId: true } }),
  ]);
  const revenueByBrand = brands.map((b) => {
    const r = byBrandRaw.find((x) => x.brandId === b.id);
    return { ...b, revenue: r?._sum.total ?? 0, orders: r?._count ?? 0 };
  });
  const revenueByBranch = branches
    .map((b) => {
      const r = byBranchRaw.find((x) => x.branchId === b.id);
      return { ...b, brandName: brands.find((x) => x.id === b.brandId)?.name ?? '', revenue: r?._sum.total ?? 0, orders: r?._count ?? 0 };
    })
    .sort((a, b) => b.revenue - a.revenue);

  res.json({
    revenueByBrand,
    revenueByBranch,
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
