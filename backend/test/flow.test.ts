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
const { createOrder } = await import('../src/services/orders.js');
const app = createApp();

/**
 * Hoá đơn chỉ đến từ phần mềm bán hàng (r_keeper/DCorp) – trang quản trị không tạo hoá đơn.
 * Test gọi thẳng service mà bộ đồng bộ POS sẽ dùng.
 */
async function posOrder(brandId: number, input: Record<string, unknown>) {
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId } });
  try {
    const r = await createOrder(brand, { items: [], ...input, source: 'POS' } as never, null);
    return { status: 201, body: JSON.parse(JSON.stringify(r)) };
  } catch (e: any) {
    return { status: e.status ?? 500, body: { error: e.message } };
  }
}

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
/** Quản trị trung tâm – không lọc thương hiệu (xem tất cả) */
const central = () => ({ Authorization: `Bearer ${adminToken}` });
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
  assert.equal(cfg.body.welcomePoints, 50);
});

test('đăng nhập lần đầu ở thương hiệu A: chưa là thành viên, hạng mặc định', async () => {
  const res = await request(app)
    .post('/api/app/auth/login')
    .set('X-Brand', 'BRAND_A')
    .send({ mockZaloId: 'zalo-a-1', name: 'Nguyễn Văn A' });
  assert.equal(res.status, 200);
  assert.equal(res.body.isNew, true);
  assert.equal(res.body.customer.registered, false);
  assert.equal(res.body.customer.points, 0, 'điểm chào mừng chỉ tặng khi hoàn tất đăng ký');
  assert.equal(res.body.customer.tier.code, 'MEMBER');
  assert.equal(res.body.customer.nextTier.code, 'SILVER');
  assert.equal(res.body.customer.amountToNextTier, 5_000_000);
  assert.match(res.body.customer.memberCode, /^\d{10}$/);
  tokenA = res.body.token;
  customerId = res.body.customer.id;

  const again = await request(app).post('/api/app/auth/login').set('X-Brand', 'BRAND_A').send({ mockZaloId: 'zalo-a-1' });
  assert.equal(again.body.isNew, false);
  assert.equal(again.body.customer.id, customerId);
});

test('token của thương hiệu A không dùng được ở Mini App thương hiệu B', async () => {
  assert.equal((await request(app).get('/api/app/me').set('X-Brand', 'BRAND_A')).status, 401);
  const cross = await request(app).get('/api/app/me').set({ Authorization: `Bearer ${tokenA}`, 'X-Brand': 'BRAND_B' });
  assert.equal(cross.status, 401);
});

test('chưa đăng ký thì chưa được đặt bàn / nhận voucher', async () => {
  const booking = await request(app)
    .post('/api/app/bookings')
    .set(appA())
    .send({ branchId: branchA, bookingTime: lunchInTwoDays(), partySize: 2, contactName: 'A', contactPhone: '0901234567' });
  assert.equal(booking.status, 403);
  const free = (await request(app).get('/api/app/vouchers?type=free').set(appA())).body[0];
  assert.equal((await request(app).post(`/api/app/vouchers/${free.id}/claim`).set(appA())).status, 403);
});

