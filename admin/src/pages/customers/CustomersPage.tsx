import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, Input, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { GiftOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../../api/client';
import type { Customer, Paged } from '../../api/types';
import { useRequest } from '../../hooks/useRequest';
import { useTiers } from '../../hooks/useCatalog';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { TierTag } from '../../components/TierTag';
import { CustomerCell } from '../../components/CustomerCell';
import { BranchSelect, BrandDot } from '../../components/BrandBadge';
import { date, money, num } from '../../utils/format';

const SORTS = [
  { value: 'createdAt', label: 'Mới tham gia' },
  { value: 'totalSpent', label: 'Chi tiêu nhiều nhất' },
  { value: 'lastVisitAt', label: 'Ghé gần đây' },
];

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `Tháng ${i + 1}` }));

export default function CustomersPage() {
  const tiers = useTiers();
  const { brand, allBrands, brands } = useAuth();
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [tierId, setTierId] = useState<number | undefined>(params.get('tierId') ? Number(params.get('tierId')) : undefined);
  const [branchId, setBranchId] = useState<number | undefined>(params.get('branchId') ? Number(params.get('branchId')) : undefined);
  const [registered, setRegistered] = useState<'true' | 'false' | undefined>();
  const [birthMonth, setBirthMonth] = useState<number | undefined>();
  const [sort, setSort] = useState('createdAt');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const thisMonth = dayjs().month() + 1;

  const { data, loading } = useRequest(
    () => api.get<Paged<Customer>>('/customers', { q, tierId, branchId, registered, birthMonth, sort, page, pageSize }),
    [q, tierId, branchId, registered, birthMonth, sort, page, pageSize],
  );
  const reset = () => setPage(1);

  return (
    <>
      <PageHeader
        title="Khách hàng"
        scoped
        subtitle={
          data
            ? `${num(data.total)} khách hàng${brand ? ` là thành viên của ${brand.name}` : ' (dùng chung mọi thương hiệu)'}`
            : undefined
        }
      />
      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search
            allowClear
            placeholder="Tìm theo tên, SĐT, mã thành viên"
            style={{ width: 280 }}
            onSearch={(v) => {
              setQ(v.trim());
              reset();
            }}
          />
          <BranchSelect
            allowClear
            placeholder="Cơ sở đăng ký"
            style={{ width: 260 }}
            value={branchId}
            onChange={(v) => {
              setBranchId(v ?? undefined);
              reset();
            }}
            data-testid="customers-branch"
          />
          <Select
            allowClear
            placeholder="Đăng ký"
            style={{ width: 150 }}
            value={registered}
            onChange={(v) => {
              setRegistered(v);
              reset();
            }}
            options={[
              { value: 'true', label: 'Đã đăng ký' },
              { value: 'false', label: 'Chưa đăng ký' },
            ]}
          />
          <Select
            allowClear
            placeholder="Tháng sinh"
            style={{ width: 140 }}
            value={birthMonth}
            onChange={(v) => {
              setBirthMonth(v);
              reset();
            }}
            options={MONTHS}
            data-testid="customers-birth-month"
          />
          <Button
            icon={<GiftOutlined />}
            type={birthMonth === thisMonth ? 'primary' : 'default'}
            onClick={() => {
              setBirthMonth(birthMonth === thisMonth ? undefined : thisMonth);
              reset();
            }}
          >
            Sinh nhật tháng này
          </Button>
          <Select
            allowClear
            placeholder="Tất cả hạng"
            style={{ width: 150 }}
            value={tierId}
            onChange={(v) => {
              setTierId(v);
              reset();
            }}
            options={tiers.map((t) => ({ value: t.id, label: t.name }))}
          />
          <Select
            style={{ width: 210 }}
            value={sort}
            onChange={(v) => {
              setSort(v);
              reset();
            }}
            options={SORTS.map((s) => ({ ...s, label: `Sắp xếp: ${s.label}` }))}
          />
        </Space>
        <Table<Customer>
          rowKey="id"
          loading={loading}
          dataSource={data?.items}
          scroll={{ x: 1060 }}
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
            {
              title: 'Khách hàng',
              render: (_, c) => <CustomerCell id={c.id} name={c.name} avatar={c.avatar} sub={c.phone || 'Chưa có SĐT'} />,
            },
            {
              title: 'Ngày sinh',
              dataIndex: 'birthday',
              render: (v: string | null) =>
                v ? (
                  <span className="nowrap">
                    {date(v)} {dayjs(v).month() + 1 === thisMonth ? <Tooltip title="Sinh nhật tháng này">🎂</Tooltip> : null}
                  </span>
                ) : (
                  <Typography.Text type="secondary">—</Typography.Text>
                ),
            },
            { title: 'Hạng', render: (_, c) => <TierTag tier={c.tier} /> },
            {
              title: <Tooltip title="Tổng chi tiêu ở mọi thương hiệu – dùng để xét hạng">Tổng chi tiêu</Tooltip>,
              dataIndex: 'totalSpent',
              align: 'right',
              render: money,
            },
            {
              title: 'Thành viên tại',
              render: (_, c) =>
                (c.wallets ?? []).length ? (
                  <Space size={[4, 4]} wrap style={{ maxWidth: 340 }}>
                    {(c.wallets ?? []).map((w) => {
                      const color = w.brand?.primaryColor ?? brands.find((b) => b.id === w.brandId)?.primaryColor;
                      return (
                        <Tag
                          key={w.id}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, background: '#fff' }}
                          title={w.registeredAt ? `Đăng ký ${date(w.registeredAt)}` : 'Chưa hoàn tất đăng ký'}
                        >
                          <BrandDot color={color} size={8} />
                          {allBrands ? `${w.brand?.name ?? ''} · ` : ''}
                          {w.homeBranch?.name ?? 'chưa chọn cơ sở'}
                          <b style={{ marginLeft: 4 }}>{num(w.points)} điểm</b>
                        </Tag>
                      );
                    })}
                  </Space>
                ) : (
                  <Typography.Text type="secondary">Chưa là thành viên</Typography.Text>
                ),
            },
            {
              title: 'Đăng ký',
              render: (_, c) => {
                const ws = c.wallets ?? [];
                const reg = ws.filter((w) => w.registeredAt).length;
                if (!ws.length) return <Tag>Chưa</Tag>;
                return reg === ws.length ? <Tag color="green">Đã đăng ký</Tag> : reg > 0 ? <Tag color="gold">{reg}/{ws.length}</Tag> : <Tag color="orange">Chưa</Tag>;
              },
            },
          ]}
        />
      </Card>
    </>
  );
}
