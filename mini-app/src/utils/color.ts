/** Tiện ích màu cho thẻ hạng thành viên */

function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().replace(/^#/, "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function toHex(rgb: number[]) {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
}

/** amount > 0 làm sáng, < 0 làm tối (-1..1) */
export function shade(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return toHex(rgb.map((c) => (amount >= 0 ? c + (255 - c) * amount : c * (1 + amount))));
}

export function withAlpha(hex: string, alpha: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export const BRAND = "#C2410C";

/** Nền gradient cho thẻ thành viên theo màu hạng */
export function tierGradient(color: string | null | undefined): string {
  const c = color && parseHex(color) ? color : BRAND;
  return `linear-gradient(135deg, ${shade(c, 0.12)} 0%, ${c} 45%, ${shade(c, -0.45)} 100%)`;
}
