import dayjs from 'dayjs';

export const money = (n: number | null | undefined) =>
  `${Math.round(n ?? 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ`;

export const num = (n: number | null | undefined) =>
  Math.round(n ?? 0)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export const datetime = (s: string | Date | null | undefined) => (s ? dayjs(s).format('DD/MM/YYYY HH:mm') : '—');
export const date = (s: string | Date | null | undefined) => (s ? dayjs(s).format('DD/MM/YYYY') : '—');
export const time = (s: string | Date | null | undefined) => (s ? dayjs(s).format('HH:mm') : '—');

/** Formatter/parser cho InputNumber tiền tệ (dấu chấm phân cách nghìn) */
export const moneyInput = {
  formatter: (v: string | number | undefined) => (v === undefined || v === '' ? '' : String(v).replace(/\B(?=(\d{3})+(?!\d))/g, '.')),
  parser: (v: string | undefined) => Number((v ?? '').replace(/\D/g, '')) as unknown as number,
};

export const GENDER_LABEL: Record<string, string> = { MALE: 'Nam', FEMALE: 'Nữ', OTHER: 'Khác' };

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
