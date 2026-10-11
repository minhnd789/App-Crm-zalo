import type { Brand } from '@prisma/client';
import { prisma } from '../db.js';

/** Cấu hình mặc định của mỗi thương hiệu – chỉnh trên trang quản trị */
export const DEFAULT_SETTINGS = {
  /** Số tiền (VND) tương ứng 1 điểm trước khi nhân hệ số hạng */
  pointPerAmount: '10000',
  /** Điểm tặng khi khách đăng nhập Mini App của thương hiệu lần đầu */
  welcomePoints: '0',
  /** Phải đặt bàn trước ít nhất bao nhiêu phút */
  bookingMinAdvanceMinutes: '30',
  /** Được đặt bàn trước tối đa bao nhiêu ngày */
  bookingMaxDays: '30',
  maxPartySize: '50',
} as const;

export type SettingKey = keyof typeof DEFAULT_SETTINGS;
export type Settings = Record<SettingKey, string>;

export async function getSettings(brandId: number): Promise<Settings> {
  const rows = await prisma.setting.findMany({ where: { brandId } });
  const result: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) result[r.key as SettingKey] = r.value;
  }
  return result;
}

export async function getNumberSetting(brandId: number, key: SettingKey): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { brandId_key: { brandId, key } } });
  const n = Number(row?.value ?? DEFAULT_SETTINGS[key]);
  return Number.isFinite(n) ? n : Number(DEFAULT_SETTINGS[key]);
}

/** Cấu hình trả về cho Mini App */
export async function getPublicConfig(brand: Brand) {
  const s = await getSettings(brand.id);
  return {
    brand: {
      id: brand.id,
      code: brand.code,
      name: brand.name,
      logoUrl: brand.logoUrl,
      primaryColor: brand.primaryColor,
      hotline: brand.hotline,
      about: brand.about,
      zaloOaId: brand.zaloOaId,
    },
    pointPerAmount: Number(s.pointPerAmount),
    bookingMinAdvanceMinutes: Number(s.bookingMinAdvanceMinutes),
    bookingMaxDays: Number(s.bookingMaxDays),
    maxPartySize: Number(s.maxPartySize),
  };
}
