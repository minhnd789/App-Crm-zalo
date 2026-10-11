# Tài liệu API

Base URL mặc định khi dev: `http://localhost:4000`

- Mọi request/response là JSON. Lỗi trả về `{ "error": "thông báo tiếng Việt" }` với HTTP status 4xx/5xx.
- Danh sách có phân trang nhận `?page=1&pageSize=20` và trả về `{ items, total, page, pageSize }`.
- Ngày giờ trả về dạng ISO 8601 (UTC). Tiền tệ là số nguyên VND.
- Xác thực: header `Authorization: Bearer <token>`.

## Đa thương hiệu (phương án C)

- Mỗi **thương hiệu (Brand)** có Mini App + Zalo OA riêng, chi nhánh, chương trình ưu đãi, voucher, cài đặt tích điểm riêng.
- **Khách hàng** là 1 người trên toàn hệ thống (nhận diện bằng SĐT, mã thành viên dùng được ở mọi thương hiệu).
  Zalo cấp user ID khác nhau cho mỗi Mini App, nên lần đầu vào Mini App thương hiệu B khách được tạo mới;
  khi **liên kết cùng số điện thoại**, 2 hồ sơ được **gộp** lại (`POST /api/app/me/phone` trả `merged: true` + `token` mới).
- **Điểm và voucher riêng theo thương hiệu** (`CustomerWallet`): điểm tích ở A chỉ đổi quà của A; voucher A chỉ dùng ở A.
- **Hạng dùng chung**, xét theo **tổng chi tiêu ở mọi thương hiệu** (`Customer.totalSpent` ≥ `Tier.minSpent`).
  Hệ số nhân điểm của hạng áp dụng ở mọi thương hiệu.
- Mini App gửi header **`X-Brand: <mã thương hiệu>`** ở mọi request. Token khách chỉ dùng được trong Mini App đã cấp.
- Trang quản trị gửi header **`X-Brand-Id: <id>`** cho dữ liệu theo thương hiệu. Tài khoản gắn thương hiệu
  (`admin.brandId`) luôn bị giới hạn trong thương hiệu đó (không gửi header = mặc định thương hiệu của mình).

## Kiểu dữ liệu chính

```ts
Brand { id, code, name, logoUrl, primaryColor, hotline, about, zaloAppId, zaloOaId, active,
  hasZaloAppSecretKey: boolean, hasZaloOaAccessToken: boolean /* secret không bao giờ trả về */ }
Tier { id, name, code, minSpent /* VND, dùng chung */, pointMultiplier, benefits: string|null /* nhiều dòng */, color }
Wallet { id, customerId, brandId, points, lifetimePoints, totalSpent, visitCount, lastVisitAt } // ví điểm theo thương hiệu
Branch { id, brandId, name, address, phone, openTime: "HH:mm", closeTime: "HH:mm", imageUrl, active }
Promotion { id, brandId, title, summary, content /* nhiều dòng */, imageUrl, startDate, endDate, featured, active, createdAt }
Voucher {
  id, brandId, title, description, imageUrl,
  discountType: "PERCENT" | "AMOUNT" | "GIFT", discountValue, maxDiscount, minOrder,
  pointCost /* 0 = nhận miễn phí, >0 = đổi bằng điểm */,
  totalQuantity /* null = không giới hạn */, issuedCount, perCustomerLimit, validDays,
  startDate, endDate, minTierId, minTier: Tier|null, active
}
CustomerVoucher { id, code, brandId, customerId, voucherId, voucher: Voucher, source: "CLAIM"|"REDEEM"|"GIFT",
  pointsSpent, status: "AVAILABLE"|"USED"|"EXPIRED", expiresAt, usedAt, orderId, createdAt }
Booking { id, code, brandId, customerId, branchId, branch: Branch, bookingTime, partySize, contactName, contactPhone,
  note, status: "PENDING"|"CONFIRMED"|"ARRIVED"|"COMPLETED"|"CANCELLED"|"NO_SHOW", adminNote, createdAt }
Order { id, code, brandId, customerId, branchId, branch, bookingId, subtotal, discount, voucherDiscount, total,
  pointsEarned, note, status: "COMPLETED"|"CANCELLED", source: "ADMIN"|"POS", externalId, createdAt, items: OrderItem[], usedVoucher }
OrderItem { id, name, quantity, price }
PointTransaction { id, brandId, type: "EARN"|"REDEEM"|"ADJUST"|"REFUND"|"WELCOME", points /* +/- */, balanceAfter, description, orderId, createdAt }
```

## Quy tắc tích điểm & hạng

