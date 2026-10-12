import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, brandStore, tokenStore } from '../api/client';
import type { AdminMe, Brand } from '../api/types';

interface AuthState {
  user: AdminMe | null;
  /** đang kiểm tra lại phiên khi tải trang */
  checking: boolean;
  /** Thương hiệu được phép thao tác */
  brands: Brand[];
  /** Bộ lọc thương hiệu đang chọn. null = tất cả thương hiệu (chỉ tài khoản toàn hệ thống) */
  brand: Brand | null;
  brandId: number | null;
  /** true khi đang xem tất cả thương hiệu */
  allBrands: boolean;
  setBrandId: (id: number | null) => void;
  /** Tải lại /auth/me (vd sau khi sửa thương hiệu) */
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<AdminMe>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/** Bộ lọc hợp lệ: tài khoản gắn thương hiệu → cố định; còn lại → giữ lựa chọn cũ nếu còn, không thì "tất cả" */
function resolveBrand(me: AdminMe, preferred: number | null): number | null {
  if (me.brandId) return me.brandId;
  if (preferred && me.brands.some((b) => b.id === preferred)) return preferred;
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminMe | null>(() => {
    if (!tokenStore.get()) return null;
    const u = tokenStore.getUser<AdminMe>();
    // dữ liệu cũ (trước khi có đa thương hiệu) không có brands → bắt buộc tải lại
    return u && Array.isArray(u.brands) ? u : null;
  });
  const [checking, setChecking] = useState<boolean>(() => !!tokenStore.get());
  const [brandId, setBrandIdState] = useState<number | null>(() => (user ? resolveBrand(user, brandStore.get()) : null));

  const applyMe = useCallback((me: AdminMe) => {
    tokenStore.setUser(me);
    setUser(me);
    const id = resolveBrand(me, brandStore.get());
    brandStore.set(id);
    setBrandIdState(id);
  }, []);

  const refresh = useCallback(async () => {
    applyMe(await api.get<AdminMe>('/auth/me'));
  }, [applyMe]);

  useEffect(() => {
    if (!tokenStore.get()) return;
    refresh()
      .catch(() => {
        /* 401 được client xử lý (đăng xuất) */
      })
      .finally(() => setChecking(false));
  }, [refresh]);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await api.post<{ token: string }>('/auth/login', { username, password });
      tokenStore.set(res.token);
      // Tài khoản gắn thương hiệu không được gửi X-Brand-Id của thương hiệu khác (còn lưu từ phiên trước)
      brandStore.set(null);
      const me = await api.get<AdminMe>('/auth/me');
      applyMe(me);
      return me;
    },
    [applyMe],
  );

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const setBrandId = useCallback(
    (id: number | null) => {
      if (user?.brandId && user.brandId !== id) return;
      brandStore.set(id);
      setBrandIdState(id);
    },
    [user],
  );

  const brands = useMemo(() => user?.brands ?? [], [user]);
  const brand = useMemo(() => brands.find((b) => b.id === brandId) ?? null, [brands, brandId]);

  const value = useMemo(
    () => ({ user, checking, brands, brand, brandId, allBrands: brandId === null, setBrandId, refresh, login, logout }),
    [user, checking, brands, brand, brandId, setBrandId, refresh, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải nằm trong AuthProvider');
  return ctx;
}
