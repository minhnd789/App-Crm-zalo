import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Input, Select, Space, Table, Typography } from 'antd';
import { api } from '../../api/client';
import type { Customer, Paged } from '../../api/types';
import { useRequest } from '../../hooks/useRequest';
import { useTiers } from '../../hooks/useCatalog';
import { PageHeader } from '../../components/PageHeader';
import { TierTag } from '../../components/TierTag';
import { CustomerCell } from '../../components/CustomerCell';
import { datetime, money, num } from '../../utils/format';

const SORTS = [
  { value: 'createdAt', label: 'Mới đăng ký' },
  { value: 'points', label: 'Điểm hiện có cao nhất' },
  { value: 'totalSpent', label: 'Chi tiêu nhiều nhất' },
  { value: 'lastVisitAt', label: 'Ghé gần đây' },
];

export default function CustomersPage() {
  const tiers = useTiers();
  const [q, setQ] = useState('');
  const [params] = useSearchParams();
  const [tierId, setTierId] = useState<number | undefined>(params.get('tierId') ? Number(params.get('tierId')) : undefined);
  const [sort, setSort] = useState('createdAt');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, loading } = useRequest(
    () => api.get<Paged<Customer>>('/customers', { q, tierId, sort, page, pageSize }),
    [q, tierId, sort, page, pageSize],
  );

  return (
    <>
      <PageHeader title="Khách hàng" subtitle={data ? `${num(data.total)} khách hàng` : undefined} />
      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search
            allowClear
            placeholder="Tìm theo tên, SĐT, mã thành viên"
            style={{ width: 320 }}
            onSearch={(v) => {
              setQ(v.trim());
              setPage(1);
            }}
          />
          <Select
            allowClear
            placeholder="Tất cả hạng"
            style={{ width: 180 }}
            value={tierId}
            onChange={(v) => {
              setTierId(v);
              setPage(1);
            }}
            options={tiers.map((t) => ({ value: t.id, label: t.name }))}
          />
          <Select
            style={{ width: 220 }}
            value={sort}
            onChange={(v) => {
              setSort(v);
              setPage(1);
            }}
            options={SORTS.map((s) => ({ ...s, label: `Sắp xếp: ${s.label}` }))}
          />
        </Space>
        <Table<Customer>
          rowKey="id"
          loading={loading}
          dataSource={data?.items}
          scroll={{ x: 1100 }}
          pagination={{
            current: page,
            pageSize,
            total: data?.total,
            showSizeChanger: true,
            showTotal: (t) => `Tổng ${num(t)} khách`,
            onChange: (p, s) => {
              setPage(p);
              setPageSize(s);
            },
          }}
          columns={[
            { title: 'Khách hàng', render: (_, c) => <CustomerCell id={c.id} name={c.name} avatar={c.avatar} /> },
            { title: 'SĐT', dataIndex: 'phone', render: (v) => v || <Typography.Text type="secondary">Chưa có</Typography.Text> },
            { title: 'Mã TV', dataIndex: 'memberCode', render: (v) => <Typography.Text copyable>{v}</Typography.Text> },
            { title: 'Hạng', render: (_, c) => <TierTag tier={c.tier} /> },
            { title: 'Điểm', dataIndex: 'points', align: 'right', render: num },
            { title: 'Điểm tích luỹ', dataIndex: 'lifetimePoints', align: 'right', render: num },
            { title: 'Tổng chi tiêu', dataIndex: 'totalSpent', align: 'right', render: money },
            { title: 'Lượt ghé', dataIndex: 'visitCount', align: 'right' },
            { title: 'Ghé gần nhất', dataIndex: 'lastVisitAt', render: (v) => <span className="nowrap">{datetime(v)}</span> },
          ]}
        />
      </Card>
    </>
  );
}
