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
- **Trang quản trị trung tâm**: header **`X-Brand-Id: <id>`** là *bộ lọc* thương hiệu. Không gửi = xem **tất cả thương hiệu**
  (mỗi bản ghi trả kèm `brand`). Khi tạo mới ở chế độ tất cả phải chỉ rõ thương hiệu (`brandId` trong body,
  hoá đơn thì theo cơ sở `branchId`). Tài khoản gắn thương hiệu (`admin.brandId`) luôn bị giới hạn trong thương hiệu đó.
- **Cơ sở** (Branch) của mỗi thương hiệu đặt tên theo vị trí (vd "Quận 1"); hiển thị kèm tên thương hiệu.
- **Đăng ký thành viên** trên Mini App: tên & SĐT lấy theo Zalo, khách nhập ngày sinh và chọn cơ sở hay đến
  (`CustomerWallet.homeBranchId`) để phân loại. Điểm chào mừng tặng khi hoàn tất đăng ký (1 lần/thương hiệu).
  Chưa đăng ký thì chưa đặt bàn / nhận voucher được (403).

## Kiểu dữ liệu chính

```ts
Brand { id, code, name, logoUrl, primaryColor, hotline, about, zaloAppId, zaloOaId, active,
  posEnabled, posProvider: "WEBHOOK"|"DCORP", posWebhookUrl, dcorpBaseUrl, dcorpClientId, dcorpOrganization,
  hasZaloAppSecretKey, hasZaloOaAccessToken, hasPosApiKey, hasPosWebhookSecret, hasDcorpClientSecret /* secret không bao giờ trả về */ }
Tier { id, name, code, minSpent /* VND, dùng chung */, pointMultiplier, benefits: string|null /* nhiều dòng */, color }
Wallet { id, customerId, brandId, homeBranchId, homeBranch, registeredAt, points, lifetimePoints, totalSpent, visitCount, lastVisitAt } // ví điểm / thành viên theo thương hiệu
Branch { id, brandId, posCode /* mã nhà hàng bên r_keeper */, name, address, phone, openTime: "HH:mm", closeTime: "HH:mm", imageUrl, active }
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
| GET | `/config` | `{ brand: { id, code, name, logoUrl, primaryColor, hotline, about, zaloOaId }, pointPerAmount, welcomePoints, bookingMinAdvanceMinutes, bookingMaxDays, maxPartySize }` |
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
  registered: boolean, registeredAt, homeBranch: Branch|null,  // đăng ký thành viên tại thương hiệu này
  otherWallets: { brand: { id, name, code }, points }[],      // điểm ở thương hiệu khác
  tier: Tier|null, nextTier: Tier|null, amountToNextTier /* VND còn thiếu để lên hạng */ }`

| Method | Path | Mô tả |
|---|---|---|
| GET | `/me` | `Me` |
| PUT | `/me` | Body `{ name?, birthday?: "YYYY-MM-DD"\|null, gender?: "MALE"\|"FEMALE"\|"OTHER"\|null, followedOA?, idByOA? }` → `Me` |
| POST | `/me/phone` | Body `{ token: "<getPhoneNumber().token>", accessToken }` (mock: `{ phone }`) → `Me & { merged: boolean, token?: string }`. Khi `merged = true` client **phải thay token** bằng `token` mới |
| POST | `/me/register` | **Đăng ký thành viên** `{ name, birthday: "YYYY-MM-DD", branchId, token, accessToken }` (token từ `getPhoneNumber()`; bỏ trống nếu tài khoản đã có SĐT; mock: `{ phone }`) → `Me & { merged, token? }`. Tặng điểm chào mừng lần đầu; nếu SĐT đã là thành viên → gộp (giữ tên & ngày sinh đã có), client **phải thay token** |
| PUT | `/me/home-branch` | Đổi cơ sở hay đến `{ branchId }` → `Me` |
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
Các API đánh dấu 🏷 là dữ liệu theo thương hiệu: lọc theo header `X-Brand-Id` (không gửi = tất cả thương hiệu, mỗi bản ghi kèm `brand`).
Thao tác trên 1 bản ghi (sửa, huỷ, đổi trạng thái) tự lấy thương hiệu của bản ghi. Tạo mới ở chế độ tất cả cần `brandId` trong body.

