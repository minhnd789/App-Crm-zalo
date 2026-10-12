import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, type AppConfig, type Branch, type Tier } from "@/api";
import { applyBrandTheme, applyBrandTitle } from "@/utils/theme";

/** Dữ liệu công khai, ít thay đổi: thương hiệu & cấu hình, chi nhánh, hạng thành viên (dùng chung) */
interface AppDataValue {
  config: AppConfig | null;
  branches: Branch[];
  tiers: Tier[];
  loading: boolean;
  error: boolean;
  reload: () => void;
}

const AppDataContext = createContext<AppDataValue | null>(null);

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [n, setN] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    Promise.all([api.getConfig(), api.getBranches(), api.getTiers()])
      .then(([c, b, t]) => {
        if (cancelled) return;
        setConfig(c);
        applyBrandTheme(c.brand?.primaryColor);
        applyBrandTitle(c.brand?.name);
        setBranches(b);
        setTiers(t);
      })
      .catch(() => !cancelled && setError(true))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [n]);

  const reload = useCallback(() => setN((x) => x + 1), []);
  const value = useMemo(
    () => ({ config, branches, tiers, loading, error, reload }),
    [config, branches, tiers, loading, error, reload],
  );
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataValue {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData phải dùng bên trong <AppDataProvider>");
  return ctx;
}
