import { BRAND, shade, withAlpha } from "./color";

const isHex = (c: string | null | undefined): c is string => !!c && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.trim());

/**
 * Áp màu chủ đạo của thương hiệu (brand.primaryColor từ /config) cho toàn app
 * bằng cách ghi đè các biến CSS --brand-* (zmp-ui cũng đọc qua các biến này).
 */
export function applyBrandTheme(color: string | null | undefined) {
  const c = isHex(color) ? color.trim() : BRAND;
  const root = document.documentElement.style;
  root.setProperty("--brand", c);
  root.setProperty("--brand-400", shade(c, 0.18));
  root.setProperty("--brand-600", shade(c, -0.2));
  root.setProperty("--brand-700", shade(c, -0.38));
  root.setProperty("--brand-50", shade(c, 0.94));
  root.setProperty("--brand-100", shade(c, 0.86));
  root.setProperty("--brand-200", shade(c, 0.72));
  root.setProperty("--brand-shadow", withAlpha(c, 0.3));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", c);
}

/** Đặt tiêu đề tab trình duyệt theo tên thương hiệu */
export function applyBrandTitle(name: string | null | undefined) {
  if (name) document.title = name;
}
