import React from "react";
import type { Promotion } from "@/api/types";
import { formatDate } from "@/utils/format";
import { AppIcon } from "./icons";

export function promotionPeriod(p: Pick<Promotion, "startDate" | "endDate">): string {
  if (p.startDate && p.endDate) return `${formatDate(p.startDate)} – ${formatDate(p.endDate)}`;
  if (p.endDate) return `Đến hết ${formatDate(p.endDate)}`;
  if (p.startDate) return `Từ ${formatDate(p.startDate)}`;
  return "Áp dụng thường xuyên";
}

export function PromotionImage({ src, alt, className }: { src: string | null; alt: string; className?: string }) {
  const [failed, setFailed] = React.useState(false);
  if (!src || failed) {
    return (
      <div className={`promo-placeholder ${className ?? ""}`}>
        <AppIcon name="utensils" size={36} />
      </div>
    );
  }
  return <img className={className} src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

/** Thẻ chương trình ưu đãi */
export function PromotionCard({
  promotion,
  onClick,
  compact,
}: {
  promotion: Promotion;
  onClick?: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`promo-card ${compact ? "promo-card--compact" : ""}`} onClick={onClick} role="button">
      <div className="promo-card__media">
        <PromotionImage src={promotion.imageUrl} alt={promotion.title} className="promo-card__img" />
        {promotion.featured && <span className="promo-card__flag">Nổi bật</span>}
      </div>
      <div className="promo-card__body">
        <div className="promo-card__title">{promotion.title}</div>
        {promotion.summary && <div className="promo-card__summary">{promotion.summary}</div>}
        <div className="promo-card__date">
          <AppIcon name="clock" size={14} />
          {promotionPeriod(promotion)}
        </div>
      </div>
    </div>
  );
}
