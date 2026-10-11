import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, Input, Select, Space, Switch, Table, Tooltip, Typography } from 'antd';
import { useAuth } from '../../auth/AuthContext';
import { BrandDot } from '../../components/BrandBadge';
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
  { value: 'totalSpent', label: 'Chi tiêu nhiều nhất' },
  { value: 'lastVisitAt', label: 'Ghé gần đây' },
];

export default function CustomersPage() {
  const tiers = useTiers();

  const [q, setQ] = useState('');
  const [params] = useSearchParams();
  const { brand, brands } = useAuth();
  const [onlyBrand, setOnlyBrand] = useState(params.get('onlyBrand') === 'true');
  const [tierId, setTierId] = useState<number | undefined>(params.get('tierId') ? Number(params.get('tierId')) : undefined);
  const [sort, setSort] = useState('createdAt');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, loading } = useRequest(
    () => api.get<Paged<Customer>>('/customers', { q, tierId, sort, page, pageSize, onlyBrand: onlyBrand || undefined }),
    [q, tierId, sort, page, pageSize, onlyBrand],
  );

  return (
    <>
      <PageHeader
        title="Khách hàng"
        subtitle={
          data
            ? `${num(data.total)} khách hàng${onlyBrand && brand ? ` của ${brand.name}` : ' (dùng chung mọi thương hiệu)'}`
            : undefined
        }
      />
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
          <Space>
            <Switch
              id="only-brand"
              checked={onlyBrand}
              onChange={(v) => {
                setOnlyBrand(v);
                setPage(1);
              }}
            />
            <label htmlFor="only-brand">Chỉ thành viên của thương hiệu này</label>
          </Space>
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
            {
              title: brand ? `Điểm tại ${brand.name}` : 'Điểm',
              align: 'right',
              render: (_, c) => (c.wallet ? num(c.wallet.points) : <Typography.Text type="secondary">—</Typography.Text>),
            },
            {
              title: <Tooltip title="Tổng chi tiêu ở mọi thương hiệu – dùng để xét hạng">Tổng chi tiêu</Tooltip>,
              dataIndex: 'totalSpent',
              align: 'right',
              render: money,
            },
            {
              title: 'Mini App',
              render: (_, c) => (
                <Space size={4}>
                  {(c.brandIds ?? []).map((id) => {
                    const b = brands.find((x) => x.id === id);
                    return (
                      <Tooltip key={id} title={b?.name ?? `Thương hiệu #${id}`}>
                        <span>
                          <BrandDot color={b?.primaryColor} />
                        </span>
                      </Tooltip>
                    );
                  })}
                  {(c.brandIds ?? []).length === 0 ? <Typography.Text type="secondary">—</Typography.Text> : null}
                </Space>
              ),
            },
            { title: 'Lượt ghé', dataIndex: 'visitCount', align: 'right' },
            { title: 'Ghé gần nhất', dataIndex: 'lastVisitAt', render: (v) => <span className="nowrap">{datetime(v)}</span> },
          ]}
        />
      </Card>
    </>
  );
}
