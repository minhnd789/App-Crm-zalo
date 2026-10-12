import { nativeStorage } from "zmp-sdk/apis";
import { isInZalo } from "./env";

/** Lưu trữ key-value: dùng nativeStorage khi chạy trong Zalo, localStorage khi chạy trên trình duyệt */
export const storage = {
  get(key: string): string | null {
    try {
      if (isInZalo()) return nativeStorage.getItem(key) || null;
    } catch {
      /* fallback */
    }
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      if (isInZalo()) {
        nativeStorage.setItem(key, value);
        return;
      }
    } catch {
      /* fallback */
    }
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  },
  remove(key: string) {
    try {
      if (isInZalo()) nativeStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
