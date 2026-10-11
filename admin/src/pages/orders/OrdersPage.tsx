import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Card, Col, DatePicker, Input, Row, Select, Space, Statistic, Table } from 'antd';
import { PlusCircleOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import { api } from '../../api/client';
import type { Order, OrdersPage as OrdersPageData } from '../../api/types';
import { useRequest } from '../../hooks/useRequest';
import { useBranches } from '../../hooks/useCatalog';
import { PageHeader } from '../../components/PageHeader';
import { ORDER_STATUS, StatusTag } from '../../components/StatusTag';
import { OrderDrawer } from '../../components/OrderDrawer';
import { datetime, money, num } from '../../utils/format';

export default function OrdersPage() {
  const [params, setParams] = useSearchParams();
  const branches = useBranches();
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

  return (
    <>
      <PageHeader
        title="Hoá đơn / Tích điểm" scoped
        extra={
          <Link to="/orders/new">
            <Button type="primary" icon={<PlusCircleOutlined />}>
              Tạo hoá đơn
            </Button>
          </Link>
        }
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
          <Select
            allowClear
            placeholder="Chi nhánh"
            style={{ width: 200 }}
            value={branchId}
            onChange={(v) => {
              setBranchId(v);
              setPage(1);
            }}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
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
          scroll={{ x: 1000 }}
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
          columns={[
            { title: 'Mã', dataIndex: 'code', render: (v) => <a>{v}</a> },
            { title: 'Thời gian', dataIndex: 'createdAt', render: (v) => <span className="nowrap">{datetime(v)}</span> },
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
            { title: 'Chi nhánh', render: (_, o) => o.branch?.name ?? '—' },
            { title: 'Tạm tính', dataIndex: 'subtotal', align: 'right', render: money },
            { title: 'Giảm', align: 'right', render: (_, o) => (o.discount + o.voucherDiscount > 0 ? `-${money(o.discount + o.voucherDiscount)}` : '—') },
            { title: 'Khách trả', dataIndex: 'total', align: 'right', render: (v) => <b>{money(v)}</b> },
            { title: 'Điểm', dataIndex: 'pointsEarned', align: 'right', render: (v) => `+${num(v)}` },
            { title: 'Nhân viên', render: (_, o) => o.createdBy?.name ?? '—' },
            { title: 'Trạng thái', dataIndex: 'status', render: (s) => <StatusTag kind="order" status={s} /> },
          ]}
        />
      </Card>
      <OrderDrawer orderId={openId} onClose={() => setOpen(null)} onChanged={() => reload()} />
    </>
  );
}
