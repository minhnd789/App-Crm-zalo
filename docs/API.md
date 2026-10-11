# Tài liệu API

Base URL mặc định khi dev: `http://localhost:4000`

- Mọi request/response là JSON. Lỗi trả về `{ "error": "thông báo tiếng Việt" }` với HTTP status 4xx/5xx.
- Danh sách có phân trang nhận `?page=1&pageSize=20` và trả về `{ items, total, page, pageSize }`.
- Ngày giờ trả về dạng ISO 8601 (UTC). Tiền tệ là số nguyên VND.
- Xác thực: header `Authorization: Bearer <token>`.

## Kiểu dữ liệu chính

```ts
Tier { id, name, code, minPoints, pointMultiplier, benefits: string|null /* nhiều dòng */, color }
Branch { id, name, address, phone, openTime: "HH:mm", closeTime: "HH:mm", imageUrl, active }
Promotion { id, title, summary, content /* nhiều dòng */, imageUrl, startDate, endDate, featured, active, createdAt }
Voucher {
  id, title, description, imageUrl,
  discountType: "PERCENT" | "AMOUNT" | "GIFT", discountValue, maxDiscount, minOrder,
  pointCost /* 0 = nhận miễn phí, >0 = đổi bằng điểm */,
  totalQuantity /* null = không giới hạn */, issuedCount, perCustomerLimit, validDays,
  startDate, endDate, minTierId, minTier: Tier|null, active
}
CustomerVoucher { id, code, customerId, voucherId, voucher: Voucher, source: "CLAIM"|"REDEEM"|"GIFT",
  pointsSpent, status: "AVAILABLE"|"USED"|"EXPIRED", expiresAt, usedAt, orderId, createdAt }
Booking { id, code, customerId, branchId, branch: Branch, bookingTime, partySize, contactName, contactPhone,
  note, status: "PENDING"|"CONFIRMED"|"ARRIVED"|"COMPLETED"|"CANCELLED"|"NO_SHOW", adminNote, createdAt }
Order { id, code, customerId, branchId, branch, bookingId, subtotal, discount, voucherDiscount, total,
  pointsEarned, note, status: "COMPLETED"|"CANCELLED", createdAt, items: OrderItem[], usedVoucher }
OrderItem { id, name, quantity, price }
PointTransaction { id, type: "EARN"|"REDEEM"|"ADJUST"|"REFUND"|"WELCOME", points /* +/- */, balanceAfter, description, orderId, createdAt }
```

## Quy tắc tích điểm & hạng

- Điểm nhận mỗi hoá đơn = `floor(total / pointPerAmount × pointMultiplier của hạng hiện tại)`
  (mặc định `pointPerAmount = 10000` → 10.000đ = 1 điểm).
- `points` = điểm hiện có (dùng để đổi voucher). `lifetimePoints` = tổng điểm đã tích (dùng xét hạng, không bị trừ khi đổi quà).
- Hạng = hạng có `minPoints` cao nhất mà `lifetimePoints >= minPoints`. Tự động cập nhật sau mỗi lần cộng điểm.
- Huỷ hoá đơn sẽ trừ lại điểm đã cộng (cả `lifetimePoints`), trả lại voucher đã dùng.

---

## API Mini App (khách hàng) — prefix `/api/app`

### Công khai (không cần token)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/config` | `{ restaurantName, hotline, about, pointPerAmount, bookingMinAdvanceMinutes, bookingMaxDays, maxPartySize }` |
| GET | `/branches` | `Branch[]` đang hoạt động |
| GET | `/tiers` | `Tier[]` sắp xếp theo minPoints tăng dần |
| GET | `/promotions?featured=true` | `Promotion[]` đang diễn ra |
| GET | `/promotions/:id` | `Promotion` |
| POST | `/auth/login` | Đăng nhập bằng Zalo, xem bên dưới |

`POST /auth/login` body:
```json
{ "accessToken": "<zmp-sdk getAccessToken()>", "name": "...", "avatar": "...", "idByOA": "...", "followedOA": true }
```
Khi backend bật `ZALO_MOCK=true` có thể gửi `{ "mockZaloId": "dev-user-1", "name": "Test" }` thay cho accessToken.
Trả về `{ token, isNew, customer: Me }`.

### Cần token khách hàng

`Me = { id, name, avatar, phone, birthday, gender, memberCode, points, lifetimePoints, totalSpent, visitCount, followedOA, createdAt, availableVouchers, tier: Tier|null, nextTier: Tier|null, pointsToNextTier }`

| Method | Path | Mô tả |
|---|---|---|
| GET | `/me` | `Me` |
| PUT | `/me` | Body `{ name?, birthday?: "YYYY-MM-DD"\|null, gender?: "MALE"\|"FEMALE"\|"OTHER"\|null, followedOA?, idByOA? }` → `Me` |
| POST | `/me/phone` | Body `{ token: "<getPhoneNumber().token>", accessToken }` (mock: `{ phone }`) → `Me` |
| GET | `/me/points?page=` | Phân trang `PointTransaction` |
| GET | `/vouchers?type=free\|points` | `(Voucher & { remaining, ownedCount, canClaim: boolean, reason: string\|null })[]` |
| GET | `/vouchers/:id` | Như trên, 1 phần tử |
| POST | `/vouchers/:id/claim` | Nhận (miễn phí) hoặc đổi điểm → `CustomerVoucher` (201) |
| GET | `/my-vouchers?status=AVAILABLE\|USED\|EXPIRED` | `CustomerVoucher[]` |
| GET | `/my-vouchers/:id` | `CustomerVoucher` (+ `order`) |
| GET | `/bookings?scope=upcoming\|past` | `Booking[]` |
| GET | `/bookings/:id` | `Booking` |
| POST | `/bookings` | Body `{ branchId, bookingTime: ISO có offset, partySize, contactName, contactPhone, note? }` → `Booking` (201) |
| POST | `/bookings/:id/cancel` | Huỷ (chỉ khi PENDING/CONFIRMED) → `Booking` |
| GET | `/orders?page=` | Phân trang `Order` (+ `branch`, `_count.items`) |
| GET | `/orders/:id` | `Order` đầy đủ |

