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
