import { Space } from 'antd';
import type { Brand } from '../api/types';

/** Chấm màu + tên thương hiệu */
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
