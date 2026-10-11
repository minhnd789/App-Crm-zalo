import type { Voucher } from '../api/types';
import { money } from './format';

/** Mô tả mức giảm của voucher, ví dụ "Giảm 10% (tối đa 50.000đ)" */
export function discountText(v: Pick<Voucher, 'discountType' | 'discountValue' | 'maxDiscount' | 'minOrder'>, withMin = true) {
  let s =
    v.discountType === 'PERCENT'
      ? `Giảm ${v.discountValue}%${v.maxDiscount ? ` (tối đa ${money(v.maxDiscount)})` : ''}`
      : v.discountType === 'AMOUNT'
        ? `Giảm ${money(v.discountValue)}`
        : 'Quà tặng';
  if (withMin && v.minOrder > 0) s += ` · đơn từ ${money(v.minOrder)}`;
  return s;
}

/** Tính trước số tiền giảm – giống backend voucherDiscountAmount */
export function voucherDiscount(v: Pick<Voucher, 'discountType' | 'discountValue' | 'maxDiscount'>, amount: number) {
  let d = 0;
  if (v.discountType === 'PERCENT') {
    d = Math.floor((amount * v.discountValue) / 100);
    if (v.maxDiscount) d = Math.min(d, v.maxDiscount);
  } else if (v.discountType === 'AMOUNT') d = v.discountValue;
  return Math.max(0, Math.min(d, amount));
}