---

## API Trang quản trị — prefix `/api/admin`

Role: `ADMIN` (quản lý – toàn quyền) và `STAFF` (nhân viên – thao tác nghiệp vụ). Các API đánh dấu 🔒 chỉ ADMIN.

| Method | Path | Mô tả |
|---|---|---|
| POST | `/auth/login` | `{ username, password }` → `{ token, admin: { id, username, name, role } }` |
| GET | `/auth/me` | admin hiện tại |
| POST | `/auth/change-password` | `{ oldPassword, newPassword }` |
| GET | `/dashboard` | `{ totalCustomers, newCustomersToday, bookingsToday, pendingBookings, revenueToday, ordersToday, revenueMonth, ordersMonth, vouchersUsedMonth, tierDistribution: {id,name,color,count}[], revenueByDay: {date,revenue,orders}[], recentOrders, upcomingBookings }` |
| GET | `/customers?q=&tierId=&sort=createdAt\|points\|totalSpent\|lastVisitAt&page=` | Phân trang khách (+ `tier`) |
| GET | `/customers/lookup?q=<SĐT hoặc mã thành viên>` | Khách + `vouchers` (AVAILABLE) + `bookings` (đang mở). 400 nếu `q` rỗng, 404 nếu không có |
| GET | `/customers/:id` | Chi tiết: `orders, bookings, vouchers, pointTransactions, tier, nextTier, pointsToNextTier` |
| PUT | `/customers/:id` | `{ name?, phone?, birthday?, gender?, note? }` |
| POST | `/customers/:id/points` 🔒 | `{ points: số +/- , description, affectTier?: boolean }` |
| POST | `/customers/:id/vouchers` | Tặng voucher `{ voucherId }` |
| GET | `/bookings?status=&branchId=&from=ISO&to=ISO&q=&order=asc\|desc&page=` | Phân trang (+ `branch`, `customer`) |
| GET | `/bookings/:id` | Chi tiết |
| PATCH | `/bookings/:id` | `{ status?, adminNote?, notify?: boolean (mặc định true – nhắn tin OA cho khách) }` – luồng: PENDING→CONFIRMED/CANCELLED; CONFIRMED→ARRIVED/CANCELLED/NO_SHOW/PENDING; ARRIVED→COMPLETED/CONFIRMED; CANCELLED→PENDING; NO_SHOW→CONFIRMED (cho phép hoàn tác thao tác nhầm) |
| GET | `/orders?q=&customerId=&branchId=&status=&from=&to=&page=` | Phân trang + `sumTotal`, `sumPoints` |
| GET | `/orders/:id` | Chi tiết |
| POST | `/orders` | `{ customerId, branchId?, bookingId?, items: [{name, quantity, price}], subtotal? (khi không nhập món), discount?, voucherCode?, note? }` → `{ order, tierUp }`. `bookingId` phải đang PENDING/CONFIRMED/ARRIVED và sẽ chuyển sang COMPLETED |
| POST | `/orders/:id/cancel` 🔒 | Huỷ hoá đơn, hoàn điểm |
| GET | `/vouchers?q=&type=free\|points&page=` | Phân trang voucher (+ `usedCount`) |
| GET | `/vouchers/check?code=&amount=` | Kiểm tra mã voucher của khách → `CustomerVoucher & { valid, reason, discount }` |
| GET | `/vouchers/:id` | Chi tiết + `stats` + `recent` |
| POST/PUT/DELETE | `/vouchers`, `/vouchers/:id` 🔒 | CRUD (xoá voucher đã phát sẽ chỉ ngừng hoạt động) |
| POST | `/vouchers/:id/gift` 🔒 | `{ customerIds?: number[], tierId? }` → `{ success, failed, errors }` |
| GET/POST/PUT/DELETE | `/promotions[/:id]` (ghi 🔒) | CRUD chương trình ưu đãi |
| GET/POST/PUT/DELETE | `/branches[/:id]` (ghi 🔒) | CRUD chi nhánh |
| GET/POST/PUT/DELETE | `/tiers[/:id]` (ghi 🔒) | CRUD hạng (tự xếp hạng lại khách) – GET có `_count.customers` |
| GET / PUT 🔒 | `/settings` | `{ restaurantName, hotline, about, pointPerAmount, welcomePoints, bookingMinAdvanceMinutes, bookingMaxDays, maxPartySize }` (giá trị dạng string) |
| GET/POST/PUT 🔒 | `/admins[/:id]` | Quản lý tài khoản `{ username, name, password, role, active }` |
| POST | `/upload` | multipart field `file` (ảnh ≤5MB) → `{ url }` |
