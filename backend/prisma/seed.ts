/* Dữ liệu mẫu ban đầu: tài khoản admin, chi nhánh, hạng thành viên, ưu đãi, voucher */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DAY = 86400_000;

async function main() {
  const username = process.env.SEED_ADMIN_USERNAME || 'admin';
  const password = process.env.SEED_ADMIN_PASSWORD || 'admin123';
  await prisma.admin.upsert({
    where: { username },
    update: {},
    create: { username, name: 'Quản lý', role: 'ADMIN', passwordHash: await bcrypt.hash(password, 10) },
  });

  if ((await prisma.tier.count()) === 0) {
    await prisma.tier.createMany({
      data: [
        { code: 'MEMBER', name: 'Thành viên', minPoints: 0, pointMultiplier: 1, color: '#16A34A', benefits: 'Tích 1 điểm cho mỗi 10.000đ\nNhận ưu đãi sinh nhật' },
        { code: 'SILVER', name: 'Bạc', minPoints: 500, pointMultiplier: 1.2, color: '#9CA3AF', benefits: 'Nhân 1.2 điểm mỗi hoá đơn\nƯu tiên giữ bàn giờ cao điểm' },
        { code: 'GOLD', name: 'Vàng', minPoints: 2000, pointMultiplier: 1.5, color: '#F2B705', benefits: 'Nhân 1.5 điểm mỗi hoá đơn\nTặng món tráng miệng mỗi lần ghé\nƯu tiên giữ bàn' },
        { code: 'DIAMOND', name: 'Kim cương', minPoints: 5000, pointMultiplier: 2, color: '#3A86FF', benefits: 'Nhân 2 điểm mỗi hoá đơn\nPhòng VIP miễn phí\nQuà tặng dịp đặc biệt' },
      ],
    });
  }

  if ((await prisma.branch.count()) === 0) {
    await prisma.branch.createMany({
      data: [
        { name: 'Chi nhánh Quận 1', address: '123 Nguyễn Huệ, Quận 1, TP.HCM', phone: '0281234567', openTime: '10:00', closeTime: '22:00' },
        { name: 'Chi nhánh Cầu Giấy', address: '45 Trần Thái Tông, Cầu Giấy, Hà Nội', phone: '0247654321', openTime: '10:00', closeTime: '22:30' },
      ],
    });
  }

  const now = Date.now();
  if ((await prisma.promotion.count()) === 0) {
    await prisma.promotion.createMany({
      data: [
        {
          title: 'Giảm 20% cho nhóm từ 6 người',
          summary: 'Áp dụng tối thứ 2 – thứ 5',
          content: 'Nhóm từ 6 khách trở lên được giảm 20% tổng hoá đơn đồ ăn.\nÁp dụng từ thứ 2 đến thứ 5, sau 17h.\nKhông áp dụng cùng chương trình khác.',
          imageUrl: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200',
          featured: true,
          startDate: new Date(now - DAY),
          endDate: new Date(now + 60 * DAY),
        },
        {
          title: 'Sinh nhật vui – Tặng bánh kem',
          summary: 'Thành viên được tặng bánh kem trong tháng sinh nhật',
          content: 'Cập nhật ngày sinh trong Mini App để nhận bánh kem miễn phí khi dùng bữa trong tháng sinh nhật.',
          imageUrl: 'https://images.unsplash.com/photo-1558636508-e0db3814bd1d?w=1200',
          featured: true,
        },
      ],
    });
  }

  if ((await prisma.voucher.count()) === 0) {
    const gold = await prisma.tier.findUnique({ where: { code: 'GOLD' } });
    await prisma.voucher.createMany({
      data: [
        { title: 'Giảm 50.000đ cho thành viên mới', description: 'Áp dụng hoá đơn từ 300.000đ', discountType: 'AMOUNT', discountValue: 50000, minOrder: 300000, pointCost: 0, validDays: 30 },
        { title: 'Tặng 1 đĩa salad', description: 'Đổi 100 điểm lấy 1 đĩa salad bất kỳ', discountType: 'GIFT', pointCost: 100, validDays: 30, perCustomerLimit: 10 },
        { title: 'Giảm 10% hoá đơn', description: 'Giảm tối đa 200.000đ', discountType: 'PERCENT', discountValue: 10, maxDiscount: 200000, pointCost: 300, validDays: 60, perCustomerLimit: 5 },
        { title: 'Giảm 200.000đ – hạng Vàng', description: 'Dành riêng hạng Vàng trở lên, hoá đơn từ 1.000.000đ', discountType: 'AMOUNT', discountValue: 200000, minOrder: 1000000, pointCost: 500, minTierId: gold?.id, validDays: 60, perCustomerLimit: 3 },
      ],
    });
  }

  await prisma.setting.upsert({ where: { key: 'restaurantName' }, update: {}, create: { key: 'restaurantName', value: 'Nhà hàng Ngon' } });
  await prisma.setting.upsert({ where: { key: 'welcomePoints' }, update: {}, create: { key: 'welcomePoints', value: '50' } });

  console.log(`Seed xong. Đăng nhập quản trị: ${username} / ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
