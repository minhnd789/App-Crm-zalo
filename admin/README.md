# Trang quản trị CRM nhà hàng

Trang web quản trị (dành cho quản lý và nhân viên nhà hàng), tách riêng với Zalo Mini App của khách hàng.
Gọi API `/api/admin` của backend trong thư mục `backend/`. Một trang quản trị dùng cho **nhiều thương hiệu**
(mỗi thương hiệu có Zalo Mini App + OA riêng, chung 1 backend/CSDL).

## Quản trị trung tâm nhiều thương hiệu

- **Bộ lọc thương hiệu** ở thanh trên cùng: mặc định **"Tất cả thương hiệu"** (không gửi header) hoặc chọn 1 thương hiệu
  (gửi `X-Brand-Id`). Lựa chọn được lưu trong trình duyệt; đổi bộ lọc sẽ tải lại trang đang xem. Ở chế độ tất cả,
  các bảng có thêm cột **Thương hiệu** (chấm màu).
- **Cơ sở** = nhà hàng của từng thương hiệu, đặt tên theo vị trí (VD "Quận 1") và luôn hiển thị kèm thương hiệu:
  "Nhà hàng Ngon · Quận 1". Tổng quan, đặt bàn, hoá đơn, khách hàng có bộ lọc **Cơ sở** (nhóm theo thương hiệu).
- Tạo mới voucher / chương trình ưu đãi / cơ sở / cộng-trừ điểm khi đang xem tất cả → form yêu cầu **chọn thương hiệu**.
  Trang Cài đặt có ô chọn thương hiệu cần cấu hình.
- **Tài khoản gắn thương hiệu** chỉ thấy thương hiệu của mình (hiện cố định, không có ô chọn).
- **Quản trị toàn hệ thống** (vai trò Quản lý, không gắn thương hiệu) quản lý *Thương hiệu* và *Hạng thành viên*.
- **Khách hàng** dùng chung (nhận diện theo SĐT / mã thành viên). Khách đăng ký thành viên trên Mini App của từng
  thương hiệu với ngày sinh và **cơ sở hay đến** → lọc theo cơ sở đăng ký, trạng thái đăng ký, tháng sinh
  ("Sinh nhật tháng này"), hạng. Điểm nằm trong **ví riêng từng thương hiệu**; hạng dùng chung theo tổng chi tiêu.
- **Hoá đơn chỉ đến từ phần mềm bán hàng (r_keeper qua DCorp)** – trang quản trị không tạo hoá đơn; chỉ xem lịch sử
  (nguồn POS, mã bill r_keeper) và Quản lý có thể huỷ hoá đơn sai để hoàn điểm. Xem `docs/POS-INTEGRATION.md`.
- **Kết nối r_keeper** (trang *Thương hiệu* → "Kết nối phần mềm bán hàng"): bật kết nối, Webhook URL của connector,
  Webhook secret (chỉ ghi) và **API key POS** – bấm "Tạo API key mới", key chỉ hiển thị 1 lần để gửi cho DCorp
  (key cũ ngừng hoạt động). Mỗi cơ sở khai báo **Mã POS** (mã nhà hàng bên r_keeper).
- **Đồng bộ POS** (`/pos-sync`): nhật ký gửi khách sang POS / nhận bill từ POS, đếm theo trạng thái (Chờ gửi, Thành công,
  Lỗi, Chưa khớp, Bỏ qua), xem dữ liệu gửi/nhận; Quản lý có thể *Gửi lại*, *Xử lý lại* hoặc *Gán khách & xử lý* cho bill
  chưa khớp khách. Chi tiết khách có cột Mã khách r_keeper và thời điểm đồng bộ.
- **Voucher tại quầy**: dùng công cụ *Kiểm tra mã voucher* → *Xác nhận sử dụng* để đánh dấu voucher đã dùng.

## Chức năng

| Trang | Đường dẫn | Ghi chú |
|---|---|---|
| Đăng nhập | `/login` | |
| Tổng quan | `/` | Số liệu theo bộ lọc thương hiệu/cơ sở, doanh thu tháng theo thương hiệu và theo cơ sở, doanh thu 30 ngày, phân bố hạng, lịch đặt bàn sắp tới, hoá đơn gần đây |
| Khách hàng | `/customers`, `/customers/:id` | Lọc cơ sở đăng ký, đã/chưa đăng ký, tháng sinh, hạng; ví điểm từng thương hiệu (cơ sở & ngày đăng ký), Mini App đã dùng; cộng/trừ điểm ví (Quản lý), tặng voucher |
| Đặt bàn | `/bookings` | Lọc theo ngày/trạng thái/cơ sở; xác nhận, khách đã đến, không đến, huỷ, hoàn thành |
| Hoá đơn | `/orders` | Lịch sử hoá đơn đồng bộ từ POS (nguồn, mã HĐ POS) + tổng doanh thu/điểm, chi tiết, huỷ hoá đơn (Quản lý – tự trừ lại điểm) |
| Voucher | `/vouchers`, `/vouchers/:id` | Tạo/sửa (Quản lý), tặng hàng loạt theo hạng / cơ sở đăng ký / chọn khách, kiểm tra mã & xác nhận sử dụng tại quầy |
| Chương trình ưu đãi | `/promotions` | Bài viết/banner hiển thị trên Mini App |
| Hạng thành viên | `/tiers` | Dùng chung: mức chi tiêu tối thiểu, hệ số nhân điểm, màu, quyền lợi (chỉ quản trị toàn hệ thống sửa) |
| Cơ sở | `/branches` | Nhóm theo thương hiệu, Mã POS (r_keeper), số thành viên đăng ký, giờ mở cửa, ảnh, bật/tắt |
| Đồng bộ POS | `/pos-sync` | Nhật ký đồng bộ r_keeper, gửi lại / xử lý lại / gán khách cho bill chưa khớp (Quản lý) |
| Thương hiệu | `/brands` | Chỉ quản trị toàn hệ thống: tên, mã, logo, màu, hotline, giới thiệu, Zalo App/OA ID, secret key & OA token (chỉ ghi) |
| Cài đặt | `/settings` | Quản lý: cài đặt tích điểm & đặt bàn của thương hiệu |
| Tài khoản quản trị | `/admins` | Quản lý: quản trị toàn hệ thống gán tài khoản cho thương hiệu; quản lý thương hiệu chỉ tạo/sửa tài khoản trong thương hiệu mình |

