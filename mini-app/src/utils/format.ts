import dayjs from "dayjs";
import "dayjs/locale/vi";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import relativeTime from "dayjs/plugin/relativeTime";
import type { BookingStatus, DiscountType, Gender, PointTransactionType, Voucher } from "@/api/types";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.locale("vi");

/** Múi giờ của nhà hàng */
export const VN_TZ = "Asia/Ho_Chi_Minh";

export { dayjs };

/** Thời điểm (ISO UTC từ API) theo giờ Việt Nam */
export function vn(date: string | Date | number) {
  return dayjs(date).tz(VN_TZ);
}

const moneyFmt = new Intl.NumberFormat("vi-VN");
const numberFmt = new Intl.NumberFormat("vi-VN");

/** 123000 → "123.000đ" */
export function formatMoney(value: number | null | undefined): string {
  return `${moneyFmt.format(Math.round(value ?? 0))}đ`;
}

/** 1234 → "1.234" */
export function formatNumber(value: number | null | undefined): string {
  return numberFmt.format(value ?? 0);
}

/** Điểm có dấu: +120 / -50 */
export function formatPointsDelta(points: number): string {
  return `${points > 0 ? "+" : ""}${formatNumber(points)}`;
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  return vn(date).format("DD/MM/YYYY");
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return "";
  return vn(date).format("HH:mm DD/MM/YYYY");
}

/** "18:30 · Thứ bảy, 12/10/2026" */
export function formatBookingTime(date: string | Date): string {
  const d = vn(date);
  const weekday = d.format("dddd");
  return `${d.format("HH:mm")} · ${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${d.format("DD/MM/YYYY")}`;
}

/** Ngày sinh lưu dạng ngày (UTC 00:00) → hiển thị không lệch múi giờ */
export function formatBirthday(date: string | null | undefined): string {
  if (!date) return "";
  return dayjs.utc(date).format("DD/MM/YYYY");
}

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  ARRIVED: "Đã đến",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
  NO_SHOW: "Không đến",
};

export const BOOKING_STATUS_TONE: Record<BookingStatus, BadgeTone> = {
  PENDING: "warning",
  CONFIRMED: "info",
  ARRIVED: "success",
  COMPLETED: "success",
  CANCELLED: "neutral",
  NO_SHOW: "danger",
};

export type BadgeTone = "success" | "warning" | "danger" | "info" | "neutral" | "primary";

export const GENDER_LABEL: Record<Gender, string> = {
  MALE: "Nam",
  FEMALE: "Nữ",
  OTHER: "Khác",
};

export const POINT_TYPE_LABEL: Record<PointTransactionType, string> = {
  EARN: "Tích điểm",
  REDEEM: "Đổi ưu đãi",
  ADJUST: "Điều chỉnh",
  REFUND: "Hoàn điểm",
  WELCOME: "Quà chào mừng",
};

export const DISCOUNT_TYPE_LABEL: Record<DiscountType, string> = {
  PERCENT: "Giảm theo %",
  AMOUNT: "Giảm tiền",
  GIFT: "Quà tặng",
};

/** Nhãn ngắn của giá trị ưu đãi, ví dụ "Giảm 10%", "Giảm 50.000đ", "Quà tặng" */
export function voucherValueLabel(v: Pick<Voucher, "discountType" | "discountValue">): string {
  if (v.discountType === "PERCENT") return `Giảm ${v.discountValue}%`;
  if (v.discountType === "AMOUNT") return `Giảm ${formatMoney(v.discountValue)}`;
  return "Quà tặng";
}

/** Nhãn rất ngắn để hiển thị trên "cuống" voucher */
export function voucherShortValue(v: Pick<Voucher, "discountType" | "discountValue">): string {
  if (v.discountType === "PERCENT") return `${v.discountValue}%`;
  if (v.discountType === "AMOUNT") {
    if (v.discountValue >= 1000 && v.discountValue % 1000 === 0) return `${formatNumber(v.discountValue / 1000)}K`;
    return formatMoney(v.discountValue);
  }
  return "QUÀ";
}

/** Tách văn bản nhiều dòng, bỏ dòng trống */
export function splitLines(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  const last = parts[parts.length - 1] ?? "";
  return last.charAt(0).toUpperCase() || "?";
}

/** "HH:mm" → số phút trong ngày */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** số phút → "HH:mm" */
export function fromMinutes(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