- Điểm nhận mỗi hoá đơn = `floor(total / pointPerAmount của thương hiệu × pointMultiplier của hạng hiện tại)`
  (mặc định `pointPerAmount = 10000` → 10.000đ = 1 điểm), cộng vào ví của thương hiệu xuất hoá đơn.
- `points` = điểm hiện có trong ví thương hiệu (dùng để đổi voucher). `lifetimePoints` = tổng điểm đã tích ở thương hiệu (thống kê).
- Hạng = hạng có `minSpent` cao nhất mà `Customer.totalSpent >= minSpent`. Tự cập nhật sau mỗi hoá đơn / huỷ hoá đơn.
- Huỷ hoá đơn sẽ trừ lại điểm đã cộng (có thể làm ví âm nếu khách đã tiêu điểm), trừ chi tiêu, trả voucher, xét lại hạng.

---

## API Mini App (khách hàng) — prefix `/api/app`

Mọi request (kể cả công khai) phải có header `X-Brand: <mã thương hiệu>`, vd `X-Brand: BRAND_A`.

### Công khai (không cần token)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/config` | `{ brand: { id, code, name, logoUrl, primaryColor, hotline, about, zaloOaId }, pointPerAmount, bookingMinAdvanceMinutes, bookingMaxDays, maxPartySize }` |
| GET | `/branches` | `Branch[]` đang hoạt động của thương hiệu |
| GET | `/tiers` | `Tier[]` (dùng chung) sắp xếp theo minSpent tăng dần |
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

`Me = { id, name, avatar, phone, birthday, gender, memberCode,
  points, lifetimePoints, brandSpent, brandVisitCount,        // tại thương hiệu này
  totalSpent, visitCount,                                     // mọi thương hiệu – dùng xét hạng
  followedOA, createdAt, availableVouchers,
  otherWallets: { brand: { id, name, code }, points }[],      // điểm ở thương hiệu khác
  tier: Tier|null, nextTier: Tier|null, amountToNextTier /* VND còn thiếu để lên hạng */ }`

| Method | Path | Mô tả |
|---|---|---|
| GET | `/me` | `Me` |
| PUT | `/me` | Body `{ name?, birthday?: "YYYY-MM-DD"\|null, gender?: "MALE"\|"FEMALE"\|"OTHER"\|null, followedOA?, idByOA? }` → `Me` |
| POST | `/me/phone` | Body `{ token: "<getPhoneNumber().token>", accessToken }` (mock: `{ phone }`) → `Me & { merged: boolean, token?: string }`. Khi `merged = true` client **phải thay token** bằng `token` mới |
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

Role: `ADMIN` (quản lý) và `STAFF` (nhân viên – thao tác nghiệp vụ). Các API đánh dấu 🔒 chỉ ADMIN.
`brandId = null` → tài khoản toàn hệ thống; có `brandId` → chỉ thao tác trong thương hiệu đó.
Các API đánh dấu 🌐 chỉ **ADMIN toàn hệ thống** (role ADMIN và brandId null).
Các API đánh dấu 🏷 là dữ liệu theo thương hiệu, cần header `X-Brand-Id` (trừ tài khoản đã gắn thương hiệu).

