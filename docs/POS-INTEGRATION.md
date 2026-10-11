# Đặc tả kết nối CRM ↔ phần mềm bán hàng r_keeper (DCorp)

Tài liệu dành cho DCorp / đơn vị viết connector r_keeper. CRM chỉ dùng HTTPS + JSON, **không phụ thuộc** cách r_keeper
lưu dữ liệu: connector (chạy cạnh máy chủ r_keeper hoặc dịch vụ của DCorp) chịu trách nhiệm chuyển đổi
giữa định dạng r_keeper và định dạng dưới đây.

```
         (1) khách đăng ký Mini App                       (2) khách thanh toán tại quầy
 ┌─────┐  CUSTOMER_UPSERT  ┌───────────────┐             ┌───────────────┐   bill   ┌─────┐
 │ CRM │ ────────────────▶ │  Connector    │ ──────────▶ │   r_keeper    │ ───────▶ │ ... │
 │     │   POST webhook    │ (DCorp)       │  tạo khách  │  (POS)        │          └─────┘
 │     │ ◀──────────────── │               │ ◀────────── │               │
 └─────┘ POST /api/pos/bills (bill đã thanh toán / huỷ)  └───────────────┘
```

Mỗi **thương hiệu** cấu hình riêng (trang quản trị → Thương hiệu → Kết nối POS):

| Thông tin | Ý nghĩa |
|---|---|
| Bật kết nối POS | Bật/tắt toàn bộ đồng bộ của thương hiệu |
| API key POS | Connector gửi trong header `X-Api-Key` khi gọi CRM. Tạo trên trang quản trị, **chỉ hiện 1 lần** |
| Webhook URL | Địa chỉ của connector để CRM gửi khách hàng mới |
| Webhook secret | Khoá ký HMAC để connector xác thực request của CRM |

Mỗi **cơ sở** (trang quản trị → Cơ sở) khai báo **Mã POS** = mã nhà hàng / điểm bán bên r_keeper, để bill gửi về
được ghi nhận đúng cơ sở.

---

## 1. CRM → r_keeper: khách hàng mới / cập nhật

Khi khách **hoàn tất đăng ký thành viên** trên Mini App (hoặc đổi cơ sở, hoặc quản trị sửa thông tin), CRM gửi:

```
POST <Webhook URL>
Content-Type: application/json
X-CRM-Event: customer.upsert
X-CRM-Delivery: <id bản ghi nhật ký – dùng chống xử lý trùng>
X-CRM-Signature: sha256=<HMAC-SHA256(webhook secret, raw body) dạng hex>
```

```json
{
  "event": "customer.upsert",
  "brand": { "code": "BRAND_A", "name": "Nhà hàng Ngon" },
  "customer": {
    "crmId": 123,
    "memberCode": "4815162342",
    "posCustomerId": null,
    "name": "Nguyễn Văn A",
    "phone": "0901234567",
    "birthday": "1990-10-20",
    "gender": "MALE",
    "homeBranch": { "id": 1, "name": "Quận 1", "posCode": "RK-Q1" },
    "tier": { "code": "SILVER", "name": "Bạc", "pointMultiplier": 1.2 },
    "points": 50,
    "totalSpent": 5550000,
    "registeredAt": "2026-10-11T08:00:00.000Z"
  }
}
```

- `memberCode`: mã thành viên – cũng là nội dung **QR thành viên** trên Mini App. Nên lưu làm mã thẻ / mã khách
  bên r_keeper để thu ngân quét QR là nhận diện được khách.
- `posCustomerId`: mã khách bên r_keeper (null ở lần đầu).
- Connector tạo mới hoặc cập nhật khách bên r_keeper, trả **HTTP 2xx**, nên kèm mã khách để CRM lưu lại:

```json
{ "posCustomerId": "RK-000123" }
```

Gửi lại: nếu connector trả lỗi / không phản hồi trong 10 giây, CRM tự gửi lại sau 2, 4, 8, 16... phút
(tối đa 8 lần, cách nhau tối đa 6 giờ). Quản trị có thể gửi lại thủ công trên trang **Đồng bộ POS**.
Cùng 1 khách có thể được gửi nhiều lần (mỗi lần là dữ liệu mới nhất) → connector xử lý kiểu *upsert*.

Kiểm tra chữ ký (Node.js):

```js
const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers['x-crm-signature']))) reject();
```

---

## 2. r_keeper → CRM: bill thanh toán (cộng điểm & chi tiêu xét hạng)

Khi bill được **đóng / thanh toán** bên r_keeper, connector gọi:

```
POST https://<api-crm>/api/pos/bills
Content-Type: application/json
X-Api-Key: <API key POS của thương hiệu>
```

```json
{
  "billId": "CHK-000123",
  "status": "PAID",
  "branchCode": "RK-Q1",
  "customer": { "memberCode": "4815162342", "phone": "0901234567", "posCustomerId": "RK-000123" },
  "subtotal": 1000000,
  "discount": 100000,
  "total": 900000,
  "items": [{ "name": "Lẩu thái", "quantity": 1, "price": 1000000 }],
  "voucherCode": "VABC1234",
  "paidAt": "2026-10-11T19:30:00+07:00"
}
```

