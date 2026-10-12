import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import { errMsg } from '../utils/format';

/** Gọi API khi deps thay đổi, có loading/error/reload. */
export function useRequest<T>(fn: () => Promise<T>, deps: unknown[] = [], opts: { enabled?: boolean } = {}) {
  const { message } = App.useApp();
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(opts.enabled !== false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fnRef.current();
      if (id === seq.current) setData(res);
      return res;
    } catch (e) {
      if (id === seq.current) {
        setError(errMsg(e));
        message.error(errMsg(e));
      }
      return undefined;
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    if (opts.enabled === false) {
      setLoading(false);
      return;
    }
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, opts.enabled]);

  return { data, setData, loading, error, reload: run };
}
