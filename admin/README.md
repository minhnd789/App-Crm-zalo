# Trang quản trị CRM nhà hàng

Trang web quản trị (dành cho quản lý và nhân viên nhà hàng), tách riêng với Zalo Mini App của khách hàng.
Gọi API `/api/admin` của backend trong thư mục `backend/`.

**Công nghệ:** Vite + React 18 + TypeScript, Ant Design 5 (tiếng Việt), React Router, Recharts, html5-qrcode (quét QR thành viên bằng camera).

## Chức năng

| Trang | Đường dẫn | Ghi chú |
|---|---|---|
| Đăng nhập | `/login` | |
| Tổng quan | `/` | Số liệu, biểu đồ doanh thu 30 ngày, phân bố hạng, lịch đặt bàn sắp tới, hoá đơn gần đây |
| Tạo hoá đơn & tích điểm | `/orders/new` | Tìm khách theo SĐT / mã thành viên / quét QR → nhập món hoặc tổng tiền, giảm giá, voucher → cộng điểm |
| Khách hàng | `/customers`, `/customers/:id` | Tìm kiếm, lọc hạng, sửa thông tin, cộng/trừ điểm (Quản lý), tặng voucher |
| Đặt bàn | `/bookings` | Lọc theo ngày/trạng thái/chi nhánh, xác nhận, khách đến, không đến, huỷ, tạo hoá đơn từ lịch |
| Hoá đơn | `/orders` | Danh sách + tổng doanh thu/điểm, chi tiết, huỷ hoá đơn (Quản lý – tự trừ lại điểm) |
| Voucher | `/vouchers`, `/vouchers/:id` | Tạo/sửa (Quản lý), tặng hàng loạt, kiểm tra mã voucher |
| Chương trình ưu đãi | `/promotions` | Bài viết/banner hiển thị trên Mini App |
| Hạng thành viên | `/tiers` | Mức điểm, hệ số nhân điểm, màu, quyền lợi |
| Chi nhánh | `/branches` | Giờ mở cửa, ảnh, bật/tắt |
| Cài đặt | `/settings` | Chỉ Quản lý |
| Tài khoản quản trị | `/admins` | Chỉ Quản lý |

Phân quyền: **Quản lý (ADMIN)** toàn quyền. **Nhân viên (STAFF)** tạo hoá đơn, xử lý đặt bàn, tặng voucher cho từng khách,
xem dữ liệu; các nút chỉ dành cho Quản lý sẽ bị ẩn.

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

Tài khoản mặc định do seed backend tạo: `admin` / `admin123` (đổi ngay sau khi đăng nhập: menu tên người dùng → Đổi mật khẩu).

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

   (nhiều origin phân tách bằng dấu phẩy, ví dụ thêm origin của Mini App) rồi khởi động lại backend.

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

- Quét QR bằng camera chỉ hoạt động trên **HTTPS** (hoặc `localhost`). Luôn có ô nhập SĐT / mã thành viên thủ công.
- Phiên đăng nhập quản trị hết hạn sau 12 giờ; khi hết hạn trang tự chuyển về màn đăng nhập.
- Ảnh tải lên (voucher, chương trình, chi nhánh) được lưu ở backend (`/uploads`). Nếu backend chạy sau reverse proxy HTTPS,
  cần cấu hình để URL ảnh trả về đúng giao thức `https`.

## Cấu trúc thư mục

```
src/
  api/          client.ts (fetch + token, tự đăng xuất khi 401), types.ts
  auth/         AuthContext, RequireAuth/RequireManager, isManager
  layouts/      AdminLayout (menu bên trái, đổi mật khẩu, đăng xuất)
  components/   StatusTag, TierTag, ImageUpload, OrderDrawer, QrScanModal, ...
  hooks/        useRequest, useTiers/useBranches
  pages/        các trang theo bảng ở trên
  utils/        format.ts (tiền 1.234.000đ, ngày DD/MM/YYYY HH:mm), voucher.ts
```