| Trường | Bắt buộc | Mô tả |
|---|---|---|
| `billId` | ✅ | Mã bill / check bên r_keeper, **duy nhất trong thương hiệu**. Gửi lại cùng `billId` không cộng điểm lần 2 |
| `status` | | `PAID` (mặc định) hoặc `VOID` (huỷ bill đã gửi trước đó) |
| `branchCode` | nên có | Mã nhà hàng bên r_keeper = **Mã POS** của cơ sở trên CRM |
| `customer` | nên có | Ít nhất 1 trong: `posCustomerId` (mã khách r_keeper), `memberCode` (QR thành viên), `phone`. CRM tìm theo thứ tự đó |
| `subtotal` | ✅ | Tổng tiền món (VND, số nguyên) |
| `discount` | | Tổng giảm giá **đã áp dụng trên POS** (kể cả voucher) |
| `total` | | Số tiền khách trả. Phải bằng `subtotal - discount` (gửi 1 trong 2 cũng được) |
| `items` | | Chi tiết món để khách xem lại lịch sử trên Mini App |
| `voucherCode` | | Mã voucher CRM khách đã dùng – CRM đánh dấu voucher **đã sử dụng** (giảm giá do POS tính) |
| `paidAt` | | Thời điểm thanh toán (ISO 8601 có múi giờ) |

CRM xử lý:

- **Điểm tích luỹ** (ví của thương hiệu) = `floor(total / pointPerAmount × hệ số hạng)`; mặc định 10.000đ = 1 điểm.
- **Chi tiêu xét hạng** (dùng chung mọi thương hiệu) += `total` → tự động **thăng hạng** khi đạt ngưỡng.
- Gửi tin nhắn OA cho khách (nếu đã cấu hình).

Phản hồi:

| HTTP | Ý nghĩa | Connector cần làm |
|---|---|---|
| `201` | Đã ghi nhận, đã cộng điểm | Có thể in điểm lên hoá đơn |
| `200` | Bill này đã ghi nhận trước đó (`duplicate: true`) | Không cần làm gì |
| `202` | Đã lưu nhưng **chưa khớp** khách / mã cơ sở (`status: "UNMATCHED"`) | **Không** gửi lại – quản trị xử lý tay trên trang Đồng bộ POS |
| `400` | Dữ liệu sai (vd `total` ≠ `subtotal - discount`) | Sửa dữ liệu rồi gửi lại |
| `401` | Sai API key / thương hiệu chưa bật kết nối | Kiểm tra cấu hình |
| `5xx` / timeout | Lỗi tạm thời | Gửi lại sau (an toàn vì chống trùng theo `billId`) |

```json
{
  "status": "SUCCESS",
  "duplicate": false,
  "warning": null,
  "orderCode": "HD7KQ2M9XA",
  "pointsEarned": 90,
  "customer": {
    "memberCode": "4815162342",
    "name": "Nguyễn Văn A",
    "points": 140,
    "tier": { "code": "SILVER", "name": "Bạc" },
    "totalSpent": 6450000
  }
}
```

`warning` khác null khi voucher không hợp lệ (đã dùng / hết hạn / không thuộc khách): bill **vẫn được cộng điểm**,
voucher bị bỏ qua.

### Huỷ bill

```json
{ "billId": "CHK-000123", "status": "VOID", "subtotal": 0 }
```

CRM trừ lại điểm đã cộng, trừ chi tiêu (có thể tụt hạng), trả lại voucher đã dùng.

---

## 3. Tra cứu thành viên tại máy POS (tuỳ chọn)

Thu ngân quét QR thành viên / nhập SĐT để xem điểm, hạng, voucher còn dùng được:

```
GET https://<api-crm>/api/pos/customers/lookup?q=<memberCode | SĐT | posCustomerId>
X-Api-Key: <API key POS>
```

```json
{
  "memberCode": "4815162342", "posCustomerId": "RK-000123", "name": "Nguyễn Văn A", "phone": "0901234567",
  "birthday": "1990-10-20", "registered": true, "homeBranch": { "name": "Quận 1", "posCode": "RK-Q1" },
  "points": 140, "totalSpent": 6450000,
  "tier": { "code": "SILVER", "name": "Bạc", "pointMultiplier": 1.2, "minSpent": 5000000 },
  "nextTier": { "code": "GOLD", "name": "Vàng", "minSpent": 20000000 }, "amountToNextTier": 13550000,
  "vouchers": [{ "code": "VABC1234", "title": "Giảm 10% hoá đơn", "discountType": "PERCENT", "discountValue": 10,
                 "maxDiscount": 200000, "minOrder": 0, "expiresAt": "2026-12-01T00:00:00.000Z" }]
}
```

---

## 4. Câu hỏi cần DCorp xác nhận

1. Phiên bản r_keeper và cách connector lấy bill đã đóng (XML interface, giao diện loyalty ngoài / FarCards, hay khác).
2. Mã nhà hàng / điểm bán dùng làm `branchCode` cho từng cơ sở.
3. Thu ngân nhận diện khách bằng cách nào: quét QR `memberCode`, nhập SĐT, hay thẻ r_keeper.
4. r_keeper có lưu khách hàng (guest / card) để nhận `customer.upsert` không, mã khách trả về là gì.
5. Giảm giá bằng voucher CRM áp trên POS thế nào (thu ngân nhập tay hay connector gọi tra cứu ở mục 3).
