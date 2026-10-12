import { config } from './config.js';
import { createApp } from './app.js';
import { startPosWorker } from './services/pos.js';

createApp().listen(config.port, () => {
  console.log(`API đang chạy tại http://localhost:${config.port}`);
  if (config.zalo.mock) console.warn('⚠ ZALO_MOCK đang bật – chỉ dùng cho môi trường dev');
});

// Gửi khách hàng mới sang phần mềm bán hàng (r_keeper) theo hàng đợi, tự gửi lại khi lỗi
startPosWorker();
