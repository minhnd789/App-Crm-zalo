# Zalo Mini App – Thành viên nhà hàng

Ứng dụng Zalo Mini App dành cho khách hàng của hệ thống CRM nhà hàng: thẻ thành viên & mã QR tích điểm, ưu đãi, nhận/đổi voucher, đặt bàn, ví voucher, lịch sử tích điểm và lịch sử ăn uống.

Công nghệ: Vite + React 18 + TypeScript, [ZaUI (`zmp-ui`)](https://mini.zalo.me/docs/zaui/), [`zmp-sdk`](https://mini.zalo.me/docs/api/), `zmp-vite-plugin`, `qrcode.react`, `dayjs`.

## Cấu trúc thư mục

```
mini-app/
├── app-config.json        # Cấu hình Mini App (tiêu đề, màu header, status bar…)
├── zmp-cli.json           # Đánh dấu dự án ZMP cho zmp-cli
├── index.html
├── vite.config.ts         # dùng zmpVitePlugin(), build ra thư mục www/
├── .env.example
└── src/
    ├── app.ts             # điểm vào
    ├── api/               # fetch client + endpoint có kiểu + kiểu dữ liệu
    ├── hooks/             # useAuth, useAppData, useRequest, usePaginated, useNotify
    ├── components/        # layout (App, ZMPRouter, AnimationRoutes, BottomNavigation…), thẻ thành viên, voucher…
    ├── pages/             # các màn hình
    ├── utils/             # format tiền/ngày, khung giờ đặt bàn, wrapper zmp-sdk, storage
    └── css/app.css
```

## Biến môi trường

Sao chép `.env.example` thành `.env` rồi chỉnh:

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `VITE_API_URL` | `http://localhost:4000` | Địa chỉ backend (không có `/` ở cuối). Khi deploy phải là HTTPS và domain phải được khai báo trong cài đặt Mini App. |
| `VITE_ZALO_MOCK` | `true` | `true` = đăng nhập giả lập bằng `mockZaloId` (backend phải bật `ZALO_MOCK=true`). Khi chạy ngoài Zalo (trình duyệt thường), app luôn tự chuyển sang giả lập. **Đặt `false` khi build bản thật.** |
| `VITE_ZALO_OA_ID` | (trống) | ID Official Account của nhà hàng, dùng cho nút "Quan tâm OA" và "Chat với nhà hàng". |

## Chạy thử trên trình duyệt (chế độ giả lập)

```bash
# 1. Chạy backend với ZALO_MOCK=true (xem thư mục backend/)
# 2. Chạy Mini App
cd mini-app
npm install
cp .env.example .env
npm run dev            # http://localhost:3000
```

Mở `http://localhost:3000` (nên bật chế độ thiết bị di động trong DevTools, ví dụ 390×844).

- App tự tạo một `mockZaloId` ngẫu nhiên và lưu trong `localStorage`, nên mỗi trình duyệt là một "khách hàng".
- Muốn đăng nhập vào một khách cụ thể: thêm `?mockZaloId=dev-1` vào URL.
- "Liên kết số điện thoại" sẽ mở hộp thoại nhập số thay cho quyền số điện thoại của Zalo.
- "Quan tâm OA" chỉ cập nhật trạng thái trên backend (không gọi Zalo).

Các lệnh khác:

```bash
npm run typecheck      # tsc --noEmit
npm run build          # kiểm tra kiểu + build ra www/
npm start              # zmp start – chạy giả lập Zalo của zmp-cli
```

## Đăng ký Mini App trên Zalo

1. Đăng nhập [mini.zalo.me](https://mini.zalo.me) bằng tài khoản Zalo, tạo **Zalo App** (hoặc chọn app có sẵn) → **Tạo Mini App**. Ghi lại **App ID**.
2. Trong **Cài đặt** của Mini App:
   - Thêm domain backend (ví dụ `https://api.nhahang.vn`) vào danh sách domain được phép gọi API.
   - Liên kết **Official Account** của nhà hàng với Zalo App (mục *Official Account*). Lấy OA ID điền vào `VITE_ZALO_OA_ID`.
3. **Xin quyền** ở mục *Quyền truy cập / Permissions* và gửi duyệt:
   - `Thông tin người dùng` (tên, ảnh đại diện – `scope.userInfo`): dùng cho `getUserInfo({ autoRequestPermission: true })`.
   - `Số điện thoại` (`scope.userPhonenumber`): dùng cho `getPhoneNumber()`; backend đổi `token` lấy số điện thoại qua Zalo Open API (cần `ZALO_APP_ID`/secret key cấu hình ở backend).
   - (Tuỳ chọn) quyền theo dõi/nhắn tin OA nếu muốn gửi thông báo xác nhận đặt bàn.
4. Ở backend đặt `ZALO_MOCK=false` và cấu hình các khoá Zalo theo `backend/.env.example`.

## Deploy bằng zmp-cli

```bash
cd mini-app
# Bản thật: VITE_ZALO_MOCK=false, VITE_API_URL=https://..., VITE_ZALO_OA_ID=...
npx zmp login          # quét QR bằng Zalo để đăng nhập
npx zmp deploy         # chọn "Deploy your existing project", thư mục build: www
```

`zmp deploy` sẽ build (Vite + `zmp-vite-plugin` sinh `www/app-config.json`) rồi tải lên. Sau đó vào mini.zalo.me để chuyển phiên bản sang **Testing** (quét QR để thử trên điện thoại) và **Gửi duyệt** để phát hành.

Lưu ý: khi build production, `ZMPRouter` dùng basename `/zapps/<APP_ID>`, vì vậy thư mục `www/` chỉ chạy đúng trong môi trường Zalo, không mở trực tiếp bằng trình duyệt.

## Luồng đăng nhập

- **Giả lập**: `POST /api/app/auth/login { mockZaloId, name }`.
- **Thật**: `getUserInfo({ autoRequestPermission: true })` (tên, avatar, `idByOA`, `followedOA`) + `getAccessToken()` → `POST /api/app/auth/login { accessToken, name, avatar, idByOA, followedOA }`.
- Token được giữ trong bộ nhớ và lưu `nativeStorage` (trong Zalo) / `localStorage` (trình duyệt). Khi API trả 401, app tự đăng nhập lại và thử lại request.