test('đăng ký thành viên: tên & SĐT theo Zalo, ngày sinh, cơ sở → tặng điểm chào mừng', async () => {
  const base = { name: 'Nguyễn Văn A', birthday: '1990-10-20', phone: '+84 901 234 567' };
  assert.equal((await request(app).post('/api/app/me/register').set(appA()).send({ ...base, branchId: branchB })).status, 400, 'cơ sở phải thuộc thương hiệu');
  assert.equal((await request(app).post('/api/app/me/register').set(appA()).send({ ...base, birthday: '2999-01-01', branchId: branchA })).status, 400);
  const res = await request(app).post('/api/app/me/register').set(appA()).send({ ...base, branchId: branchA });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.registered, true);
  assert.equal(res.body.phone, '0901234567');
  assert.equal(res.body.homeBranch.name, 'Quận 1');
  assert.equal(res.body.points, 50);
  assert.equal(res.body.merged, false);
  assert.equal(res.body.birthday.slice(0, 10), '1990-10-20');

  // Đăng ký lại (vd đổi cơ sở) không tặng thêm điểm
  const again = await request(app).post('/api/app/me/register').set(appA()).send({ ...base, branchId: branchA });
  assert.equal(again.body.points, 50);
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

  const res = await posOrder(brandA, {
      customerId,
      branchId: branchA,
      bookingId: booking.id,
      items: [
        { name: 'Lẩu thái', quantity: 1, price: 4_500_000 },
        { name: 'Nước ngọt', quantity: 4, price: 25_000 },
      ],
      voucherCode: cv.code,
      externalId: 'RK-0001',
    });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { order, tierUp } = res.body;
  orderWithVoucher = order.id;
  assert.equal(order.total, 4_550_000);
  assert.equal(order.pointsEarned, 455);
  assert.equal(tierUp, false); // 4,55tr < 5tr

  const second = await posOrder(brandA, { customerId, branchId: branchA, subtotal: 1_000_000 });
  assert.equal(second.body.order.pointsEarned, 100, 'tính theo hạng tại thời điểm thanh toán (x1)');
  assert.equal(second.body.tierUp, true);
  assert.equal(second.body.tier.code, 'SILVER'); // 5,55tr ≥ 5tr

  const me = (await request(app).get('/api/app/me').set(appA())).body;
  assert.equal(me.points, 605);
  assert.equal(me.totalSpent, 5_550_000);
  assert.equal(me.tier.code, 'SILVER');

  // Chi nhánh / voucher của thương hiệu khác bị từ chối
  const wrong = await posOrder(brandA, { customerId, branchId: branchB, subtotal: 100_000 });
  assert.equal(wrong.status, 400, 'cơ sở phải thuộc thương hiệu của hoá đơn');

  // Mã hoá đơn POS không được đồng bộ trùng
  const dup = await posOrder(brandA, { customerId, branchId: branchA, subtotal: 100_000, externalId: 'RK-0001' });
  assert.notEqual(dup.status, 201);

  // Trang quản trị không còn tạo hoá đơn
  assert.equal((await request(app).post('/api/admin/orders').set(admin(brandA)).send({ customerId, branchId: branchA, subtotal: 1 })).status, 404);
});

