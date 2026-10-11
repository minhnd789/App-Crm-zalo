import React from "react";
import type { Voucher } from "@/api/types";
import { voucherShortValue } from "@/utils/format";

interface VoucherTicketProps {
  voucher: Pick<Voucher, "title" | "description" | "discountType" | "discountValue" | "pointCost" | "imageUrl">;
  /** Dòng phụ (hạn dùng, điều kiện…) */
  meta?: React.ReactNode;
  /** Nút/nhãn bên phải */
  action?: React.ReactNode;
  onClick?: () => void;
  /** Làm mờ (đã dùng / hết hạn) */
  muted?: boolean;
  stamp?: string;
}

/** Thẻ voucher dạng "vé" có cuống bên trái */
export function VoucherTicket({ voucher, meta, action, onClick, muted, stamp }: VoucherTicketProps) {
  const tone = voucher.pointCost > 0 ? "points" : voucher.discountType === "GIFT" ? "gift" : "free";
  return (
    <div className={`ticket ${muted ? "ticket--muted" : ""}`} onClick={onClick}>
      <div className={`ticket__stub ticket__stub--${tone}`}>
        <div className="ticket__value">{voucherShortValue(voucher)}</div>
        <div className="ticket__stub-label">{voucher.discountType === "GIFT" ? "Tặng" : "Giảm"}</div>
      </div>
      <div className="ticket__body">
        <div className="ticket__title">{voucher.title}</div>
        {voucher.description && <div className="ticket__desc">{voucher.description}</div>}
        {(meta || action) && (
          <div className="ticket__footer">
            <div className="ticket__meta">{meta}</div>
            {action && (
              <div className="ticket__action" onClick={(e) => e.stopPropagation()}>
                {action}
              </div>
            )}
          </div>
        )}
      </div>
      {stamp && <div className="ticket__stamp">{stamp}</div>}
    </div>
  );
}
