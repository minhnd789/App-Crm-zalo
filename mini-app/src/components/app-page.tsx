import React from "react";
import { Page, useNavigate } from "zmp-ui";
import { AppIcon } from "./icons";

interface AppPageProps {
  title?: string;
  /** Hiện nút quay lại (trang con) */
  back?: boolean;
  /** Ẩn thanh tiêu đề (trang chủ tự vẽ phần đầu) */
  noHeader?: boolean;
  /** Trang thuộc thanh điều hướng dưới → chừa khoảng trống cho BottomNavigation */
  tab?: boolean;
  className?: string;
  headerRight?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({ title, back, right }: { title?: string; back?: boolean; right?: React.ReactNode }) {
  const navigate = useNavigate();
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate("/", { replace: true, animate: false });
  };
  return (
    <header className="app-header">
      <div className="app-header__inner">
        {back ? (
          <button className="app-header__back" onClick={goBack} aria-label="Quay lại">
            <AppIcon name="chevronLeft" size={24} strokeWidth={2.2} />
          </button>
        ) : (
          <span className="app-header__spacer" />
        )}
        <div className="app-header__title">{title}</div>
        <div className="app-header__right">{right}</div>
      </div>
    </header>
  );
}

export function AppPage({ title, back, noHeader, tab, className, headerRight, children }: AppPageProps) {
  return (
    <Page className={`app-page ${tab ? "app-page--tab" : ""} ${className ?? ""}`} restoreScrollOnBack>
      {!noHeader && <PageHeader title={title} back={back} right={headerRight} />}
      <div className="app-page__body">{children}</div>
    </Page>
  );
}
