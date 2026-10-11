import { prisma } from '../db.js';

/** Cấu hình mặc định – có thể chỉnh trên trang quản trị */
export const DEFAULT_SETTINGS = {
  restaurantName: 'Nhà hàng của bạn',
  hotline: '',
  about: '',
  /** Số tiền (VND) tương ứng 1 điểm trước khi nhân hệ số hạng */
  pointPerAmount: '10000',
  /** Điểm tặng khi khách đăng ký thành viên lần đầu */
  welcomePoints: '0',
  /** Phải đặt bàn trước ít nhất bao nhiêu phút */
  bookingMinAdvanceMinutes: '30',
  /** Được đặt bàn trước tối đa bao nhiêu ngày */
  bookingMaxDays: '30',
  maxPartySize: '50',
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type Settings = Record<SettingKey, string>;

export const NUMERIC_SETTINGS: SettingKey[] = [
  'pointPerAmount',
  'welcomePoints',
  'bookingMinAdvanceMinutes',
  'bookingMaxDays',
  'maxPartySize',
];

export async function getSettings(): Promise<Settings> {
  const rows = await prisma.setting.findMany();
  const result: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) result[r.key as SettingKey] = r.value;
  }
  return result;
}

export async function getNumberSetting(key: SettingKey): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key } });
  const n = Number(row?.value ?? DEFAULT_SETTINGS[key]);
  return Number.isFinite(n) ? n : Number(DEFAULT_SETTINGS[key]);
}

/** Cấu hình được phép trả về cho Mini App */
export async function getPublicSettings() {
  const s = await getSettings();
  return {
    restaurantName: s.restaurantName,
    hotline: s.hotline,
    about: s.about,
    pointPerAmount: Number(s.pointPerAmount),
    bookingMinAdvanceMinutes: Number(s.bookingMinAdvanceMinutes),
    bookingMaxDays: Number(s.bookingMaxDays),
    maxPartySize: Number(s.maxPartySize),
  };
}
