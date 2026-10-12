import React from "react";
import { AppIcon } from "./icons";

export function Section({
  title,
  onMore,
  moreText = "Xem tất cả",
  children,
  className,
}: {
  title: string;
  onMore?: () => void;
  moreText?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`section ${className ?? ""}`}>
      <div className="section__head">
        <h3 className="section__title">{title}</h3>
        {onMore && (
          <button className="section__more" onClick={onMore}>
            {moreText}
            <AppIcon name="chevronRight" size={16} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

/** Dòng thông tin "nhãn – giá trị" */
export function InfoRow({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`info-row ${strong ? "info-row--strong" : ""}`}>
      <span className="info-row__label">{label}</span>
      <span className="info-row__value">{value}</span>
    </div>
  );
}

/** Mục menu dạng danh sách */
export function MenuItem({
  icon,
  label,
  description,
  right,
  onClick,
  iconColor,
}: {
  icon: React.ReactNode;
  label: string;
  description?: React.ReactNode;
  right?: React.ReactNode;
  onClick?: () => void;
  iconColor?: string;
}) {
  return (
    <div className="menu-item" onClick={onClick} role={onClick ? "button" : undefined}>
      <div className="menu-item__icon" style={iconColor ? { color: iconColor, background: `${iconColor}1a` } : undefined}>
        {icon}
      </div>
      <div className="menu-item__main">
        <div className="menu-item__label">{label}</div>
        {description && <div className="menu-item__desc">{description}</div>}
      </div>
      <div className="menu-item__right">{right ?? (onClick ? <AppIcon name="chevronRight" size={18} /> : null)}</div>
    </div>
  );
}
