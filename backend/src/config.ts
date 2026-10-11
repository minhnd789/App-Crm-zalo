import 'dotenv/config';

const bool = (v: string | undefined, def = false) => (v === undefined || v === '' ? def : ['1', 'true', 'yes'].includes(v.toLowerCase()));

export const config = {
  port: Number(process.env.PORT ?? 4000),
  jwtSecretApp: process.env.JWT_SECRET_APP ?? 'dev-app-secret',
  jwtSecretAdmin: process.env.JWT_SECRET_ADMIN ?? 'dev-admin-secret',
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  zalo: {
    // App ID, Secret Key, OA token cấu hình theo từng thương hiệu trên trang quản trị
    mock: bool(process.env.ZALO_MOCK, false),
  },
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
};

if (process.env.NODE_ENV === 'production') {
  if (config.jwtSecretApp.startsWith('dev-') || config.jwtSecretAdmin.startsWith('dev-')) {
    throw new Error('Phải đặt JWT_SECRET_APP và JWT_SECRET_ADMIN khi chạy production');
  }
  if (config.zalo.mock) {
    throw new Error('Không được bật ZALO_MOCK khi chạy production');
  }
}
