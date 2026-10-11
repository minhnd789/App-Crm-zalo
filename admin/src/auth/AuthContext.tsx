import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokenStore } from '../api/client';
import type { AdminUser } from '../api/types';

interface AuthState {
  user: AdminUser | null;
  /** đang kiểm tra lại phiên khi tải trang */
  checking: boolean;
  login: (username: string, password: string) => Promise<AdminUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(() => (tokenStore.get() ? tokenStore.getUser<AdminUser>() : null));
  const [checking, setChecking] = useState<boolean>(() => !!tokenStore.get());

  useEffect(() => {
    if (!tokenStore.get()) return;
    api
      .get<AdminUser>('/auth/me')
      .then((me) => {
        tokenStore.setUser(me);
        setUser(me);
      })
      .catch(() => {
        /* 401 được client xử lý (đăng xuất) */
      })
      .finally(() => setChecking(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<{ token: string; admin: AdminUser }>('/auth/login', { username, password });
    tokenStore.set(res.token);
    tokenStore.setUser(res.admin);
    setUser(res.admin);
    return res.admin;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, checking, login, logout }), [user, checking, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}
