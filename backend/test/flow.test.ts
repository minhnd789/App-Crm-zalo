/**
 * Kiểm thử luồng chính đa thương hiệu (phương án C: hạng chung theo tổng chi tiêu, điểm & voucher riêng):
 * đăng nhập Zalo (mock) ở Mini App thương hiệu A → đặt bàn → tạo hoá đơn → cộng điểm, thăng hạng
 * → dùng Mini App thương hiệu B, liên kết cùng SĐT → gộp khách → điểm riêng, hạng chung
 * → đổi điểm, huỷ hoá đơn hoàn điểm, phân quyền tài khoản theo thương hiệu.
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
let tokenA = ''; // token Mini App thương hiệu A
let tokenB = ''; // token Mini App thương hiệu B
let customerId = 0;
let brandA = 0;
let brandB = 0;
let branchA = 0;
let branchB = 0;
let orderWithVoucher = 0;

const admin = (brandId: number) => ({ Authorization: `Bearer ${adminToken}`, 'X-Brand-Id': String(brandId) });
const appA = () => ({ Authorization: `Bearer ${tokenA}`, 'X-Brand': 'BRAND_A' });
const appB = () => ({ Authorization: `Bearer ${tokenB}`, 'X-Brand': 'BRAND_B' });

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
  const me = await request(app).get('/api/admin/auth/me').set({ Authorization: `Bearer ${adminToken}` });
  assert.equal(me.body.brands.length, 2);
  assert.equal(me.body.brands[0].zaloAppSecretKey, undefined, 'không lộ secret');
  brandA = me.body.brands.find((b: any) => b.code === 'BRAND_A').id;
  brandB = me.body.brands.find((b: any) => b.code === 'BRAND_B').id;
  branchA = (await request(app).get('/api/app/branches').set('X-Brand', 'BRAND_A')).body[0].id;
  branchB = (await request(app).get('/api/app/branches').set('X-Brand', 'BRAND_B')).body[0].id;
});

after(async () => {
  await prisma.$disconnect();
});

test('Mini App bắt buộc header X-Brand hợp lệ', async () => {
  assert.equal((await request(app).get('/api/app/config')).status, 400);
  assert.equal((await request(app).get('/api/app/config').set('X-Brand', 'KHONG_CO')).status, 400);
  const cfg = await request(app).get('/api/app/config').set('X-Brand', 'BRAND_B');
  assert.equal(cfg.body.brand.name, 'Lẩu Nướng Vui');
});

test('đăng nhập lần đầu ở thương hiệu A: điểm chào mừng vào ví A, hạng mặc định', async () => {
  const res = await request(app)
    .post('/api/app/auth/login')
    .set('X-Brand', 'BRAND_A')
    .send({ mockZaloId: 'zalo-a-1', name: 'Nguyễn Văn A' });
  assert.equal(res.status, 200);
  assert.equal(res.body.isNew, true);
  assert.equal(res.body.customer.points, 50);
  assert.equal(res.body.customer.tier.code, 'MEMBER');
  assert.equal(res.body.customer.nextTier.code, 'SILVER');
  assert.equal(res.body.customer.amountToNextTier, 5_000_000);
  assert.match(res.body.customer.memberCode, /^\d{10}$/);
  tokenA = res.body.token;
  customerId = res.body.customer.id;

  const again = await request(app).post('/api/app/auth/login').set('X-Brand', 'BRAND_A').send({ mockZaloId: 'zalo-a-1' });
  assert.equal(again.body.isNew, false);
  assert.equal(again.body.customer.points, 50, 'không được tặng điểm chào mừng lần 2');
});

test('token của thương hiệu A không dùng được ở Mini App thương hiệu B', async () => {
  assert.equal((await request(app).get('/api/app/me').set('X-Brand', 'BRAND_A')).status, 401);
  const cross = await request(app).get('/api/app/me').set({ Authorization: `Bearer ${tokenA}`, 'X-Brand': 'BRAND_B' });
  assert.equal(cross.status, 401);
});

test('liên kết số điện thoại', async () => {
  const res = await request(app).post('/api/app/me/phone').set(appA()).send({ phone: '+84 901 234 567' });
  assert.equal(res.status, 200);
  assert.equal(res.body.phone, '0901234567');
  assert.equal(res.body.merged, false);
});

test('đặt bàn chỉ ở chi nhánh của thương hiệu, nhân viên xác nhận', async () => {
  const wrongBrand = await request(app)
    .post('/api/app/bookings')
    .set(appA())
    .send({ branchId: branchB, bookingTime: lunchInTwoDays(), partySize: 2, contactName: 'A', contactPhone: '0901234567' });
  assert.equal(wrongBrand.status, 400);

  const bad = await request(app)
    .post('/api/app/bookings')
    .set(appA())
    .send({ branchId: branchA, bookingTime: lunchInTwoDays().replace('12:00', '03:00'), partySize: 4, contactName: 'A', contactPhone: '0901234567' });
  assert.equal(bad.status, 400);

  const res = await request(app)
    .post('/api/app/bookings')
    .set(appA())
    .send({ branchId: branchA, bookingTime: lunchInTwoDays(), partySize: 4, contactName: 'A', contactPhone: '0901234567' });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'PENDING');

  // Thương hiệu B không thấy lịch của A
  const listB = await request(app).get('/api/admin/bookings').set(admin(brandB));
  assert.equal(listB.body.total, 0);
  assert.equal((await request(app).patch(`/api/admin/bookings/${res.body.id}`).set(admin(brandB)).send({ status: 'CONFIRMED' })).status, 404);

  const invalid = await request(app).patch(`/api/admin/bookings/${res.body.id}`).set(admin(brandA)).send({ status: 'COMPLETED' });
  assert.equal(invalid.status, 400, 'không cho nhảy trạng thái sai luồng');
  const ok = await request(app).patch(`/api/admin/bookings/${res.body.id}`).set(admin(brandA)).send({ status: 'CONFIRMED' });
  assert.equal(ok.body.status, 'CONFIRMED');
});

test('nhận voucher miễn phí, không nhận quá giới hạn', async () => {
  const list = await request(app).get('/api/app/vouchers?type=free').set(appA());
  const free = list.body[0];
  assert.equal(free.canClaim, true);
  assert.equal(free.brandId, brandA);
  assert.equal((await request(app).post(`/api/app/vouchers/${free.id}/claim`).set(appA())).status, 201);
  assert.equal((await request(app).post(`/api/app/vouchers/${free.id}/claim`).set(appA())).status, 400);
});

test('hoá đơn ở thương hiệu A: dùng voucher, cộng điểm ví A, cộng chi tiêu chung', async () => {
  const lookup = await request(app).get('/api/admin/customers/lookup?q=0901234567').set(admin(brandA));
  assert.equal(lookup.body.id, customerId);
  assert.equal(lookup.body.wallet.points, 50);
  const cv = lookup.body.vouchers[0]; // giảm 50.000đ cho hoá đơn từ 300.000đ
  const booking = lookup.body.bookings[0];

  const res = await request(app)
    .post('/api/admin/orders')
    .set(admin(brandA))
    .send({
      customerId,
      branchId: branchA,
      bookingId: booking.id,
      items: [
        { name: 'Lẩu thái', quantity: 1, price: 4_500_000 },
        { name: 'Nước ngọt', quantity: 4, price: 25_000 },
      ],
      voucherCode: cv.code,
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { order, tierUp } = res.body;
  orderWithVoucher = order.id;
  assert.equal(order.total, 4_550_000);
  assert.equal(order.pointsEarned, 455);
  assert.equal(tierUp, false); // 4,55tr < 5tr

  const second = await request(app).post('/api/admin/orders').set(admin(brandA)).send({ customerId, branchId: branchA, subtotal: 1_000_000 });
  assert.equal(second.body.order.pointsEarned, 100, 'tính theo hạng tại thời điểm thanh toán (x1)');
  assert.equal(second.body.tierUp, true);
  assert.equal(second.body.tier.code, 'SILVER'); // 5,55tr ≥ 5tr

  const me = (await request(app).get('/api/app/me').set(appA())).body;
  assert.equal(me.points, 605);
  assert.equal(me.totalSpent, 5_550_000);
  assert.equal(me.tier.code, 'SILVER');

  // Chi nhánh / voucher của thương hiệu khác bị từ chối
  const wrong = await request(app).post('/api/admin/orders').set(admin(brandA)).send({ customerId, branchId: branchB, subtotal: 100_000 });
  assert.equal(wrong.status, 400);
});

test('dùng Mini App thương hiệu B rồi liên kết cùng SĐT → gộp thành 1 khách', async () => {
  const login = await request(app)
    .post('/api/app/auth/login')
    .set('X-Brand', 'BRAND_B')
    .send({ mockZaloId: 'zalo-b-1', name: 'Văn A' });
  assert.equal(login.body.isNew, true);
  assert.notEqual(login.body.customer.id, customerId);
  assert.equal(login.body.customer.points, 50, 'điểm chào mừng của thương hiệu B');
  const oldTokenB = login.body.token;
  tokenB = oldTokenB;

  const link = await request(app).post('/api/app/me/phone').set(appB()).send({ phone: '0901234567' });
  assert.equal(link.status, 200, JSON.stringify(link.body));
  assert.equal(link.body.merged, true);
  assert.equal(link.body.id, customerId);
  assert.ok(link.body.token);
  tokenB = link.body.token;

  // Token cũ trỏ tới khách đã bị gộp → hết hiệu lực
  assert.equal((await request(app).get('/api/app/me').set({ Authorization: `Bearer ${oldTokenB}`, 'X-Brand': 'BRAND_B' })).status, 401);

  const meB = (await request(app).get('/api/app/me').set(appB())).body;
  assert.equal(meB.points, 50, 'điểm ví B riêng');
  assert.equal(meB.tier.code, 'SILVER', 'hạng chung theo chi tiêu ở A');
  assert.equal(meB.otherWallets[0].points, 605);

  // Đăng nhập lại Mini App B vẫn vào đúng khách đã gộp
  const relogin = await request(app).post('/api/app/auth/login').set('X-Brand', 'BRAND_B').send({ mockZaloId: 'zalo-b-1' });
  assert.equal(relogin.body.customer.id, customerId);
  assert.equal((await prisma.customer.count()), 1);
});

test('hoá đơn ở thương hiệu B: điểm vào ví B theo hệ số hạng chung, voucher A không dùng được', async () => {
  const freeA = (await request(app).get('/api/app/my-vouchers').set(appA())).body;
  assert.ok(freeA.length > 0);
  const res = await request(app).post('/api/admin/orders').set(admin(brandB)).send({ customerId, branchId: branchB, subtotal: 1_000_000 });
  assert.equal(res.status, 201);
  assert.equal(res.body.order.pointsEarned, 120, 'hạng Bạc x1.2');

  const claimA = (await request(app).get('/api/app/vouchers?type=free').set(appA())).body;
  assert.ok(claimA.every((v: any) => v.brandId === brandA));

  const meA = (await request(app).get('/api/app/me').set(appA())).body;
  const meB = (await request(app).get('/api/app/me').set(appB())).body;
  assert.equal(meA.points, 605, 'ví A không đổi');
  assert.equal(meB.points, 170);
  assert.equal(meB.totalSpent, 6_550_000);

  const ordersB = (await request(app).get('/api/app/orders').set(appB())).body;
  assert.equal(ordersB.total, 1, 'Mini App B chỉ thấy hoá đơn của B');
});

test('voucher của thương hiệu A không áp được cho hoá đơn thương hiệu B', async () => {
  const claim = await request(app).post(`/api/app/vouchers/${(await request(app).get('/api/app/vouchers?type=points').set(appA())).body.find((v: any) => v.discountType === 'GIFT').id}/claim`).set(appA());
  assert.equal(claim.status, 201);
  const res = await request(app)
    .post('/api/admin/orders')
    .set(admin(brandB))
    .send({ customerId, subtotal: 500_000, voucherCode: claim.body.code });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /thương hiệu/);
});

test('đổi điểm ví A, điều kiện hạng chung', async () => {
  const list = (await request(app).get('/api/app/vouchers?type=points').set(appA())).body as any[];
  const gold = list.find((v) => v.minTier?.code === 'GOLD');
  assert.equal(gold.canClaim, false);
  assert.match(gold.reason, /Vàng/);

  const pct = list.find((v) => v.discountType === 'PERCENT'); // 300 điểm
  const before = (await request(app).get('/api/app/me').set(appA())).body;
  const r = await request(app).post(`/api/app/vouchers/${pct.id}/claim`).set(appA());
  assert.equal(r.status, 201);
  const after = (await request(app).get('/api/app/me').set(appA())).body;
  assert.equal(after.points, before.points - 300);
  assert.equal((await request(app).get('/api/app/me').set(appB())).body.points, 170, 'ví B không bị trừ');

  const check = await request(app).get(`/api/admin/vouchers/check?code=${r.body.code}&amount=3000000`).set(admin(brandA));
  assert.equal(check.body.valid, true);
  assert.equal(check.body.discount, 200_000);
  assert.equal((await request(app).get(`/api/admin/vouchers/check?code=${r.body.code}`).set(admin(brandB))).status, 404);
});

test('huỷ hoá đơn: hoàn điểm ví A, trả voucher, xét lại hạng chung', async () => {
  const before = (await request(app).get('/api/app/me').set(appA())).body;
  assert.equal((await request(app).post(`/api/admin/orders/${orderWithVoucher}/cancel`).set(admin(brandB))).status, 404);
  const res = await request(app).post(`/api/admin/orders/${orderWithVoucher}/cancel`).set(admin(brandA));
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'CANCELLED');
  const after = (await request(app).get('/api/app/me').set(appA())).body;
  assert.equal(after.points, before.points - 455);
  assert.equal(after.totalSpent, 2_000_000);
  assert.equal(after.tier.code, 'MEMBER', 'tụt hạng khi tổng chi tiêu giảm dưới ngưỡng');
  const available = (await request(app).get('/api/app/my-vouchers?status=AVAILABLE').set(appA())).body;
  assert.ok(available.some((v: any) => v.source === 'CLAIM'), 'voucher đã dùng được trả lại');
  assert.equal((await request(app).post(`/api/admin/orders/${orderWithVoucher}/cancel`).set(admin(brandA))).status, 400);
});

test('phân quyền: tài khoản thương hiệu B chỉ thao tác trong B; nhân viên không cộng điểm', async () => {
  const create = await request(app)
    .post('/api/admin/admins')
    .set({ Authorization: `Bearer ${adminToken}` })
    .send({ username: 'qlb', name: 'Quản lý B', password: 'qlb123', role: 'ADMIN', brandId: brandB });
  assert.equal(create.status, 201);
  const t = (await request(app).post('/api/admin/auth/login').send({ username: 'qlb', password: 'qlb123' })).body.token;
  const auth = { Authorization: `Bearer ${t}` };

  const me = await request(app).get('/api/admin/auth/me').set(auth);
  assert.deepEqual(me.body.brands.map((b: any) => b.id), [brandB]);
  assert.equal((await request(app).get('/api/admin/dashboard').set(auth)).status, 200, 'mặc định thương hiệu của mình');
  assert.equal((await request(app).get('/api/admin/dashboard').set({ ...auth, 'X-Brand-Id': String(brandA) })).status, 403);
  assert.equal((await request(app).post('/api/admin/tiers').set(auth).send({ name: 'X', code: 'X', minSpent: 1 })).status, 403);
  assert.equal((await request(app).get('/api/admin/brands').set(auth)).status, 403);
  // Quản lý B không tạo được tài khoản cho thương hiệu A
  const cross = await request(app).post('/api/admin/admins').set(auth).send({ username: 'nv_a', name: 'NV', password: 'nva123', brandId: brandA });
  assert.equal(cross.status, 400);
  const staff = await request(app).post('/api/admin/admins').set(auth).send({ username: 'nvb', name: 'NV B', password: 'nvb123' });
  assert.equal(staff.body.brandId, brandB, 'tự gắn thương hiệu của người tạo');

  const st = (await request(app).post('/api/admin/auth/login').send({ username: 'nvb', password: 'nvb123' })).body.token;
  const denied = await request(app).post(`/api/admin/customers/${customerId}/points`).set({ Authorization: `Bearer ${st}` }).send({ points: 10, description: 'x' });
  assert.equal(denied.status, 403);
});

test('quản lý cộng điểm vào ví đang âm sau khi huỷ hoá đơn', async () => {
  const meA = (await request(app).get('/api/app/me').set(appA())).body;
  assert.ok(meA.points < 0, 'ví A âm vì đã đổi điểm trước khi huỷ hoá đơn');
  const ok = await request(app).post(`/api/admin/customers/${customerId}/points`).set(admin(brandA)).send({ points: 100, description: 'Bù điểm' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.wallet.points, meA.points + 100);
});

test('dashboard theo thương hiệu', async () => {
  const a = (await request(app).get('/api/admin/dashboard').set(admin(brandA))).body;
  const b = (await request(app).get('/api/admin/dashboard').set(admin(brandB))).body;
  assert.equal(a.totalCustomers, 1);
  assert.equal(a.ordersToday, 1, 'hoá đơn đã huỷ không tính');
  assert.equal(b.ordersToday, 1);
  assert.equal(b.revenueToday, 1_000_000);
  assert.equal(a.revenueByDay.length, 30);
});
