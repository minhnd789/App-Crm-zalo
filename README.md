# CRM Nhà hàng trên Zalo Mini App

Hệ thống chăm sóc khách hàng cho chuỗi nhà hàng **nhiều thương hiệu**. Mỗi thương hiệu có Mini App + Zalo OA riêng,
dùng chung 1 backend, 1 database và 1 trang quản trị. Hệ thống gồm 3 phần tách biệt:

| Thư mục | Mô tả | Người dùng |
|---|---|---|
| [`mini-app/`](mini-app) | Zalo Mini App – 1 mã nguồn, build riêng cho từng thương hiệu (`VITE_BRAND`) | Khách hàng |
| [`admin/`](admin) | Trang quản trị web, chạy ở domain riêng (không nằm trong Mini App) | Quản lý, nhân viên |
| [`backend/`](backend) | API + cơ sở dữ liệu dùng chung cho cả hai | — |

```
 Khách hàng (Zalo)                       Nhân viên / Quản lý (trình duyệt)
 ┌────────────────┐ ┌────────────────┐   ┌──────────────────────────┐
 │ Mini App       │ │ Mini App       │   │ Trang quản trị           │
 │ Thương hiệu A  │ │ Thương hiệu B  │   │ (chọn thương hiệu)       │
 │ X-Brand: A     │ │ X-Brand: B     │   │ X-Brand-Id               │
 └───────┬────────┘ └───────┬────────┘   └────────────┬─────────────┘
         └──────────┬───────┘                         │
                    │ /api/app/*                      │ /api/admin/*
                    └─────────────┐       ┌───────────┘
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
- **Hoá đơn & tích điểm**: hoá đơn chỉ đến từ phần mềm bán hàng r_keeper (qua DCorp – kết nối làm sau); trang quản trị xem lịch sử hoá đơn, huỷ để điều chỉnh. Khi đồng bộ, hệ thống tự cộng điểm và xét hạng
- **Xác nhận dùng voucher tại quầy**: nhân viên nhập/kiểm tra mã voucher khách đưa và đánh dấu đã dùng
- Quản lý voucher (miễn phí / đổi điểm, giới hạn số lượng, hạng tối thiểu, tặng hàng loạt), kiểm tra mã voucher
- Quản lý chương trình ưu đãi, hạng thành viên, chi nhánh, cấu hình tích điểm, tài khoản nhân viên (phân quyền Quản lý / Nhân viên)

## Đa thương hiệu & quy tắc tích điểm (phương án C)

| | Dùng chung mọi thương hiệu | Riêng từng thương hiệu |
|---|---|---|
| Khách hàng, SĐT, mã thành viên (QR) | ✅ | |
| **Hạng thành viên** (xét theo tổng chi tiêu ở mọi thương hiệu) | ✅ | |
| **Điểm** (ví điểm), lịch sử điểm | | ✅ |
| Voucher, chương trình ưu đãi, chi nhánh, đặt bàn, hoá đơn | | ✅ |
| Cài đặt tích điểm (tỷ lệ, điểm chào mừng), quy định đặt bàn | | ✅ |
| Mini App, Zalo OA, logo, màu sắc | | ✅ |

- Mỗi hoá đơn: `điểm = floor(số tiền thanh toán / pointPerAmount của thương hiệu × hệ số hạng)`, cộng vào ví của thương hiệu đó. Mặc định 10.000đ = 1 điểm.
- Điểm ở thương hiệu A chỉ đổi được voucher của A; voucher A chỉ dùng tại A.
- Hạng mẫu (theo tổng chi tiêu): Thành viên (0đ, x1) → Bạc (5 triệu, x1.2) → Vàng (20 triệu, x1.5) → Kim cương (50 triệu, x2). Hệ số áp dụng ở mọi thương hiệu.
- Zalo cấp ID khác nhau cho mỗi Mini App, nên khách dùng Mini App thương hiệu thứ hai sẽ được **gộp tự động** vào hồ sơ cũ khi liên kết cùng số điện thoại.
- Huỷ hoá đơn sẽ trừ lại điểm, trừ chi tiêu (có thể tụt hạng) và trả lại voucher đã dùng.
- Tài khoản quản trị: **toàn hệ thống** (quản lý mọi thương hiệu, hạng, thương hiệu) hoặc **gắn 1 thương hiệu** (chỉ thấy dữ liệu thương hiệu đó), mỗi loại có quyền Quản lý / Nhân viên.

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

# 3. Mini App (terminal khác) – VITE_BRAND trong .env chọn thương hiệu (BRAND_A / BRAND_B)
cd mini-app && cp .env.example .env && npm install && npm run dev
# mở trên trình duyệt ở chế độ mobile; chế độ mock tự đăng nhập bằng tài khoản thử
```

Chạy kiểm thử backend: `cd backend && npm test`.

## Triển khai thật

1. **Đăng ký Mini App cho từng thương hiệu** tại <https://mini.zalo.me>, liên kết với Zalo OA của thương hiệu. Xin quyền *Thông tin người dùng* và *Số điện thoại*.
   Trên trang quản trị (mục **Thương hiệu**, tài khoản toàn hệ thống) nhập App ID, Secret Key, OA ID, OA access token cho từng thương hiệu.
2. **Backend**: chạy trên VPS / cloud có HTTPS.
   - Đổi `provider` trong `backend/prisma/schema.prisma` sang `postgresql` (hoặc `mysql`) và đặt `DATABASE_URL`.
   - Đặt `JWT_SECRET_APP`, `JWT_SECRET_ADMIN` (chuỗi ngẫu nhiên dài), `ZALO_MOCK=false`, `NODE_ENV=production`.
   - `CORS_ORIGINS` = domain trang quản trị và domain Mini App (`https://h5.zdn.vn`, `zbrowser://h5.zdn.vn`).
   - `npm run build && npm start`.
   - Đổi mật khẩu tài khoản `admin` ngay sau khi đăng nhập lần đầu.
3. **Trang quản trị**: `npm run build` rồi đưa thư mục `dist/` lên hosting tĩnh (Nginx, Vercel, Netlify...) ở domain riêng.
4. **Mini App**: với mỗi thương hiệu, đặt `VITE_API_URL` (domain backend) và `VITE_BRAND` (mã thương hiệu), rồi deploy lên đúng Mini App ID của thương hiệu đó (xem `mini-app/README.md`). Thêm domain backend vào danh sách domain được phép trong cài đặt Mini App.
5. (Tuỳ chọn) Nhập OA access token của thương hiệu để gửi tin nhắn OA khi xác nhận đặt bàn hoặc cộng điểm. Tin tư vấn OA chỉ gửi được cho người đã tương tác với OA gần đây; để thông báo giao dịch ổn định nên đăng ký **ZNS**.

## Kết nối phần mềm bán hàng (r_keeper) – dự kiến

Hoá đơn đã có sẵn trường `source` (`ADMIN` / `POS`) và `externalId` (mã hoá đơn bên POS, chống đồng bộ trùng)
để sau này thêm API nhận hoá đơn từ r_keeper (qua DCorp) mà không phải đổi cấu trúc dữ liệu.

Chi tiết API: [`docs/API.md`](docs/API.md).
