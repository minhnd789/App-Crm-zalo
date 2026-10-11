# Zalo Mini App – Thành viên nhà hàng

Ứng dụng Zalo Mini App dành cho khách hàng của hệ thống CRM nhà hàng: thẻ thành viên & mã QR tích điểm, ưu đãi, nhận/đổi voucher, đặt bàn, ví voucher, lịch sử tích điểm và lịch sử ăn uống.

Hệ thống hỗ trợ **nhiều thương hiệu** dùng chung 1 backend: mỗi thương hiệu là **1 Zalo Mini App + 1 OA riêng**, build từ cùng mã nguồn này với biến `VITE_BRAND` khác nhau (xem [Đa thương hiệu](#đa-thương-hiệu-mỗi-thương-hiệu-1-mini-app)).

Công nghệ: Vite + React 18 + TypeScript, [ZaUI (`zmp-ui`)](https://mini.zalo.me/docs/zaui/), [`zmp-sdk`](https://mini.zalo.me/docs/api/), `zmp-vite-plugin`, `qrcode.react`, `dayjs`.

## Cấu trúc thư mục

```
mini-app/
├── app-config.json        # Cấu hình Mini App (tiêu đề, màu header, status bar…)
├── zmp-cli.json           # Đánh dấu dự án ZMP cho zmp-cli
├── index.html
├── vite.config.ts         # dùng zmpVitePlugin(), build ra thư mục www/
├── .env.example
├── .env.brand_a / .env.brand_b   # cấu hình build cho từng thương hiệu
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
| `VITE_BRAND` | (bắt buộc khi build) | Mã thương hiệu, vd `BRAND_A`. Gửi ở header `X-Brand` của **mọi** request. Token & mockZaloId được lưu theo khoá riêng của thương hiệu. |
| `VITE_API_URL` | `http://localhost:4000` | Địa chỉ backend (không có `/` ở cuối). Khi deploy phải là HTTPS và domain phải được khai báo trong cài đặt Mini App. |
| `VITE_ZALO_MOCK` | `true` | `true` = đăng nhập giả lập bằng `mockZaloId` (backend phải bật `ZALO_MOCK=true`). Khi chạy ngoài Zalo (trình duyệt thường), app luôn tự chuyển sang giả lập. **Đặt `false` khi build bản thật.** |
| `VITE_ZALO_OA_ID` | (trống) | OA dự phòng. Mặc định app dùng `brand.zaloOaId` từ `/config` (cấu hình trên trang quản trị). |
| `VITE_APP_TITLE`, `VITE_HEADER_COLOR` | (trống) | Ghi đè `title`/`headerTitle`/`headerColor` của `app-config.json` khi build. Màu phải đặt trong ngoặc kép: `"#B91C1C"`. |

Tên, logo, hotline, giới thiệu và **màu chủ đạo** của thương hiệu được lấy lúc chạy từ `GET /api/app/config` (`brand.*`) và áp vào biến CSS `--brand-*`, nên đổi trên trang quản trị là app cập nhật, không cần build lại.

## Chạy thử trên trình duyệt (chế độ giả lập)

```bash
# 1. Chạy backend với ZALO_MOCK=true (xem thư mục backend/)
# 2. Chạy Mini App
cd mini-app
npm install
npm run dev:brand_a    # http://localhost:3000 – Mini App "BRAND_A" (đọc .env.brand_a)
npm run dev:brand_b    # hoặc thương hiệu B
# hoặc: cp .env.example .env && npm run dev
```

Mở `http://localhost:3000` (nên bật chế độ thiết bị di động trong DevTools, ví dụ 390×844).

- App tự tạo một `mockZaloId` ngẫu nhiên và lưu trong `localStorage`, nên mỗi trình duyệt là một "khách hàng".
- Muốn đăng nhập vào một khách cụ thể: thêm `?mockZaloId=dev-1` vào URL. Mỗi thương hiệu lưu mockZaloId/token riêng, giống thực tế Zalo cấp user ID khác nhau cho từng Mini App.
- Thử gộp tài khoản: đăng nhập ở thương hiệu A, liên kết SĐT; sang thương hiệu B (user khác), liên kết **cùng SĐT** → backend gộp 2 hồ sơ, app nhận `merged: true` + token mới và báo "điểm và hạng đã được gộp".
- "Liên kết số điện thoại" sẽ mở hộp thoại nhập số thay cho quyền số điện thoại của Zalo.
- "Quan tâm OA" chỉ cập nhật trạng thái trên backend (không gọi Zalo).

Các lệnh khác:

```bash
npm run typecheck      # tsc --noEmit
npm run build:brand_a  # kiểm tra kiểu + build ra www/ cho thương hiệu A
npm run build          # build theo .env (báo lỗi nếu thiếu VITE_BRAND)
npm start              # zmp start – chạy giả lập Zalo của zmp-cli
```

## Đa thương hiệu: mỗi thương hiệu 1 Mini App

| | Thương hiệu A | Thương hiệu B |
|---|---|---|
| Mini App (mini.zalo.me) | App ID riêng | App ID riêng |
| Official Account | OA riêng (`brand.zaloOaId`) | OA riêng |
| File cấu hình build | `.env.brand_a` | `.env.brand_b` |
| Lệnh build | `npm run build:brand_a` | `npm run build:brand_b` |

Thêm thương hiệu mới: tạo thương hiệu trên trang quản trị (mã, tên, logo, màu, OA ID, Zalo App ID/secret), tạo file `.env.<mode>` với `VITE_BRAND=<mã>`, thêm script `build:<mode>` = `tsc --noEmit && vite build --mode <mode>`.

Khách hàng là **1 người trên toàn hệ thống**: hạng dùng chung, xét theo tổng chi tiêu ở mọi thương hiệu; **điểm và voucher riêng theo thương hiệu** (màn Tài khoản hiển thị "Điểm tại thương hiệu khác").

## Đăng ký Mini App trên Zalo

Làm các bước dưới đây **cho từng thương hiệu**.

1. Đăng nhập [mini.zalo.me](https://mini.zalo.me) bằng tài khoản Zalo, tạo **Zalo App** (hoặc chọn app có sẵn) → **Tạo Mini App**. Ghi lại **App ID**.
2. Trong **Cài đặt** của Mini App:
   - Thêm domain backend (ví dụ `https://api.nhahang.vn`) vào danh sách domain được phép gọi API.
   - Liên kết **Official Account** của nhà hàng với Zalo App (mục *Official Account*). Khai báo OA ID (và Zalo App ID/secret key) cho thương hiệu trên trang quản trị.
3. **Xin quyền** ở mục *Quyền truy cập / Permissions* và gửi duyệt:
   - `Thông tin người dùng` (tên, ảnh đại diện – `scope.userInfo`): dùng cho `getUserInfo({ autoRequestPermission: true })`.
   - `Số điện thoại` (`scope.userPhonenumber`): dùng cho `getPhoneNumber()`; backend đổi `token` lấy số điện thoại qua Zalo Open API (cần `ZALO_APP_ID`/secret key cấu hình ở backend).
   - (Tuỳ chọn) quyền theo dõi/nhắn tin OA nếu muốn gửi thông báo xác nhận đặt bàn.
4. Ở backend đặt `ZALO_MOCK=false` và cấu hình các khoá Zalo theo `backend/.env.example`.

## Deploy bằng zmp-cli

```bash
cd mini-app
# Bản thật: VITE_ZALO_MOCK=false, VITE_API_URL=https://..., VITE_ZALO_OA_ID=...
npx zmp login                         # quét QR bằng Zalo để đăng nhập (1 lần)

# Thương hiệu A
npm run build:brand_a                 # build ra www/ với VITE_BRAND=BRAND_A
APP_ID=<app-id-mini-app-A> npx zmp deploy   # chọn "Deploy your existing project", thư mục: www

# Thương hiệu B
npm run build:brand_b
APP_ID=<app-id-mini-app-B> npx zmp deploy
```

`zmp-cli` đọc App ID từ biến môi trường `APP_ID` (hoặc file `.env` ở thư mục gốc). Luôn build lại trước khi deploy thương hiệu khác vì `www/` bị ghi đè. `zmp-vite-plugin` sinh `www/app-config.json` (title/headerColor lấy từ `VITE_APP_TITLE`/`VITE_HEADER_COLOR` nếu có). Sau đó vào mini.zalo.me để chuyển phiên bản sang **Testing** (quét QR để thử trên điện thoại) và **Gửi duyệt** để phát hành.

Lưu ý: khi build production, `ZMPRouter` dùng basename `/zapps/<APP_ID>`, vì vậy thư mục `www/` chỉ chạy đúng trong môi trường Zalo, không mở trực tiếp bằng trình duyệt.

## Đăng ký thành viên

Đăng nhập Zalo chỉ tạo tài khoản; khách phải **đăng ký thành viên** cho từng thương hiệu (trang `/register`) mới được tặng điểm chào mừng, đặt bàn và nhận/đổi voucher (backend trả 403 nếu chưa đăng ký).

- Khai báo: họ tên (lấy sẵn từ Zalo, sửa được), số điện thoại theo Zalo (nút "Lấy số điện thoại từ Zalo" → `getPhoneNumber()`; chế độ giả lập: ô nhập số), ngày sinh, **cơ sở hay đến** (dùng để phân loại khách, đặt bàn mặc định chọn cơ sở này).
- `POST /me/register` → nếu SĐT đã là thành viên (vd đã đăng ký ở thương hiệu khác) thì backend gộp tài khoản, app thay token mới.
- Khách chưa đăng ký: app tự mở trang đăng ký 1 lần mỗi lần mở app (có nút "Để sau"); thẻ thành viên ở trang chủ hiện nút "Đăng ký thành viên"; vào Đặt bàn hoặc bấm nhận/đổi voucher sẽ chuyển sang trang đăng ký rồi quay lại.
- Đổi cơ sở hay đến: Tài khoản → Cơ sở hay đến (`PUT /me/home-branch`).

## Luồng đăng nhập

- Mọi request gửi header `X-Brand: <VITE_BRAND>`.
- **Giả lập**: `POST /api/app/auth/login { mockZaloId, name }`.
- **Thật**: `getUserInfo({ autoRequestPermission: true })` (tên, avatar, `idByOA`, `followedOA`) + `getAccessToken()` → `POST /api/app/auth/login { accessToken, name, avatar, idByOA, followedOA }`.
- Token được giữ trong bộ nhớ và lưu `nativeStorage` (trong Zalo) / `localStorage` (trình duyệt) với khoá `crm_token:<MÃ_THƯƠNG_HIỆU>`. Khi API trả 401, app tự đăng nhập lại và thử lại request.
- Liên kết SĐT (`POST /me/phone`): nếu SĐT đã thuộc thành viên khác, backend gộp tài khoản và trả `merged: true` + `token` mới → app thay token đã lưu và tải lại thông tin thành viên.
