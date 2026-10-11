/** Biến môi trường & nhận biết môi trường chạy */

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/+$/, "");

export const OA_ID: string = import.meta.env.VITE_ZALO_OA_ID || "";

/** Đang chạy bên trong ứng dụng Zalo (Mini App runtime)? */
export function isInZalo(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { ZJSBridge?: unknown; zaloJSV2?: unknown };
  if (w.ZJSBridge || w.zaloJSV2) return true;
  return /zalo/i.test(navigator.userAgent);
}

/** Chế độ giả lập: bật bằng VITE_ZALO_MOCK=true hoặc khi chạy ngoài Zalo (trình duyệt thường) */
export function isMockMode(): boolean {
  return import.meta.env.VITE_ZALO_MOCK === "true" || !isInZalo();
}
