import { Select, Space, Tag } from 'antd';
import type { SelectProps } from 'antd';
import { useMemo } from 'react';
import type { Branch, Brand, BrandRef } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useBranches } from '../hooks/useCatalog';

/** Chấm màu thương hiệu */
export function BrandDot({ color, size = 10 }: { color?: string | null; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color || '#bfbfbf',
        boxShadow: '0 0 0 2px rgba(0,0,0,0.04)',
        flex: 'none',
      }}
    />
  );
}

export function BrandLabel({ brand }: { brand: Pick<Brand, 'name' | 'primaryColor'> & { active?: boolean } }) {
  return (
    <Space size={8}>
      <BrandDot color={brand.primaryColor} />
      <span>
        {brand.name}
        {brand.active === false ? ' (ngừng hoạt động)' : ''}
      </span>
    </Space>
  );
}

/** Tag thương hiệu cho dòng dữ liệu; tự lấy màu từ danh sách thương hiệu nếu bản ghi không kèm */
export function BrandTag({ brand, brandId }: { brand?: BrandRef | null; brandId?: number | null }) {
  const { brands } = useAuth();
  const full = brands.find((b) => b.id === (brand?.id ?? brandId));
  const name = brand?.name ?? full?.name ?? (brandId ? `#${brandId}` : '—');
  const color = brand?.primaryColor ?? full?.primaryColor;
  return (
    <Tag style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginInlineEnd: 0, background: '#fff' }}>
      <BrandDot color={color} size={8} />
      {name}
    </Tag>
  );
}

/** "Thương hiệu · Quận 1" */
export function useLocationLabel() {
  const { brands } = useAuth();
  return (branch: { name: string; brandId?: number; brand?: BrandRef } | null | undefined, brandId?: number | null) => {
    if (!branch) return '—';
    const bid = branch.brand?.id ?? branch.brandId ?? brandId;
    const bname = branch.brand?.name ?? brands.find((b) => b.id === bid)?.name;
    return bname ? `${bname} · ${branch.name}` : branch.name;
  };
}

/** Hiển thị cơ sở dạng "• Thương hiệu · Quận 1" */
export function LocationText({ branch, brandId }: { branch: { name: string; brandId?: number; brand?: BrandRef } | null | undefined; brandId?: number | null }) {
  const { brands } = useAuth();
  const label = useLocationLabel();
  if (!branch) return <>—</>;
  const bid = branch.brand?.id ?? branch.brandId ?? brandId;
  const color = branch.brand?.primaryColor ?? brands.find((b) => b.id === bid)?.primaryColor;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <BrandDot color={color} size={8} />
      {label(branch, brandId)}
    </span>
  );
}

/** Nhóm cơ sở theo thương hiệu cho Select: "Nhà hàng Ngon › Quận 1" */
export function useBranchOptions(opts: { brandId?: number | null; activeOnly?: boolean } = {}) {
  const branches = useBranches();
  const { brands } = useAuth();
  return useMemo(() => {
    const list = branches.filter((b) => (!opts.brandId || b.brandId === opts.brandId) && (!opts.activeOnly || b.active));
    const groups = new Map<number, Branch[]>();
    for (const b of list) {
      if (!groups.has(b.brandId)) groups.set(b.brandId, []);
      groups.get(b.brandId)!.push(b);
    }
    const options = [...groups.entries()].map(([bid, items]) => {
      const brand = brands.find((x) => x.id === bid) ?? items[0].brand;
      const bname = brand?.name ?? `#${bid}`;
      return {
        label: (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <BrandDot color={brand?.primaryColor} size={8} />
            {bname}
          </span>
        ),
        title: bname,
        options: items.map((b) => ({
          value: b.id,
          label: `${bname} › ${b.name}${b.active ? '' : ' (ngừng)'}`,
          search: `${bname} ${b.name}`,
        })),
      };
    });
    return { branches: list, options };
  }, [branches, brands, opts.brandId, opts.activeOnly]);
}

/** Ô chọn cơ sở nhóm theo thương hiệu; mặc định lọc theo bộ lọc thương hiệu đang chọn */
export function BranchSelect({
  brandId,
  activeOnly,
  ...props
}: Omit<SelectProps<number>, 'options'> & { brandId?: number | null; activeOnly?: boolean }) {
  const { brandId: filterBrand } = useAuth();
  const { options } = useBranchOptions({ brandId: brandId === undefined ? filterBrand : brandId, activeOnly });
  return <Select<number> showSearch optionFilterProp="search" placeholder="Cơ sở" {...props} options={options} />;
}

/** Ô chọn thương hiệu (dùng trong form tạo mới khi đang xem tất cả) */
export function BrandSelect(props: Omit<SelectProps<number>, 'options'>) {
  const { brands } = useAuth();
  return (
    <Select<number>
      placeholder="Chọn thương hiệu"
      {...props}
      options={brands.map((b) => ({ value: b.id, label: <BrandLabel brand={b} /> }))}
    />
  );
}
