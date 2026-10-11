/* Dữ liệu mẫu ban đầu: 2 thương hiệu, tài khoản quản trị, chi nhánh, hạng dùng chung, ưu đãi, voucher */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DAY = 86400_000;

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  // Quản trị toàn hệ thống (không gắn thương hiệu)
  await prisma.admin.upsert({
    where: { username },
    update: {},
    create: { username, name: 'Quản trị hệ thống', role: 'ADMIN', passwordHash: await bcrypt.hash(password, 10) },
  });

  // Hạng dùng chung – xét theo tổng chi tiêu ở mọi thương hiệu
  if ((await prisma.tier.count()) === 0) {
    await prisma.tier.createMany({
      data: [
        { code: 'MEMBER', name: 'Thành viên', minSpent: 0, pointMultiplier: 1, color: '#16A34A', benefits: 'Tích điểm tại mọi thương hiệu\nNhận ưu đãi sinh nhật' },
        { code: 'SILVER', name: 'Bạc', minSpent: 5_000_000, pointMultiplier: 1.2, color: '#9CA3AF', benefits: 'Nhân 1.2 điểm mỗi hoá đơn\nƯu tiên giữ bàn giờ cao điểm' },
        { code: 'GOLD', name: 'Vàng', minSpent: 20_000_000, pointMultiplier: 1.5, color: '#F2B705', benefits: 'Nhân 1.5 điểm mỗi hoá đơn\nTặng món tráng miệng mỗi lần ghé\nƯu tiên giữ bàn' },
        { code: 'DIAMOND', name: 'Kim cương', minSpent: 50_000_000, pointMultiplier: 2, color: '#3A86FF', benefits: 'Nhân 2 điểm mỗi hoá đơn\nPhòng VIP miễn phí\nQuà tặng dịp đặc biệt' },
      ],
    });
  }
  const gold = await prisma.tier.findUnique({ where: { code: 'GOLD' } });

  const brands = [
    {
      code: 'BRAND_A',
      name: 'Nhà hàng Ngon',
      primaryColor: '#C2410C',
      hotline: '19001234',
      about: 'Ẩm thực Việt truyền thống.',
      branches: [
        { name: 'Ngon – Quận 1', address: '123 Nguyễn Huệ, Quận 1, TP.HCM', phone: '0281234567', openTime: '10:00', closeTime: '22:00' },
        { name: 'Ngon – Cầu Giấy', address: '45 Trần Thái Tông, Cầu Giấy, Hà Nội', phone: '0247654321', openTime: '10:00', closeTime: '22:30' },
      ],
    },
    {
      code: 'BRAND_B',
      name: 'Lẩu Nướng Vui',
      primaryColor: '#B91C1C',
      hotline: '19005678',
      about: 'Lẩu và nướng kiểu Hàn.',
      branches: [{ name: 'Lẩu Nướng Vui – Quận 3', address: '88 Võ Văn Tần, Quận 3, TP.HCM', phone: '0289876543', openTime: '11:00', closeTime: '23:00' }],
    },
  ];

  const now = Date.now();
  for (const b of brands) {
    const { branches, ...data } = b;
    const brand = await prisma.brand.upsert({ where: { code: b.code }, update: {}, create: data });

    if ((await prisma.branch.count({ where: { brandId: brand.id } })) === 0) {
      await prisma.branch.createMany({ data: branches.map((x) => ({ ...x, brandId: brand.id })) });
    }

    if ((await prisma.promotion.count({ where: { brandId: brand.id } })) === 0) {
      await prisma.promotion.createMany({
        data: [
          {
            brandId: brand.id,
            title: `${brand.name}: giảm 20% cho nhóm từ 6 người`,
            summary: 'Áp dụng tối thứ 2 – thứ 5',
            content: 'Nhóm từ 6 khách trở lên được giảm 20% tổng hoá đơn đồ ăn.\nÁp dụng từ thứ 2 đến thứ 5, sau 17h.\nKhông áp dụng cùng chương trình khác.',
            imageUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200',
            featured: true,
            startDate: new Date(now - DAY),
            endDate: new Date(now + 60 * DAY),
          },
          {
            brandId: brand.id,
            title: 'Sinh nhật vui – Tặng bánh kem',
            summary: 'Thành viên được tặng bánh kem trong tháng sinh nhật',
            content: 'Cập nhật ngày sinh trong Mini App để nhận bánh kem miễn phí khi dùng bữa trong tháng sinh nhật.',
            imageUrl: 'https://images.unsplash.com/photo-1558636508-e0db3814bd1d?w=1200',
            featured: true,
          },
        ],
      });
    }

    if ((await prisma.voucher.count({ where: { brandId: brand.id } })) === 0) {
      await prisma.voucher.createMany({
        data: [
          { brandId: brand.id, title: 'Giảm 50.000đ cho thành viên mới', description: 'Áp dụng hoá đơn từ 300.000đ', discountType: 'AMOUNT', discountValue: 50000, minOrder: 300000, pointCost: 0, validDays: 30 },
          { brandId: brand.id, title: 'Tặng 1 món tráng miệng', description: 'Đổi 100 điểm lấy 1 món tráng miệng bất kỳ', discountType: 'GIFT', pointCost: 100, validDays: 30, perCustomerLimit: 10 },
          { brandId: brand.id, title: 'Giảm 10% hoá đơn', description: 'Giảm tối đa 200.000đ', discountType: 'PERCENT', discountValue: 10, maxDiscount: 200000, pointCost: 300, validDays: 60, perCustomerLimit: 5 },
          { brandId: brand.id, title: 'Giảm 200.000đ – hạng Vàng', description: 'Dành riêng hạng Vàng trở lên, hoá đơn từ 1.000.000đ', discountType: 'AMOUNT', discountValue: 200000, minOrder: 1000000, pointCost: 500, minTierId: gold?.id, validDays: 60, perCustomerLimit: 3 },
        ],
      });
    }

    await prisma.setting.upsert({
      where: { brandId_key: { brandId: brand.id, key: 'welcomePoints' } },
      update: {},
      create: { brandId: brand.id, key: 'welcomePoints', value: '50' },
    });
  }

  console.log(`Seed xong. Đăng nhập quản trị toàn hệ thống: ${username} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
