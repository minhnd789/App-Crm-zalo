import { config } from './config.js';
import { createApp } from './app.js';

createApp().listen(config.port, () => {
  console.log(`API đang chạy tại http://localhost:${config.port}`);
  if (config.zalo.mock) console.warn('⚠ ZALO_MOCK đang bật – chỉ dùng cho môi trường dev');
});