Phân quyền: **Quản lý (ADMIN)** toàn quyền trong phạm vi của mình (toàn hệ thống hoặc 1 thương hiệu).
**Nhân viên (STAFF)** xử lý đặt bàn, xác nhận dùng voucher, tặng voucher cho từng khách, xem dữ liệu; các nút không có quyền sẽ bị ẩn.

## Cấu hình

Sao chép `.env.example` thành `.env`:

```bash
cp .env.example .env
```

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `VITE_API_URL` | `http://localhost:4000` | Địa chỉ backend (không có `/` ở cuối). Giá trị được nhúng vào bản build, đổi thì phải build lại. |

## Chạy khi phát triển

Yêu cầu Node.js ≥ 18 (khuyến nghị 22) và backend đang chạy (xem `backend/README`).

```bash
npm install
npm run dev          # http://localhost:5173
```

Tài khoản mặc định do seed backend tạo: `admin` / `admin123` – quản trị toàn hệ thống (đổi mật khẩu ngay sau khi đăng nhập:
menu tên người dùng → Đổi mật khẩu). Tạo tài khoản cho từng thương hiệu ở trang *Tài khoản quản trị*.

Các lệnh khác:

```bash
npm run typecheck    # kiểm tra kiểu TypeScript
npm run build        # build ra thư mục dist/
npm run preview      # xem thử bản build tại http://localhost:5173
```

## Triển khai (site tĩnh trên tên miền riêng)

Bản build là các file tĩnh trong `dist/`, có thể đặt trên bất kỳ máy chủ web/CDN nào. Ví dụ trang quản trị chạy ở
`https://admin.nhahang.vn`, backend ở `https://api.nhahang.vn`.

1. Build với địa chỉ backend thật:

   ```bash
   VITE_API_URL=https://api.nhahang.vn npm run build
   ```

2. **Cho phép tên miền trang quản trị gọi API**: trong `.env` của backend đặt

   ```env
   CORS_ORIGINS=https://admin.nhahang.vn
   ```

   (nhiều origin phân tách bằng dấu phẩy, ví dụ thêm origin của Mini App các thương hiệu) rồi khởi động lại backend.
   Backend cần cho phép header `X-Brand-Id` trong CORS (thư viện `cors` mặc định phản hồi theo header client yêu cầu).
   Chỉ cần **một** trang quản trị cho mọi thương hiệu.

3. Vì dùng định tuyến phía trình duyệt (React Router), máy chủ web phải trả về `index.html` cho mọi đường dẫn không phải file.

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name admin.nhahang.vn;
    # ssl_certificate ...; ssl_certificate_key ...;

    root /var/www/crm-admin/dist;
    index index.html;

    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
}
```

Chép nội dung `dist/` lên máy chủ: `rsync -av --delete dist/ user@server:/var/www/crm-admin/dist/`.

### Vercel / Netlify / Cloudflare Pages

- Thư mục gốc dự án: `admin`
- Lệnh build: `npm run build`, thư mục xuất bản: `dist`
- Biến môi trường: `VITE_API_URL=https://api.nhahang.vn`
- Cấu hình chuyển mọi đường dẫn về `index.html`:
  - Vercel: tạo `vercel.json` với `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
  - Netlify: tạo `public/_redirects` với dòng `/*  /index.html  200`
  - Cloudflare Pages: tự xử lý SPA, không cần cấu hình thêm.

### Lưu ý

- Phiên đăng nhập quản trị hết hạn sau 12 giờ; khi hết hạn trang tự chuyển về màn đăng nhập.
- Ảnh tải lên (voucher, chương trình, cơ sở) được lưu ở backend (`/uploads`). Nếu backend chạy sau reverse proxy HTTPS,
  cần cấu hình để URL ảnh trả về đúng giao thức `https`.

## Cấu trúc thư mục

```
src/
  api/          client.ts (fetch + token + X-Brand-Id, tự đăng xuất khi 401), types.ts
  auth/         AuthContext (admin + thương hiệu đang chọn), RequireAuth/RequireManager/RequireSuperAdmin, isManager/isSuperAdmin
  layouts/      AdminLayout (menu bên trái, đổi mật khẩu, đăng xuất)
  components/   StatusTag, TierTag, BrandBadge (BrandTag, BranchSelect, BrandSelect, LocationText), ImageUpload, OrderDrawer, ...
  hooks/        useRequest, useTiers/useBranches
  pages/        các trang theo bảng ở trên
  utils/        format.ts (tiền 1.234.000đ, ngày DD/MM/YYYY HH:mm), voucher.ts
```
