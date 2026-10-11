import { Flex, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { BrandDot } from './BrandBadge';

/**
 * Tiêu đề trang. `scoped` = dữ liệu theo thương hiệu đang chọn → hiện tag tên thương hiệu cạnh tiêu đề.
 */
export function PageHeader({
  title,
  subtitle,
  extra,
  scoped,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  extra?: ReactNode;
  scoped?: boolean;
}) {
  const { brand } = useAuth();
  return (
    <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 16 }}>
      <div>
        <Flex align="center" gap={10} wrap>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          {scoped && brand ? (
            <Tag style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '2px 8px', margin: 0 }} data-testid="page-brand">
              <BrandDot color={brand.primaryColor} size={8} />
              {brand.name}
            </Tag>
          ) : null}
        </Flex>
        {subtitle ? <Typography.Text type="secondary">{subtitle}</Typography.Text> : null}
      </div>
      {extra ? <Flex gap={8} wrap>{extra}</Flex> : null}
    </Flex>
  );
}
