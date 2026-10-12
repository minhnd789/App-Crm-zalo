import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/api";

export interface RequestState<T> {
  data: T | undefined;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T | undefined>>;
}

/**
 * Gọi API khi component mount / khi `deps` thay đổi.
 * `enabled = false` để tạm hoãn (ví dụ chờ đăng nhập xong).
 */
export function useRequest<T>(fn: () => Promise<T>, deps: React.DependencyList = [], enabled = true): RequestState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const run = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      if (id === seq.current) setData(result);
    } catch (e) {
      if (id === seq.current) setError(errorMessage(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return { data, loading, error, reload: run, setData };
}
