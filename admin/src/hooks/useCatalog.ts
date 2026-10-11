import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Branch, Tier } from '../api/types';

// Bộ nhớ đệm đơn giản cho danh mục ít thay đổi (hạng, chi nhánh)
const cache: { tiers?: Promise<Tier[]>; branches?: Promise<Branch[]> } = {};

export function invalidateCatalog(kind: 'tiers' | 'branches') {
  delete cache[kind];
}

export function useTiers() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  useEffect(() => {
    cache.tiers ??= api.get<Tier[]>('/tiers').catch((e) => {
      delete cache.tiers;
      throw e;
    });
    cache.tiers.then(setTiers).catch(() => undefined);
  }, []);
  return tiers;
}

export function useBranches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  useEffect(() => {
    cache.branches ??= api.get<Branch[]>('/branches').catch((e) => {
      delete cache.branches;
      throw e;
    });
    cache.branches.then(setBranches).catch(() => undefined);
  }, []);
  return branches;
}
