/**
 * Tạo vài hoá đơn mẫu (giả lập đồng bộ từ phần mềm bán hàng r_keeper) cho các khách đã đăng ký,
 * để thử điểm / hạng khi chưa có kết nối POS. Chỉ dùng cho môi trường dev:  npm run db:demo-orders
 */
import 'dotenv/config';
import { prisma } from '../src/db.js';
import { createOrder } from '../src/services/orders.js';

async function main() {
  const wallets = await prisma.customerWallet.findMany({
    where: { registeredAt: { not: null }, homeBranchId: { not: null } },
    include: { brand: true },
  });
  if (wallets.length === 0) {
    console.log('Chưa có khách nào đăng ký thành viên trên Mini App.');
    return;
  }
  let n = 0;
  for (const w of wallets) {
    const subtotal = (Math.floor(Math.random() * 20) + 3) * 50_000;
    const { order } = await createOrder(
      w.brand,
      {
        customerId: w.customerId,
        branchId: w.homeBranchId,
        items: [{ name: 'Món mẫu', quantity: 1, price: subtotal }],
        source: 'POS',
        externalId: `DEMO-${Date.now()}-${n}`,
      },
      null,
    );
    console.log(`${w.brand.name}: hoá đơn ${order.code} ${order.total.toLocaleString('vi-VN')}đ → +${order.pointsEarned} điểm cho ${order.customer.name}`);
    n++;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
