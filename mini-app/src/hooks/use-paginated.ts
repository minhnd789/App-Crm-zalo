import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, type Paginated } from "@/api";

/** Tải danh sách phân trang, nối thêm trang khi bấm "Xem thêm" */
export function usePaginated<T>(fetchPage: (page: number) => Promise<Paginated<T>>) {
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fnRef = useRef(fetchPage);
  fnRef.current = fetchPage;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fnRef.current(p);
      setItems((prev) => (p === 1 ? res.items : [...prev, ...res.items]));
      setTotal(res.total);
      setPage(p);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  return {
    items,
    total,
    loading,
    error,
    initialLoading: loading && page === 0,
    hasMore: items.length < total,
    loadMore: () => load(page + 1),
    reload: () => load(1),
  };
}