test('dùng Mini App thương hiệu B, đăng ký cùng SĐT → gộp thành 1 khách', async () => {
  const login = await request(app)
    .post('/api/app/auth/login')
    .set('X-Brand', 'BRAND_B')
    .send({ mockZaloId: 'zalo-b-1', name: 'Văn A' });
  assert.equal(login.body.isNew, true);
  assert.notEqual(login.body.customer.id, customerId);
  const oldTokenB = login.body.token;
  tokenB = oldTokenB;

  const link = await request(app)
    .post('/api/app/me/register')
    .set(appB())
    .send({ name: 'Văn A (tên Zalo)', birthday: '1990-10-20', branchId: branchB, phone: '0901234567' });
  assert.equal(link.status, 200, JSON.stringify(link.body));
  assert.equal(link.body.merged, true);
  assert.equal(link.body.id, customerId);
  assert.ok(link.body.token);
  tokenB = link.body.token;

  // Token cũ trỏ tới khách đã bị gộp → hết hiệu lực
  assert.equal((await request(app).get('/api/app/me').set({ Authorization: `Bearer ${oldTokenB}`, 'X-Brand': 'BRAND_B' })).status, 401);

  const meB = (await request(app).get('/api/app/me').set(appB())).body;
  assert.equal(meB.name, 'Nguyễn Văn A', 'giữ tên thành viên đã có khi gộp');
  assert.equal(meB.points, 50, 'điểm chào mừng riêng của ví B');
  assert.equal(meB.registered, true);
  assert.equal(meB.homeBranch.name, 'Quận 3');
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
  const res = await posOrder(brandB, { customerId, branchId: branchB, subtotal: 1_000_000 });
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
  const res = await posOrder(brandB, { customerId, branchId: branchB, subtotal: 500_000, voucherCode: claim.body.code });
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
  // Quản lý B không thấy ví điểm của khách tại thương hiệu A
  const detail = await request(app).get(`/api/admin/customers/${customerId}`).set(auth);
  assert.deepEqual(detail.body.wallets.map((w: any) => w.brandId), [brandB]);
  assert.ok(detail.body.totalSpent > 0, 'tổng chi tiêu chung vẫn hiển thị');

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

test('quản trị trung tâm: xem tất cả thương hiệu và lọc theo thương hiệu / cơ sở', async () => {
  const all = (await request(app).get('/api/admin/orders').set(central())).body;
  assert.deepEqual([...new Set(all.items.map((o: any) => o.brand.name))].sort(), ['Lẩu Nướng Vui', 'Nhà hàng Ngon']);
  assert.equal((await request(app).get('/api/admin/orders').set(admin(brandB))).body.total, 1);
  assert.equal((await request(app).get(`/api/admin/orders?branchId=${branchB}`).set(central())).body.total, 1);

  const branches = (await request(app).get('/api/admin/branches').set(central())).body;
  assert.equal(branches.length, 4);
  assert.ok(branches.every((b: any) => b.brand?.name));

  // Dashboard toàn hệ thống có doanh thu theo thương hiệu và theo cơ sở
  const dash = (await request(app).get('/api/admin/dashboard').set(central())).body;
  assert.equal(dash.revenueByBrand.length, 2);
  assert.equal(dash.totalCustomers, 1);
  assert.ok(dash.revenueByBranch.find((b: any) => b.id === branchB).revenue > 0);

  // Khách lọc theo cơ sở đăng ký, tháng sinh, trạng thái đăng ký
  const byBranch = (await request(app).get(`/api/admin/customers?branchId=${branchA}`).set(central())).body;
  assert.equal(byBranch.total, 1);
  assert.equal(byBranch.items[0].wallets.length, 2, 'xem toàn hệ thống thấy ví mọi thương hiệu');
  assert.equal((await request(app).get(`/api/admin/customers?birthMonth=10`).set(central())).body.total, 1);
  assert.equal((await request(app).get(`/api/admin/customers?birthMonth=3`).set(central())).body.total, 0);
  assert.equal((await request(app).get(`/api/admin/customers?registered=false`).set(central())).body.total, 0);

  // Tạo dữ liệu ở chế độ tất cả thương hiệu phải chỉ rõ thương hiệu
  const noBrand = await request(app).post('/api/admin/promotions').set(central()).send({ title: 'KM' });
  assert.equal(noBrand.status, 400);
  const promo = await request(app).post('/api/admin/promotions').set(central()).send({ title: 'KM B', brandId: brandB });
  assert.equal(promo.body.brandId, brandB);
  // Lookup cần thương hiệu
  assert.equal((await request(app).get('/api/admin/customers/lookup?q=0901234567').set(central())).status, 400);
  assert.equal((await request(app).get(`/api/admin/customers/lookup?q=0901234567&brandId=${brandB}`).set(central())).status, 200);
});

test('tặng voucher theo cơ sở khách đã đăng ký', async () => {
  const v = (await request(app).get('/api/admin/vouchers').set(admin(brandB))).body.items.find((x: any) => x.discountType === 'GIFT');
  const r = await request(app).post(`/api/admin/vouchers/${v.id}/gift`).set(central()).send({ branchId: branchB });
  assert.equal(r.body.success, 1);
  const none = await request(app).post(`/api/admin/vouchers/${v.id}/gift`).set(central()).send({ branchId: branchB + 1 });
  assert.equal(none.body.success, 0, 'cơ sở Thủ Đức chưa có khách đăng ký');
});

test('xác nhận dùng voucher tại quầy', async () => {
  const free = (await request(app).get('/api/app/vouchers?type=free').set(appB())).body[0];
  const cv = (await request(app).post(`/api/app/vouchers/${free.id}/claim`).set(appB())).body;
  assert.equal((await request(app).post('/api/admin/vouchers/redeem').set(admin(brandA)).send({ code: cv.code })).status, 404, 'khác thương hiệu');
  const ok = await request(app).post('/api/admin/vouchers/redeem').set(central()).send({ code: cv.code.toLowerCase() });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, 'USED');
  assert.equal((await request(app).post('/api/admin/vouchers/redeem').set(central()).send({ code: cv.code })).status, 400);
  const used = (await request(app).get('/api/app/my-vouchers?status=USED').set(appB())).body;
  assert.ok(used.some((v: any) => v.code === cv.code));
});