| Method | Path | Mô tả |
|---|---|---|
| POST | `/auth/login` | `{ username, password }` → `{ token, admin: { id, username, name, role, brandId } }` |
| GET | `/auth/me` | admin hiện tại + `brands: Brand[]` được phép thao tác |
| POST 🌐 | `/brands/:id/dcorp-test` | Kiểm tra cấu hình DCorp (lấy thử access token) → `{ ok, message }` |
| POST 🌐 | `/brands/:id/pos-api-key` | Tạo API key mới cho phần mềm bán hàng gửi bill về → `{ apiKey }` (chỉ hiện 1 lần, key cũ hết hiệu lực) |
| GET 🏷 | `/pos/logs?direction=IN\|OUT&status=PENDING\|SUCCESS\|FAILED\|UNMATCHED\|IGNORED&type=&q=<mã bill>&page=` | Nhật ký đồng bộ r_keeper (+ `brand`, `customer`, `order`, `statusCounts`) |
| POST 🏷 | `/pos/logs/:id/retry` 🔒 | OUT: gửi lại khách sang POS; IN (bill chưa khớp/lỗi): xử lý lại, có thể kèm `{ customerId }` để gán khách |
| GET/POST/PUT 🌐 | `/brands[/:id]` | Quản lý thương hiệu `{ code, name, logoUrl, primaryColor, hotline, about, zaloAppId, zaloOaId, zaloAppSecretKey, zaloOaAccessToken, posEnabled, posProvider, posWebhookUrl, posWebhookSecret, dcorpBaseUrl, dcorpClientId, dcorpClientSecret, dcorpOrganization, active }`. Trường secret: không gửi / chuỗi rỗng = giữ nguyên, `null` = xoá |
| POST | `/auth/change-password` | `{ oldPassword, newPassword }` |
| GET 🏷 | `/dashboard?branchId=` | `{ revenueByBrand: {id,name,primaryColor,revenue,orders}[], revenueByBranch: {id,name,brandId,brandName,revenue,orders}[] (tháng này), totalCustomers, newCustomersToday, bookingsToday, pendingBookings, revenueToday, ordersToday, revenueMonth, ordersMonth, vouchersUsedMonth, tierDistribution: {id,name,color,count}[], revenueByDay: {date,revenue,orders}[], recentOrders, upcomingBookings }` |
| GET 🏷 | `/customers?q=&tierId=&branchId=&registered=true\|false&birthMonth=1..12&sort=createdAt\|totalSpent\|lastVisitAt&page=` | Phân trang khách (+ `tier`, `wallets[]` kèm `brand`, `homeBranch`, `registeredAt`; `wallet` = ví thương hiệu đang lọc). Khi lọc thương hiệu/cơ sở/đăng ký: chỉ khách là thành viên phù hợp. `branchId` = cơ sở khách chọn khi đăng ký |
| GET 🏷 | `/customers/lookup?q=<SĐT hoặc mã thành viên>&brandId=` | Tra cứu nhanh khách tại quầy (cần thương hiệu: bộ lọc hoặc `brandId`) Khách + `wallet` + `vouchers` (AVAILABLE) + `bookings` (đang mở) **của thương hiệu đang chọn**. 400 nếu `q` rỗng, 404 nếu không có |
| GET | `/customers/:id` | Chi tiết: `tier, nextTier, amountToNextTier, wallets[] (+brand), zaloAccounts[] (+brand) – tài khoản gắn thương hiệu chỉ thấy ví/tài khoản của thương hiệu mình, wallet` (ví thương hiệu đang chọn), `orders, bookings, vouchers, pointTransactions` (lọc theo thương hiệu đang chọn nếu có X-Brand-Id, mỗi bản ghi kèm `brand`) |
| PUT | `/customers/:id` | `{ name?, phone?, birthday?, gender?, note? }` |
| POST 🏷 | `/customers/:id/points` 🔒 | `{ points: số +/-, description, brandId? }` → `{ wallet }` (ví thương hiệu đang chọn; không ảnh hưởng hạng) |
| POST 🏷 | `/customers/:id/vouchers` | Tặng voucher của thương hiệu `{ voucherId }` |
| GET 🏷 | `/bookings?status=&branchId=&from=ISO&to=ISO&q=&order=asc\|desc&page=` | Phân trang (+ `branch`, `customer`) |
| GET 🏷 | `/bookings/:id` | Chi tiết |
| PATCH 🏷 | `/bookings/:id` | `{ status?, adminNote?, notify?: boolean (mặc định true – nhắn tin OA cho khách) }` – luồng: PENDING→CONFIRMED/CANCELLED; CONFIRMED→ARRIVED/CANCELLED/NO_SHOW/PENDING; ARRIVED→COMPLETED/CONFIRMED; CANCELLED→PENDING; NO_SHOW→CONFIRMED (cho phép hoàn tác thao tác nhầm) |
| GET 🏷 | `/orders?q=&customerId=&branchId=&status=&from=&to=&page=` | Phân trang + `sumTotal`, `sumPoints` |
| GET 🏷 | `/orders/:id` | Chi tiết |
| — | ~~`POST /orders`~~ | **Không có** – hoá đơn chỉ được đồng bộ từ phần mềm bán hàng (r_keeper qua DCorp, làm sau). Service `createOrder` (source `POS`, `externalId` chống trùng) đã sẵn sàng cho bộ đồng bộ |
| POST 🏷 | `/orders/:id/cancel` 🔒 | Huỷ hoá đơn, hoàn điểm |
| GET 🏷 | `/vouchers?q=&type=free\|points&page=` | Phân trang voucher (+ `usedCount`) |
| GET 🏷 | `/vouchers/check?code=&amount=` | Kiểm tra mã voucher của khách → `CustomerVoucher & { valid, reason, discount }` |
| POST 🏷 | `/vouchers/redeem` | Xác nhận khách dùng voucher tại quầy `{ code }` → `CustomerVoucher` (status USED). 400 nếu đã dùng/hết hạn, 404 nếu không có / khác thương hiệu |
| GET 🏷 | `/vouchers/:id` | Chi tiết + `stats` + `recent` |
| POST/PUT/DELETE 🏷 | `/vouchers`, `/vouchers/:id` 🔒 | CRUD (xoá voucher đã phát sẽ chỉ ngừng hoạt động) |
| POST 🏷 | `/vouchers/:id/gift` 🔒 | `{ customerIds?: number[], tierId?, branchId? (khách đã đăng ký tại cơ sở) }` → `{ success, failed, errors }` |
| GET/POST/PUT/DELETE 🏷 | `/promotions[/:id]` (ghi 🔒) | CRUD chương trình ưu đãi (+ `brand`; tạo mới cần `brandId` khi xem tất cả) |
| GET/POST/PUT/DELETE 🏷 | `/branches[/:id]` (ghi 🔒) | CRUD cơ sở (+ `brand`, `_count.members` = số khách đăng ký tại cơ sở; tạo mới cần `brandId` khi xem tất cả) |
| GET/POST/PUT/DELETE | `/tiers[/:id]` (ghi 🌐) | CRUD hạng dùng chung `{ name, code, minSpent, pointMultiplier, benefits, color }` (tự xếp hạng lại khách) – GET có `_count.customers` |
| GET / PUT 🔒 🏷 | `/settings?brandId=` | Cài đặt của 1 thương hiệu (bộ lọc hoặc `?brandId=`) `{ pointPerAmount, welcomePoints, bookingMinAdvanceMinutes, bookingMaxDays, maxPartySize }` (giá trị dạng string). Tên, hotline, giới thiệu nằm ở Brand |
| GET/POST/PUT 🔒 | `/admins[/:id]` | Quản lý tài khoản `{ username, name, password, role, active, brandId }` (+ `brand`). Quản lý thương hiệu chỉ thấy/tạo tài khoản trong thương hiệu mình |
| POST | `/upload` | multipart field `file` (ảnh ≤5MB) → `{ url }` |

---

## API cho phần mềm bán hàng (r_keeper / DCorp) — prefix `/api/pos`

Xác thực bằng header `X-Api-Key` (theo thương hiệu). Đặc tả đầy đủ cho DCorp: [`POS-INTEGRATION.md`](POS-INTEGRATION.md).

| Method | Path | Mô tả |
|---|---|---|
| POST | `/bills` | Nhận bill đã thanh toán (`status: PAID`) hoặc huỷ (`VOID`) → cộng/hoàn điểm ví thương hiệu & chi tiêu xét hạng. 201 đã ghi nhận, 200 trùng, 202 chưa khớp khách/cơ sở |
| GET | `/customers/lookup?q=` | Tra cứu thành viên tại máy POS (memberCode / SĐT / mã khách r_keeper) |

Lưu ý chung: mọi API cập nhật (PUT) chỉ thay đổi các trường được gửi lên.
