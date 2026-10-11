/**
 * Kiểm thử luồng chính: đăng nhập Zalo (mock) → đặt bàn → nhân viên xác nhận → tạo hoá đơn
 * → cộng điểm, thăng hạng → đổi điểm lấy voucher → dùng voucher → huỷ hoá đơn hoàn điểm.
 * Chạy bằng `npm test` (dùng DB riêng test.db).
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

process.env.DATABASE_URL = 'file:./test.db';
process.env.ZALO_MOCK = 'true';
// DB test riêng, xoá file cũ rồi tạo lại schema
rmSync('prisma/test.db', { force: true });
rmSync('prisma/test.db-journal', { force: true });
execSync('npx prisma db push --skip-generate', { stdio: 'ignore', env: process.env });
execSync('npx tsx prisma/seed.ts', { stdio: 'ignore', env: process.env });

const { createApp } = await import('../src/app.js');
const { prisma } = await import('../src/db.js');
const app = createApp();

let adminToken = '';
let customerToken = '';
let customerId = 0;
let branchId = 0;

const admin = () => ({ Authorization: `Bearer ${adminToken}` });
const cust = () => ({ Authorization: `Bearer ${customerToken}` });

/** Thời điểm trong tương lai rơi vào giờ mở cửa (12:00 giờ VN, 2 ngày sau) */
function lunchInTwoDays() {
  const d = new Date(Date.now() + 2 * 86400_000);
  const ymd = new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
  return `${ymd}T12:00:00+07:00`;
}

before(async () => {
  const login = await request(app).post('/api/admin/auth/login').send({ username: 'admin', password: 'admin123' });
  assert.equal(login.status, 200);
  adminToken = login.body.token;
  branchId = (await request(app).get('/api/app/branches')).body[0].id;
});

after(async () => {
  await prisma.$disconnect();
});

test('khách đăng nhập lần đầu nhận điểm chào mừng và hạng mặc định', async () => {
  const res = await request(app).post('/api/app/auth/login').send({ mockZaloId: 'zalo-test-1', name: 'Nguyễn Văn A' });
  assert.equal(res.status, 200);
  assert.equal(res.body.isNew, true);
  assert.equal(res.body.customer.points, 50);
  assert.equal(res.body.customer.tier.code, 'MEMBER');
  assert.equal(res.body.customer.nextTier.code, 'SILVER');
  assert.match(res.body.customer.memberCode, /^\d{10}$/);
  customerToken = res.body.token;
  customerId = res.body.customer.id;

  const again = await request(app).post('/api/app/auth/login').send({ mockZaloId: 'zalo-test-1' });
  assert.equal(again.body.isNew, false);
  assert.equal(again.body.customer.points, 50, 'không được tặng điểm chào mừng lần 2');
});

test('API khách yêu cầu token', async () => {
  assert.equal((await request(app).get('/api/app/me')).status, 401);
  assert.equal((await request(app).get('/api/app/me').set('Authorization', `Bearer ${adminToken}`)).status, 401);
});

test('liên kết số điện thoại', async () => {
  const res = await request(app).post('/api/app/me/phone').set(cust()).send({ phone: '+84 901 234 567' });
  assert.equal(res.status, 200);
  assert.equal(res.body.phone, '0901234567');
});

test('đặt bàn, kiểm tra giờ mở cửa và nhân viên xác nhận', async () => {
  const bad = await request(app)
    .post('/api/app/bookings')
    .set(cust())
    .send({ branchId, bookingTime: lunchInTwoDays().replace('12:00', '03:00'), partySize: 4, contactName: 'A', contactPhone: '0901234567' });
  assert.equal(bad.status, 400);

  const res = await request(app)
    .post('/api/app/bookings')
    .set(cust())
    .send({ branchId, bookingTime: lunchInTwoDays(), partySize: 4, contactName: 'A', contactPhone: '0901234567', note: 'Gần cửa sổ' });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'PENDING');

  const upcoming = await request(app).get('/api/app/bookings?scope=upcoming').set(cust());
  assert.equal(upcoming.body.length, 1);

  const invalid = await request(app).patch(`/api/admin/bookings/${res.body.id}`).set(admin()).send({ status: 'COMPLETED' });
  assert.equal(invalid.status, 400, 'không cho nhảy trạng thái sai luồng');

  const ok = await request(app).patch(`/api/admin/bookings/${res.body.id}`).set(admin()).send({ status: 'CONFIRMED' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'CONFIRMED');
});

test('nhận voucher miễn phí, không nhận quá giới hạn', async () => {
  const list = await request(app).get('/api/app/vouchers?type=free').set(cust());
  const free = list.body[0];
  assert.equal(free.canClaim, true);
  const claim = await request(app).post(`/api/app/vouchers/${free.id}/claim`).set(cust());
  assert.equal(claim.status, 201);
  assert.equal(claim.body.status, 'AVAILABLE');
  const twice = await request(app).post(`/api/app/vouchers/${free.id}/claim`).set(cust());
  assert.equal(twice.status, 400);
});

