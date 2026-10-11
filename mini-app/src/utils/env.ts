/** Biến môi trường & nhận biết môi trường chạy */

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/+$/, "");

/** Mã thương hiệu của bản build này (VITE_BRAND), gửi kèm mọi request qua header X-Brand */
export const BRAND_CODE: string = (import.meta.env.VITE_BRAND || "BRAND_A").trim();

/** OA ID dự phòng khi thương hiệu chưa cấu hình zaloOaId trên trang quản trị */
export const FALLBACK_OA_ID: string = import.meta.env.VITE_ZALO_OA_ID || "";

/** Khoá lưu trữ riêng theo thương hiệu để 2 Mini App không dùng chung token */
export function brandKey(key: string): string {
  return `${key}:${BRAND_CODE}`;
}

/** Đang chạy bên trong ứng dụng Zalo (Mini App runtime)? */
export function isInZalo(): boolean {
  if (typeof window === "undefined") return false;
  // Lưu ý: zmp-sdk tự tạo window.zaloJSV2 cả trên trình duyệt thường nên không dùng được để nhận biết.
  // ZJSBridge do ứng dụng Zalo native chèn vào; user agent của webview Zalo chứa "Zalo".
  const w = window as unknown as { ZJSBridge?: unknown };
  return !!w.ZJSBridge || /zalo/i.test(navigator.userAgent);
}

/** Chế độ giả lập: bật bằng VITE_ZALO_MOCK=true hoặc khi chạy ngoài Zalo (trình duyệt thường) */
export function isMockMode(): boolean {
  return import.meta.env.VITE_ZALO_MOCK === "true" || !isInZalo();
}
