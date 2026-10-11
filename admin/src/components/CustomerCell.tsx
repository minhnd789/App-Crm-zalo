import { Avatar, Space, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';

export function CustomerCell({
  id,
  name,
  avatar,
  sub,
}: {
  id: number;
  name: string;
  avatar?: string | null;
  sub?: string | null;
}) {
  return (
    <Space>
      <Avatar src={avatar || undefined} icon={<UserOutlined />} />
      <div style={{ lineHeight: 1.3 }}>
        <Link to={`/customers/${id}`}>{name}</Link>
        {sub ? (
          <div>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {sub}
            </Typography.Text>
          </div>
        ) : null}
      </div>
    </Space>
  );
}
