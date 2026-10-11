import type { Branch } from '@prisma/client';
import { badRequest } from '../lib/errors.js';
import { getNumberSetting } from './settings.js';

export const BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'ARRIVED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Chờ xác nhận',
  CONFIRMED: 'Đã xác nhận',
  ARRIVED: 'Đã đến',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã huỷ',
  NO_SHOW: 'Không đến',
};

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Giờ địa phương Việt Nam (UTC+7) của thời điểm `d`, tính bằng phút trong ngày */
function vnMinutesOfDay(d: Date) {
  const vn = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return vn.getUTCHours() * 60 + vn.getUTCMinutes();
}

/** Kiểm tra thời gian đặt bàn hợp lệ theo cấu hình & giờ mở cửa chi nhánh */
export async function validateBookingTime(time: Date, partySize: number, branch: Branch) {
  const now = Date.now();
  const minAdvance = await getNumberSetting(branch.brandId, 'bookingMinAdvanceMinutes');
  const maxDays = await getNumberSetting(branch.brandId, 'bookingMaxDays');
  const maxParty = await getNumberSetting(branch.brandId, 'maxPartySize');

  if (time.getTime() < now + minAdvance * 60_000) {
    throw badRequest(`Vui lòng đặt bàn trước ít nhất ${minAdvance} phút`);
  }
  if (time.getTime() > now + maxDays * 24 * 60 * 60_000) {
    throw badRequest(`Chỉ nhận đặt bàn trong vòng ${maxDays} ngày tới`);
  }
  if (partySize > maxParty) {
    throw badRequest(`Đặt bàn trên ${maxParty} khách vui lòng liên hệ hotline`);
  }
  const m = vnMinutesOfDay(time);
  const open = toMinutes(branch.openTime);
  const close = toMinutes(branch.closeTime);
  // Không nhận đặt đúng giờ đóng cửa; hỗ trợ chi nhánh mở qua đêm
  const inHours = open <= close ? m >= open && m < close : m >= open || m < close;
  if (!inHours) {
    throw badRequest(`Chi nhánh mở cửa từ ${branch.openTime} đến ${branch.closeTime}`);
  }
}
