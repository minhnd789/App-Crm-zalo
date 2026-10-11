import type { Branch } from "@/api/types";
import { dayjs, fromMinutes, toMinutes } from "./format";

export interface TimeSlot {
  /** ISO có offset +07:00 gửi lên API */
  value: string;
  label: string;
}

/** Bước giữa các khung giờ (phút) */
export const SLOT_STEP = 30;
/** Không nhận khách trong N phút trước giờ đóng cửa */
export const LAST_SEATING_BEFORE_CLOSE = 30;

/**
 * Sinh các khung giờ 30 phút trong giờ mở cửa của chi nhánh cho ngày `date` (theo giờ Việt Nam),
 * bỏ các khung đã qua / quá gần (bookingMinAdvanceMinutes) / vượt quá bookingMaxDays.
 * Hỗ trợ chi nhánh mở qua đêm (closeTime < openTime).
 */
export function buildTimeSlots(
  date: Date,
  branch: Pick<Branch, "openTime" | "closeTime">,
  minAdvanceMinutes: number,
  maxDays: number,
  now: number = Date.now(),
): TimeSlot[] {
  const ymd = dayjs(date).format("YYYY-MM-DD");
  const open = toMinutes(branch.openTime);
  let close = toMinutes(branch.closeTime);
  if (close <= open) close += 24 * 60;
  const last = Math.max(open, close - LAST_SEATING_BEFORE_CLOSE);
  const first = Math.ceil(open / SLOT_STEP) * SLOT_STEP;

  const earliest = now + minAdvanceMinutes * 60_000;
  const latest = now + maxDays * 24 * 60 * 60_000;
  const slots: TimeSlot[] = [];

  for (let m = first; m <= last; m += SLOT_STEP) {
    const dayOffset = Math.floor(m / 1440);
    const dateStr = dayOffset ? dayjs(ymd).add(dayOffset, "day").format("YYYY-MM-DD") : ymd;
    const hhmm = fromMinutes(m);
    const iso = `${dateStr}T${hhmm}:00+07:00`;
    const t = Date.parse(iso);
    if (t < earliest || t > latest) continue;
    slots.push({ value: iso, label: dayOffset ? `${hhmm} (rạng sáng hôm sau)` : hhmm });
  }
  return slots;
}

export function normalizePhone(v: string): string {
  return v.replace(/[\s.-]/g, "").replace(/^\+?84/, "0");
}

export function isValidPhone(v: string): boolean {
  return /^0\d{9,10}$/.test(normalizePhone(v));
}
