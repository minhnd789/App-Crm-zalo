# CRM Nhà hàng trên Zalo Mini App

Hệ thống chăm sóc khách hàng cho nhà hàng gồm 3 phần tách biệt:

| Thư mục | Mô tả | Người dùng |
|---|---|---|
| [`mini-app/`](mini-app) | Zalo Mini App gắn với Zalo OA của nhà hàng | Khách hàng |
| [`admin/`](admin) | Trang quản trị web, chạy ở domain riêng (không nằm trong Mini App) | Quản lý, nhân viên |
| [`backend/`](backend) | API + cơ sở dữ liệu dùng chung cho cả hai | — |

```
 Khách hàng (Zalo)                 Nhân viên / Quản lý (trình duyệt)
 ┌──────────────┐                   ┌──────────────────────┐
 │  Mini App    │                   │  Trang quản trị      │
 │  /api/app/*  │                   │  /api/admin/*        │
 └──────┬───────┘                   └──────────┬───────────┘
        │  JWT khách hàng                      │  JWT quản trị
        └───────────────┐       ┌──────────────┘
                     ┌──▼───────▼──┐      ┌─────────────────────┐
                     │   Backend   │─────▶│ Zalo Graph API / OA │
                     │  (Express)  │      │ xác thực, SĐT, nhắn │
                     └──────┬──────┘      └─────────────────────┘
                            │ Prisma
                     ┌──────▼──────┐
                     │  Database   │  SQLite (dev) / PostgreSQL, MySQL (prod)
                     └─────────────┘
```

## Tính năng

**Mini App (khách hàng)**
- Đăng nhập bằng tài khoản Zalo, liên kết số điện thoại, quan tâm OA
- Thẻ thành viên: hạng, điểm hiện có, tiến trình lên hạng, **mã QR thành viên** để nhân viên quét tích điểm
- **Đặt bàn** theo chi nhánh, ngày giờ, số khách; xem và huỷ lịch đã đặt
- **Chương trình ưu đãi**: xem danh sách và chi tiết khuyến mãi
- **Nhận voucher** miễn phí và **đổi điểm lấy voucher**, ví voucher (còn hạn / đã dùng / hết hạn)
- **Lịch sử ăn uống**: các hoá đơn đã ăn tại nhà hàng, số điểm được cộng mỗi lần
- Lịch sử tích/trừ điểm, quyền lợi từng hạng thành viên

**Trang quản trị**
- Tổng quan: doanh thu, khách mới, đặt bàn hôm nay, phân bố hạng
- Quản lý khách hàng: hồ sơ, ghi chú, cộng/trừ điểm thủ công, tặng voucher
- Quản lý đặt bàn: xác nhận / huỷ / khách đã đến / không đến (tự nhắn tin qua OA nếu cấu hình)
- **Tạo hoá đơn tích điểm**: tìm khách theo SĐT hoặc quét QR → nhập món hoặc tổng tiền → áp voucher → tự cộng điểm và thăng hạng
- Quản lý voucher (miễn phí / đổi điểm, giới hạn số lượng, hạng tối thiểu, tặng hàng loạt), kiểm tra mã voucher
- Quản lý chương trình ưu đãi, hạng thành viên, chi nhánh, cấu hình tích điểm, tài khoản nhân viên (phân quyền Quản lý / Nhân viên)

## Quy tắc tích điểm

- Mỗi hoá đơn: `điểm = floor(số tiền thanh toán / pointPerAmount × hệ số hạng)`. Mặc định 10.000đ = 1 điểm.
- **Điểm hiện có** dùng để đổi voucher. **Điểm tích luỹ** (không bị trừ khi đổi quà) dùng để xét hạng.
- Hạng mẫu: Thành viên (0) → Bạc (500, x1.2) → Vàng (2.000, x1.5) → Kim cương (5.000, x2). Đổi được trên trang quản trị.
- Huỷ hoá đơn sẽ trừ lại điểm đã cộng và trả lại voucher đã dùng.

## Chạy thử trên máy

Yêu cầu Node.js 20 trở lên.

```bash
# 1. Backend
cd backend
cp .env.example .env          # ZALO_MOCK=true để chạy thử không cần Zalo
npm install
npm run db:push && npm run db:seed
npm run dev                   # http://localhost:4000

# 2. Trang quản trị (terminal khác)
cd admin && cp .env.example .env && npm install && npm run dev
# mở http://localhost:5173, đăng nhập admin / admin123

# 3. Mini App (terminal khác)
cd mini-app && cp .env.example .env && npm install && npm run dev
# mở trên trình duyệt ở chế độ mobile; chế độ mock tự đăng nhập bằng tài khoản thử
```

Chạy kiểm thử backend: `cd backend && npm test`.

## Triển khai thật

1. **Đăng ký Mini App** tại <https://mini.zalo.me>, liên kết với Zalo OA của nhà hàng. Xin quyền *Thông tin người dùng* và *Số điện thoại*.
2. **Backend**: chạy trên VPS / cloud có HTTPS.
   - Đổi `provider` trong `backend/prisma/schema.prisma` sang `postgresql` (hoặc `mysql`) và đặt `DATABASE_URL`.
   - Đặt `JWT_SECRET_APP`, `JWT_SECRET_ADMIN` (chuỗi ngẫu nhiên dài), `ZALO_APP_ID`, `ZALO_APP_SECRET_KEY`, `ZALO_MOCK=false`, `NODE_ENV=production`.
   - `CORS_ORIGINS` = domain trang quản trị và domain Mini App (`https://h5.zdn.vn`, `zbrowser://h5.zdn.vn`).
   - `npm run build && npm start`.
   - Đổi mật khẩu tài khoản `admin` ngay sau khi đăng nhập lần đầu.
3. **Trang quản trị**: `npm run build` rồi đưa thư mục `dist/` lên hosting tĩnh (Nginx, Vercel, Netlify...) ở domain riêng.
4. **Mini App**: đặt `VITE_API_URL` là domain backend, rồi `npx zmp login` và `npx zmp deploy`. Thêm domain backend vào danh sách domain được phép trong cài đặt Mini App.
5. (Tuỳ chọn) Đặt `ZALO_OA_ACCESS_TOKEN` để gửi tin nhắn OA khi xác nhận đặt bàn hoặc cộng điểm. Tin tư vấn OA chỉ gửi được cho người đã tương tác với OA gần đây; để thông báo giao dịch ổn định nên đăng ký **ZNS**.

Chi tiết API: [`docs/API.md`](docs/API.md).
