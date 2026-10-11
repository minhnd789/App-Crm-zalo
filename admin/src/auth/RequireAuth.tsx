import { Navigate, useLocation } from 'react-router-dom';
import { Result, Spin } from 'antd';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { isManager, isSuperAdmin } from './roles';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, checking } = useAuth();
  const location = useLocation();
  if (!user) {
    if (checking) return <Spin fullscreen />;
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <>{children}</>;
}

/** Trang chỉ dành cho quản lý */
export function RequireManager({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!isManager(user)) {
    return <Result status="403" title="Không có quyền" subTitle="Chỉ tài khoản Quản lý mới truy cập được trang này." />;
  }
  return <>{children}</>;
}

/** Trang chỉ dành cho quản trị toàn hệ thống */
export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!isSuperAdmin(user)) {
    return <Result status="403" title="Không có quyền" subTitle="Chỉ quản trị toàn hệ thống mới truy cập được trang này." />;
  }
  return <>{children}</>;
}
