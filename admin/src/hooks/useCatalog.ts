import { useEffect, useState } from 'react';
import { api, brandStore } from '../api/client';
import type { Branch, Tier } from '../api/types';

// Bộ nhớ đệm đơn giản cho danh mục ít thay đổi. Hạng dùng chung; cơ sở theo bộ lọc thương hiệu (0 = tất cả).
let tiersCache: Promise<Tier[]> | undefined;
const branchesCache = new Map<number, Promise<Branch[]>>();

export function invalidateCatalog(kind: 'tiers' | 'branches') {
  if (kind === 'tiers') tiersCache = undefined;
  else branchesCache.clear();
}

export function useTiers() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  useEffect(() => {
    tiersCache ??= api.get<Tier[]>('/tiers').catch((e) => {
      tiersCache = undefined;
      throw e;
    });
    tiersCache.then(setTiers).catch(() => undefined);
  }, []);
  return tiers;
}

/** Cơ sở theo bộ lọc thương hiệu đang chọn (tất cả thương hiệu khi không lọc), kèm `brand` */
export function useBranches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  useEffect(() => {
    const key = brandStore.get() ?? 0;
    let p = branchesCache.get(key);
    if (!p) {
      p = api.get<Branch[]>('/branches').catch((e) => {
        branchesCache.delete(key);
        throw e;
      });
      branchesCache.set(key, p);
    }
    p.then(setBranches).catch(() => undefined);
  }, []);
  return branches;
}
