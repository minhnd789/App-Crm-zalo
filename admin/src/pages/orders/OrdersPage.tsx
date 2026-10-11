import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Col, DatePicker, Input, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { api } from '../../api/client';
import type { Order, OrdersPage as OrdersPageData } from '../../api/types';
import { useRequest } from '../../hooks/useRequest';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/PageHeader';
import { ORDER_STATUS, StatusTag } from '../../components/StatusTag';
import { OrderDrawer } from '../../components/OrderDrawer';
import { BranchSelect, BrandTag, LocationText } from '../../components/BrandBadge';
import { datetime, money, num } from '../../utils/format';

export const ORDER_SOURCE: Record<string, { label: string; color: string }> = {
  POS: { label: 'POS', color: 'geekblue' },
  ADMIN: { label: 'Thủ công', color: 'default' },
};

export default function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const { allBrands } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [branchId, setBranchId] = useState<number | undefined>();
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const customerId = params.get('customerId') ? Number(params.get('customerId')) : undefined;
  const openId = params.get('open') ? Number(params.get('open')) : null;

  const from = range ? range[0].startOf('day').toISOString() : undefined;
  const to = range ? range[1].add(1, 'day').startOf('day').toISOString() : undefined;

  const { data, loading, reload } = useRequest(
    () => api.get<OrdersPageData>('/orders', { q, status, branchId, customerId, from, to, page, pageSize }),
    [q, status, branchId, customerId, from, to, page, pageSize],
  );

  const setOpen = (id: number | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set('open', String(id));
    else p.delete('open');
    setParams(p, { replace: true });
  };

  const columns: ColumnsType<Order> = [
    {
      title: 'Mã / Mã HĐ POS',
      dataIndex: 'code',
      render: (v: string, o) => (
        <div className="nowrap">
          <a>{v}</a>
          <div style={{ marginTop: 2 }}>
            <Tag color={ORDER_SOURCE[o.source ?? 'ADMIN']?.color} style={{ fontSize: 11, lineHeight: '16px', paddingInline: 4 }}>
              {ORDER_SOURCE[o.source ?? 'ADMIN']?.label ?? o.source}
            </Tag>
            {o.externalId ? <Typography.Text style={{ fontSize: 12 }}>{o.externalId}</Typography.Text> : null}
          </div>
        </div>
      ),
    },
    { title: 'Thời gian', dataIndex: 'createdAt', width: 100, render: (v) => <span>{datetime(v)}</span> },
    ...(allBrands ? ([{ title: 'Thương hiệu', render: (_, o) => <BrandTag brand={o.brand} brandId={o.brandId} /> }] as ColumnsType<Order>) : []),
    {
      title: 'Cơ sở',
      render: (_, o) => <span className="nowrap">{o.branch ? allBrands ? o.branch.name : <LocationText branch={o.branch} brandId={o.brandId} /> : '—'}</span>,
    },
    {
      title: 'Khách hàng',
      render: (_, o) =>
        o.customer ? (
          <span onClick={(e) => e.stopPropagation()}>
            <Link to={`/customers/${o.customer.id}`}>{o.customer.name}</Link>
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>{o.customer.phone}</div>
          </span>
        ) : (
          '—'
        ),
    },
    { title: 'Giảm', align: 'right', render: (_, o) => (o.discount + o.voucherDiscount > 0 ? `-${money(o.discount + o.voucherDiscount)}` : '—') },
    { title: 'Khách trả', dataIndex: 'total', align: 'right', render: (v) => <b>{money(v)}</b> },
    { title: 'Điểm', dataIndex: 'pointsEarned', align: 'right', render: (v) => `+${num(v)}` },
    { title: 'Trạng thái', dataIndex: 'status', render: (s) => <StatusTag kind="order" status={s} /> },
  ];

  return (
    <>
      <PageHeader title="Hoá đơn" scoped subtitle="Lịch sử hoá đơn và điểm đã tích" />
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Hoá đơn được đồng bộ từ phần mềm bán hàng (r_keeper)"
        description="Trang quản trị không tạo hoá đơn. Điểm được cộng tự động khi hoá đơn đồng bộ về; Quản lý có thể huỷ hoá đơn sai để hoàn điểm."
      />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Số hoá đơn" value={num(data?.total)} loading={!data} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Tổng doanh thu (không tính hoá đơn huỷ)" value={money(data?.sumTotal)} loading={!data} />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card>
            <Statistic title="Tổng điểm đã tích" value={num(data?.sumPoints)} loading={!data} />
          </Card>
        </Col>
      </Row>
      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input.Search
            allowClear
            placeholder="Mã hoá đơn, tên, SĐT khách"
            style={{ width: 260 }}
            onSearch={(v) => {
              setQ(v.trim());
              setPage(1);
            }}
          />
          <DatePicker.RangePicker
            format="DD/MM/YYYY"
            value={range}
            onChange={(v) => {
              setRange(v && v[0] && v[1] ? [v[0], v[1]] : null);
              setPage(1);
            }}
            placeholder={['Từ ngày', 'Đến ngày']}
          />
          <BranchSelect
            allowClear
            placeholder="Tất cả cơ sở"
            style={{ width: 260 }}
            value={branchId}
            onChange={(v) => {
              setBranchId(v ?? undefined);
              setPage(1);
            }}
          />
          <Select
            allowClear
            placeholder="Trạng thái"
            style={{ width: 150 }}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={Object.entries(ORDER_STATUS).map(([value, s]) => ({ value, label: s.label }))}
          />
          {customerId ? (
            <Button
              onClick={() => {
                const p = new URLSearchParams(params);
                p.delete('customerId');
                setParams(p);
              }}
            >
              Bỏ lọc khách #{customerId}
            </Button>
          ) : null}
        </Space>
        <Table<Order>
          rowKey="id"
          loading={loading}
          dataSource={data?.items}
          scroll={{ x: 1080 }}
          onRow={(o) => ({ onClick: () => setOpen(o.id), style: { cursor: 'pointer' } })}
          pagination={{
            current: page,
            pageSize,
            total: data?.total,
            showSizeChanger: true,
            showTotal: (t) => `Tổng ${num(t)} hoá đơn`,
            onChange: (p, s) => {
              setPage(p);
              setPageSize(s);
            },
          }}
          columns={columns}
        />
      </Card>
      <OrderDrawer orderId={openId} onClose={() => setOpen(null)} onChanged={() => reload()} />
    </>
  );
}
