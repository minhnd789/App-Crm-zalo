import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage, type Me } from "@/api";
import { setReauthHandler, setToken } from "@/api/client";
import { storage } from "@/utils/storage";
import { buildLoginPayload } from "@/utils/zalo";
import { isMockMode } from "@/utils/env";

const TOKEN_KEY = "crm_token";

interface AuthContextValue {
  me: Me | null;
  /** Đang đăng nhập lần đầu */
  loading: boolean;
  error: string | null;
  isNew: boolean;
  mock: boolean;
  /** Tải lại thông tin thành viên (điểm, hạng, số voucher…) */
  refreshMe: () => Promise<Me | null>;
  /** Cập nhật `me` từ response có sẵn (PUT /me, POST /me/phone) */
  setMe: (me: Me) => void;
  /** Thử đăng nhập lại */
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function login(): Promise<{ token: string; me: Me; isNew: boolean }> {
  const payload = await buildLoginPayload();
  const res = await api.login(payload);
  setToken(res.token);
  storage.set(TOKEN_KEY, res.token);
  return { token: res.token, me: res.customer, isNew: res.isNew };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const loginPromise = useRef<Promise<string | null> | null>(null);

  // Đăng nhập lại khi token hết hạn (gộp các request đồng thời)
  useEffect(() => {
    setReauthHandler(() => {
      if (!loginPromise.current) {
        loginPromise.current = login()
          .then((r) => {
            setMe(r.me);
            return r.token;
          })
          .catch(() => null)
          .finally(() => {
            loginPromise.current = null;
          });
      }
      return loginPromise.current;
    });
    return () => setReauthHandler(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Dùng lại token đã lưu nếu còn hợp lệ, nếu không thì đăng nhập mới
        const saved = storage.get(TOKEN_KEY);
        let current: Me | null = null;
        if (saved && !isMockMode()) {
          setToken(saved);
          current = await api.getMe().catch(() => null);
        }
        if (!current) {
          const r = await login();
          current = r.me;
          if (!cancelled) setIsNew(r.isNew);
        }
        if (!cancelled) setMe(current);
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const refreshMe = useCallback(async () => {
    try {
      const m = await api.getMe();
      setMe(m);
      return m;
    } catch {
      return null;
    }
  }, []);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const value = useMemo<AuthContextValue>(
    () => ({ me, loading, error, isNew, mock: isMockMode(), refreshMe, setMe, retry }),
    [me, loading, error, isNew, refreshMe, retry],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth phải dùng bên trong <AuthProvider>");
  return ctx;
}
