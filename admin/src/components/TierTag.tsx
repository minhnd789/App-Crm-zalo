import { Tag } from 'antd';
import { CrownOutlined } from '@ant-design/icons';
import type { Tier } from '../api/types';

export function TierTag({ tier }: { tier: Pick<Tier, 'name' | 'color'> | null | undefined }) {
  if (!tier) return <Tag>Chưa có hạng</Tag>;
  return (
    <Tag color={tier.color} icon={<CrownOutlined />} style={{ marginInlineEnd: 0 }}>
      {tier.name}
    </Tag>
  );
}