test('tạo hoá đơn: dùng voucher, cộng điểm và thăng hạng', async () => {
  const lookup = await request(app).get('/api/admin/customers/lookup?q=0901234567').set(admin());
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.id, customerId);
  const cv = lookup.body.vouchers[0]; // giảm 50.000đ cho hoá đơn từ 300.000đ
  const booking = lookup.body.bookings[0];

  const res = await request(app)
    .post('/api/admin/orders')
    .set(admin())
    .send({
      customerId,
      branchId,
      bookingId: booking.id,
      items: [
        { name: 'Lẩu thái', quantity: 1, price: 4_500_000 },
        { name: 'Nước ngọt', quantity: 4, price: 25_000 },
      ],
      voucherCode: cv.code,
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { order, tierUp } = res.body;
  assert.equal(order.subtotal, 4_600_000);
  assert.equal(order.voucherDiscount, 50_000);
  assert.equal(order.total, 4_550_000);
  assert.equal(order.pointsEarned, 455); // hạng Thành viên x1
  assert.equal(tierUp, true); // 50 + 455 = 505 ≥ 500 → Bạc

  const me = await request(app).get('/api/app/me').set(cust());
  assert.equal(me.body.points, 505);
  assert.equal(me.body.tier.code, 'SILVER');
  assert.equal(me.body.visitCount, 1);

  const used = await request(app).get('/api/app/my-vouchers?status=USED').set(cust());
  assert.equal(used.body.length, 1);

  const b = await request(app).get(`/api/app/bookings/${booking.id}`).set(cust());
  assert.equal(b.body.status, 'COMPLETED');

  // Dùng lại voucher đã dùng → lỗi
  const reuse = await request(app)
    .post('/api/admin/orders')
    .set(admin())
    .send({ customerId, subtotal: 500_000, voucherCode: cv.code });
  assert.equal(reuse.status, 400);
});

test('hạng Bạc nhân 1.2 điểm', async () => {
  const res = await request(app).post('/api/admin/orders').set(admin()).send({ customerId, subtotal: 1_000_000 });
  assert.equal(res.status, 201);
  assert.equal(res.body.order.pointsEarned, 120);
});

test('đổi điểm lấy voucher và kiểm tra điều kiện hạng', async () => {
  const list = (await request(app).get('/api/app/vouchers?type=points').set(cust())).body as any[];
  const gold = list.find((v) => v.minTier?.code === 'GOLD');
  assert.equal(gold.canClaim, false);
  assert.match(gold.reason, /Vàng/);
  assert.equal((await request(app).post(`/api/app/vouchers/${gold.id}/claim`).set(cust())).status, 400);

  const pct = list.find((v) => v.discountType === 'PERCENT'); // 300 điểm
  const before = (await request(app).get('/api/app/me').set(cust())).body;
  const r = await request(app).post(`/api/app/vouchers/${pct.id}/claim`).set(cust());
  assert.equal(r.status, 201);
  assert.equal(r.body.pointsSpent, 300);
  const after = (await request(app).get('/api/app/me').set(cust())).body;
  assert.equal(after.points, before.points - 300);
  assert.equal(after.lifetimePoints, before.lifetimePoints, 'đổi quà không làm giảm điểm xét hạng');
  assert.equal(after.tier.code, 'SILVER');

  const hist = await request(app).get('/api/app/me/points').set(cust());
  assert.equal(hist.body.items[0].type, 'REDEEM');
  assert.equal(hist.body.items[0].points, -300);

  const check = await request(app).get(`/api/admin/vouchers/check?code=${r.body.code}&amount=3000000`).set(admin());
  assert.equal(check.body.valid, true);
  assert.equal(check.body.discount, 200_000); // 10% tối đa 200.000đ
});

test('huỷ hoá đơn hoàn lại điểm và voucher', async () => {
  const orders = (await request(app).get('/api/app/orders').set(cust())).body.items;
  const first = orders.find((o: any) => o.voucherDiscount > 0);
  const before = (await request(app).get('/api/app/me').set(cust())).body;
  const res = await request(app).post(`/api/admin/orders/${first.id}/cancel`).set(admin());
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'CANCELLED');
  const after = (await request(app).get('/api/app/me').set(cust())).body;
  assert.equal(after.points, before.points - first.pointsEarned);
  assert.equal(after.lifetimePoints, before.lifetimePoints - first.pointsEarned);
  assert.equal(after.tier.code, 'MEMBER', 'tụt hạng khi điểm xét hạng giảm dưới ngưỡng');
  const available = (await request(app).get('/api/app/my-vouchers?status=AVAILABLE').set(cust())).body;
  assert.ok(available.some((v: any) => v.voucherId === first.usedVoucher?.voucherId || v.source === 'CLAIM'));
  assert.equal((await request(app).post(`/api/admin/orders/${first.id}/cancel`).set(admin())).status, 400);
});

test('nhân viên (STAFF) không được cộng điểm thủ công', async () => {
  await request(app).post('/api/admin/admins').set(admin()).send({ username: 'staff1', name: 'NV', password: 'staff123' });
  const t = (await request(app).post('/api/admin/auth/login').send({ username: 'staff1', password: 'staff123' })).body.token;
  const res = await request(app)
    .post(`/api/admin/customers/${customerId}/points`)
    .set('Authorization', `Bearer ${t}`)
    .send({ points: 100, description: 'test' });
  assert.equal(res.status, 403);
  const ok = await request(app).post(`/api/admin/customers/${customerId}/points`).set(admin()).send({ points: 100, description: 'Bù điểm' });
  assert.equal(ok.status, 200);
});

test('dashboard trả về số liệu', async () => {
  const res = await request(app).get('/api/admin/dashboard').set(admin());
  assert.equal(res.status, 200);
  assert.equal(res.body.totalCustomers, 1);
  assert.equal(res.body.revenueByDay.length, 30);
  assert.equal(res.body.ordersToday, 1, 'hoá đơn đã huỷ không tính doanh thu');
});
