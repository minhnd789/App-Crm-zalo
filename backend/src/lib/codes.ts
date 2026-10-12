import { randomInt } from 'node:crypto';

// Bỏ các ký tự dễ nhầm (0/O, 1/I/L)
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function randomCode(length: number, prefix = ''): string {
  let s = prefix;
  for (let i = 0; i < length; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** Mã thành viên: 10 chữ số, dễ đọc khi nhân viên nhập tay */
export function memberCode(): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += randomInt(i === 0 ? 1 : 0, 10);
  return s;
}

export const bookingCode = () => randomCode(6, 'BK');
export const orderCode = () => randomCode(8, 'HD');
export const voucherCode = () => randomCode(8, 'V');
