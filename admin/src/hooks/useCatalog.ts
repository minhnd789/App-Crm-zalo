import { useEffect, useState } from 'react';
import { api, brandStore } from '../api/client';
import type { Branch, Tier } from '../api/types';

// Bộ nhớ đệm đơn giản cho danh mục ít thay đổi. Hạng dùng chung; chi nhánh theo từng thương hiệu.
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

/** Chi nhánh của thương hiệu đang chọn */
export function useBranches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  useEffect(() => {
    const brandId = brandStore.get() ?? 0;
    let p = branchesCache.get(brandId);
    if (!p) {
      p = api.get<Branch[]>('/branches').catch((e) => {
        branchesCache.delete(brandId);
        throw e;
      });
      branchesCache.set(brandId, p);
    }
    p.then(setBranches).catch(() => undefined);
  }, []);
  return branches;
}