| Method | Path | Mô tả |
|---|---|---|
| POST | `/auth/login` | `{ username, password }` → `{ token, admin: { id, username, name, role, brandId } }` |
| GET | `/auth/me` | admin hiện tại + `brands: Brand[]` được phép thao tác |
| GET/POST/PUT 🌐 | `/brands[/:id]` | Quản lý thương hiệu `{ code, name, logoUrl, primaryColor, hotline, about, zaloAppId, zaloOaId, zaloAppSecretKey, zaloOaAccessToken, active }`. Trường secret: không gửi / chuỗi rỗng = giữ nguyên, `null` = xoá |
| POST | `/auth/change-password` | `{ oldPassword, newPassword }` |
| GET 🏷 | `/dashboard` | `{ totalCustomers, newCustomersToday, bookingsToday, pendingBookings, revenueToday, ordersToday, revenueMonth, ordersMonth, vouchersUsedMonth, tierDistribution: {id,name,color,count}[], revenueByDay: {date,revenue,orders}[], recentOrders, upcomingBookings }` |
| GET | `/customers?q=&tierId=&onlyBrand=true&sort=createdAt\|totalSpent\|lastVisitAt&page=` | Phân trang khách dùng chung (+ `tier`, `brandIds` đã dùng Mini App, `wallet` của thương hiệu đang chọn nếu có X-Brand-Id). `onlyBrand=true` = chỉ khách đã có ví ở thương hiệu đang chọn |
| GET 🏷 | `/customers/lookup?q=<SĐT hoặc mã thành viên>` | Khách + `wallet` + `vouchers` (AVAILABLE) + `bookings` (đang mở) **của thương hiệu đang chọn**. 400 nếu `q` rỗng, 404 nếu không có |
| GET | `/customers/:id` | Chi tiết: `tier, nextTier, amountToNextTier, wallets[] (+brand), zaloAccounts[] (+brand) – tài khoản gắn thương hiệu chỉ thấy ví/tài khoản của thương hiệu mình, wallet` (ví thương hiệu đang chọn), `orders, bookings, vouchers, pointTransactions` (lọc theo thương hiệu đang chọn nếu có X-Brand-Id, mỗi bản ghi kèm `brand`) |
| PUT | `/customers/:id` | `{ name?, phone?, birthday?, gender?, note? }` |
| POST 🏷 | `/customers/:id/points` 🔒 | `{ points: số +/-, description }` → `{ wallet }` (ví thương hiệu đang chọn; không ảnh hưởng hạng) |
| POST 🏷 | `/customers/:id/vouchers` | Tặng voucher của thương hiệu `{ voucherId }` |
| GET 🏷 | `/bookings?status=&branchId=&from=ISO&to=ISO&q=&order=asc\|desc&page=` | Phân trang (+ `branch`, `customer`) |
| GET 🏷 | `/bookings/:id` | Chi tiết |
| PATCH 🏷 | `/bookings/:id` | `{ status?, adminNote?, notify?: boolean (mặc định true – nhắn tin OA cho khách) }` – luồng: PENDING→CONFIRMED/CANCELLED; CONFIRMED→ARRIVED/CANCELLED/NO_SHOW/PENDING; ARRIVED→COMPLETED/CONFIRMED; CANCELLED→PENDING; NO_SHOW→CONFIRMED (cho phép hoàn tác thao tác nhầm) |
| GET 🏷 | `/orders?q=&customerId=&branchId=&status=&from=&to=&page=` | Phân trang + `sumTotal`, `sumPoints` |
| GET 🏷 | `/orders/:id` | Chi tiết |
| POST 🏷 | `/orders` | `{ customerId, branchId?, bookingId?, items: [{name, quantity, price}], subtotal? (khi không nhập món), discount?, voucherCode?, note? }` → `{ order, tierUp, tier, balance }` (balance = điểm ví thương hiệu sau khi cộng). `bookingId` phải đang PENDING/CONFIRMED/ARRIVED và sẽ chuyển sang COMPLETED |
| POST 🏷 | `/orders/:id/cancel` 🔒 | Huỷ hoá đơn, hoàn điểm |
| GET 🏷 | `/vouchers?q=&type=free\|points&page=` | Phân trang voucher (+ `usedCount`) |
| GET 🏷 | `/vouchers/check?code=&amount=` | Kiểm tra mã voucher của khách → `CustomerVoucher & { valid, reason, discount }` |
| GET 🏷 | `/vouchers/:id` | Chi tiết + `stats` + `recent` |
| POST/PUT/DELETE 🏷 | `/vouchers`, `/vouchers/:id` 🔒 | CRUD (xoá voucher đã phát sẽ chỉ ngừng hoạt động) |
| POST 🏷 | `/vouchers/:id/gift` 🔒 | `{ customerIds?: number[], tierId? }` → `{ success, failed, errors }` |
| GET/POST/PUT/DELETE 🏷 | `/promotions[/:id]` (ghi 🔒) | CRUD chương trình ưu đãi |
| GET/POST/PUT/DELETE 🏷 | `/branches[/:id]` (ghi 🔒) | CRUD chi nhánh |
| GET/POST/PUT/DELETE | `/tiers[/:id]` (ghi 🌐) | CRUD hạng dùng chung `{ name, code, minSpent, pointMultiplier, benefits, color }` (tự xếp hạng lại khách) – GET có `_count.customers` |
| GET / PUT 🔒 🏷 | `/settings` | Cài đặt của thương hiệu `{ pointPerAmount, welcomePoints, bookingMinAdvanceMinutes, bookingMaxDays, maxPartySize }` (giá trị dạng string). Tên, hotline, giới thiệu nằm ở Brand |
| GET/POST/PUT 🔒 | `/admins[/:id]` | Quản lý tài khoản `{ username, name, password, role, active, brandId }` (+ `brand`). Quản lý thương hiệu chỉ thấy/tạo tài khoản trong thương hiệu mình |
| POST | `/upload` | multipart field `file` (ảnh ≤5MB) → `{ url }` |
