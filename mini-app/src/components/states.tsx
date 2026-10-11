import React from "react";
import { Button, Spinner } from "zmp-ui";
import { AppIcon, type IconName } from "./icons";

export function Loading({ text = "Đang tải..." }: { text?: string }) {
  return (
    <div className="state state--loading">
      <Spinner visible />
      <div className="state__text">{text}</div>
    </div>
  );
}

export function Empty({
  icon = "info",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="state">
      <div className="state__icon">
        <AppIcon name={icon} size={30} />
      </div>
      <div className="state__title">{title}</div>
      {description && <div className="state__text">{description}</div>}
      {action && <div className="state__action">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state">
      <div className="state__icon state__icon--danger">
        <AppIcon name="info" size={30} />
      </div>
      <div className="state__title">Không tải được dữ liệu</div>
      <div className="state__text">{message}</div>
      {onRetry && (
        <div className="state__action">
          <Button size="small" variant="secondary" onClick={onRetry}>
            Thử lại
          </Button>
        </div>
      )}
    </div>
  );
}

/** Khung xương khi đang tải danh sách */
export function SkeletonList({ count = 3, height = 88 }: { count?: number; height?: number }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}

/** Hiển thị loading / lỗi / rỗng / nội dung cho dữ liệu từ useRequest */
export function AsyncView<T>({
  loading,
  error,
  data,
  onRetry,
  isEmpty,
  empty,
  skeleton,
  children,
}: {
  loading: boolean;
  error: string | null;
  data: T | undefined;
  onRetry?: () => void;
  isEmpty?: (data: T) => boolean;
  empty?: React.ReactNode;
  skeleton?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}) {
  if (loading && data === undefined) return <>{skeleton ?? <Loading />}</>;
  if (error && data === undefined) return <ErrorState message={error} onRetry={onRetry} />;
  if (data === undefined) return null;
  if (isEmpty?.(data)) return <>{empty}</>;
  return <>{children(data)}</>;
}
