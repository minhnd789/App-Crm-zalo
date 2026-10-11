import { Button, Card, Col, Empty, Row, Segmented, Skeleton, Statistic, Table, Typography } from 'antd';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  GiftOutlined,
  ReloadOutlined,
  RiseOutlined,
  TeamOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import dayjs from 'dayjs';
import { api } from '../api/client';
import type { Booking, Dashboard, Order } from '../api/types';
import { useRequest } from '../hooks/useRequest';
import { useAuth } from '../auth/AuthContext';
import { datetime, money, num } from '../utils/format';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import { BranchSelect, LocationText } from '../components/BrandBadge';

const PRIMARY = '#d4380d';

const compactMoney = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);

function StatCard({ title, value, icon, suffix, to }: { title: string; value: ReactNode; icon: ReactNode; suffix?: ReactNode; to?: string }) {
  const body = (
    <Card className="stat-card" hoverable={!!to} styles={{ body: { padding: 20 } }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Statistic title={title} value={value as string} />
        <div style={{ fontSize: 22, color: PRIMARY, background: '#fff2e8', borderRadius: 10, padding: '6px 10px' }}>{icon}</div>
      </div>
      {suffix ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {suffix}
        </Typography.Text>
      ) : null}
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export default function DashboardPage() {
  const { brand, allBrands } = useAuth();
  const [branchId, setBranchId] = useState<number | undefined>();
  const { data, loading, reload } = useRequest(() => api.get<Dashboard>('/dashboard', { branchId }), [branchId]);
  const [metric, setMetric] = useState<'revenue' | 'orders'>('revenue');

  const header = (
    <PageHeader
      title={`Tổng quan – ${brand ? brand.name : 'Tất cả thương hiệu'}`}
      subtitle={`Cập nhật lúc ${dayjs().format('HH:mm DD/MM/YYYY')}`}
      extra={
        <>
          <BranchSelect
            allowClear
            placeholder="Tất cả cơ sở"
            style={{ width: 280 }}
            value={branchId}
            onChange={(v) => setBranchId(v ?? undefined)}
            data-testid="dashboard-branch"
          />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => reload()}>
            Làm mới
          </Button>
        </>
      }
    />
  );

  if (!data) return (
    <>
      {header}
      <Skeleton active paragraph={{ rows: 12 }} />
    </>
  );

  const chartData = data.revenueByDay.map((d) => ({ ...d, label: dayjs(d.date).format('DD/MM') }));
  const tierData = data.tierDistribution.filter((t) => t.count > 0);
  const byBrand = data.revenueByBrand ?? [];
  const byBranch = [...(data.revenueByBranch ?? [])].sort((a, b) => b.revenue - a.revenue);
  const branchTotal = byBranch.reduce((s, b) => s + b.revenue, 0);
  const membersLabel = allBrands && !branchId ? 'Khách hàng (mọi thương hiệu)' : 'Thành viên';

  return (
    <>
      {header}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard title={membersLabel} value={num(data.totalCustomers)} icon={<TeamOutlined />} to="/customers" />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard title="Mới hôm nay" value={num(data.newCustomersToday)} icon={<UserAddOutlined />} />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard title="Đặt bàn hôm nay" value={num(data.bookingsToday)} icon={<CalendarOutlined />} to="/bookings" />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard
            title="Đặt bàn chờ xác nhận"
            value={num(data.pendingBookings)}
            icon={<ClockCircleOutlined />}
            to="/bookings?status=PENDING&range=all"
          />
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <StatCard title="Doanh thu hôm nay" value={money(data.revenueToday)} icon={<DollarOutlined />} suffix={`${data.ordersToday} hoá đơn`} />
        </Col>
        <Col xs={24} sm={12} xl={8}>
          <StatCard title="Doanh thu tháng này" value={money(data.revenueMonth)} icon={<RiseOutlined />} suffix={`${data.ordersMonth} hoá đơn`} />
        </Col>
        <Col xs={24} sm={24} xl={8}>
          <StatCard title="Voucher đã dùng trong tháng" value={num(data.vouchersUsedMonth)} icon={<GiftOutlined />} to="/vouchers" />
        </Col>

        {allBrands && !branchId ? (
          <Col xs={24} xl={10}>
            <Card title="Doanh thu tháng này theo thương hiệu" style={{ height: '100%' }}>
              {byBrand.length === 0 ? (
                <Empty description="Chưa có thương hiệu" />
              ) : (
                <div style={{ width: '100%', height: Math.max(160, byBrand.length * 56 + 40) }} data-testid="revenue-by-brand">
                  <ResponsiveContainer>
                    <BarChart data={byBrand} layout="vertical" margin={{ top: 4, right: 80, left: 8, bottom: 4 }} barCategoryGap={12}>
                      <CartesianGrid horizontal={false} stroke="#f0f0f0" />
                      <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#8c8c8c' }} tickFormatter={compactMoney} />
                      <YAxis type="category" dataKey="name" width={120} tickLine={false} axisLine={false} tick={{ fontSize: 13, fill: '#262626' }} />
                      <Tooltip
                        cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                        formatter={(v, _n, item) => [`${money(Number(v))} · ${(item.payload as { orders: number }).orders} hoá đơn`, 'Doanh thu']}
                      />
                      <Bar isAnimationActive={false} dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={28}>
                        {byBrand.map((b) => (
                          <Cell key={b.id} fill={b.primaryColor} />
                        ))}
                        <LabelList dataKey="revenue" position="right" formatter={(v: unknown) => money(Number(v))} style={{ fontSize: 12, fill: '#595959' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
          </Col>
        ) : null}
        <Col xs={24} xl={allBrands && !branchId ? 14 : 24}>
          <Card title="Doanh thu tháng này theo cơ sở" style={{ height: '100%' }}>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={byBranch}
              locale={{ emptyText: 'Chưa có cơ sở' }}
              columns={[
                {
                  title: 'Cơ sở',
                  render: (_, r) => <LocationText branch={{ name: r.name, brandId: r.brandId, brand: { id: r.brandId, name: r.brandName } }} />,
                },
                { title: 'Hoá đơn', dataIndex: 'orders', align: 'right' },
                { title: 'Doanh thu', dataIndex: 'revenue', align: 'right', render: money },
                {
                  title: 'Tỉ trọng',
                  width: 160,
                  render: (_, r) => {
                    const pct = branchTotal ? Math.round((r.revenue / branchTotal) * 100) : 0;
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: '#f0f0f0', borderRadius: 3 }}>
                          <div style={{ width: `${pct}%`, height: 6, background: PRIMARY, borderRadius: 3 }} />
                        </div>
                        <span style={{ width: 34, textAlign: 'right', color: '#8c8c8c', fontSize: 12 }}>{pct}%</span>
                      </div>
                    );
                  },
                },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} xl={16}>
          <Card
            title="Doanh thu 30 ngày gần nhất"
            extra={
              <Segmented
                size="small"
                value={metric}
                onChange={(v) => setMetric(v as 'revenue' | 'orders')}
                options={[
                  { label: 'Doanh thu', value: 'revenue' },
                  { label: 'Số hoá đơn', value: 'orders' },
                ]}
              />
            }
          >
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barCategoryGap={2}>
                  <CartesianGrid vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: '#d9d9d9' }} tick={{ fontSize: 11, fill: '#8c8c8c' }} interval="preserveStartEnd" minTickGap={12} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={metric === 'revenue' ? 64 : 32}
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#8c8c8c' }}
                    tickFormatter={(v: number) => (metric === 'revenue' ? compactMoney(v) : String(v))}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                    formatter={(v) => [metric === 'revenue' ? money(Number(v)) : `${v} hoá đơn`, metric === 'revenue' ? 'Doanh thu' : 'Số hoá đơn']}
                    labelFormatter={(l) => `Ngày ${l}`}
                  />
                  <Bar isAnimationActive={false} dataKey={metric} fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card title="Phân bố hạng" style={{ height: '100%' }}>
            {tierData.length === 0 ? (
              <Empty description="Chưa có khách hàng" />
            ) : (
              <div style={{ width: '100%', height: 300 }}>
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      isAnimationActive={false}
                      data={tierData}
                      dataKey="count"
                      nameKey="name"
                      innerRadius="55%"
                      outerRadius="85%"
                      paddingAngle={tierData.length > 1 ? 2 : 0}
                      stroke="#fff"
                      strokeWidth={2}
                      label={({ value }) => num(Number(value))}
                    >
                      {tierData.map((t) => (
                        <Cell key={t.id} fill={t.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [`${num(Number(v))} khách`, n]} />
                    <Legend verticalAlign="bottom" iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        </Col>

        <Col xs={24} xl={12}>
          <Card title="Lịch đặt bàn sắp tới" extra={<Link to="/bookings">Xem tất cả</Link>}>
            <Table<Booking>
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={data.upcomingBookings}
              locale={{ emptyText: 'Không có lịch đặt bàn sắp tới' }}
              columns={[
                { title: 'Thời gian', dataIndex: 'bookingTime', render: (v) => <span className="nowrap">{datetime(v)}</span> },
                {
                  title: 'Khách',
                  render: (_, b) => (
                    <>
                      <Link to={`/customers/${b.customerId}`}>{b.contactName}</Link>
                      <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                        {b.contactPhone} · {b.partySize} người
                      </div>
                    </>
                  ),
                },
                { title: 'Cơ sở', render: (_, b) => <LocationText branch={b.branch ? { ...b.branch, brand: b.brand } : null} brandId={b.brandId} /> },
                { title: 'Trạng thái', dataIndex: 'status', render: (s) => <StatusTag kind="booking" status={s} /> },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="Hoá đơn gần đây" extra={<Link to="/orders">Xem tất cả</Link>}>
            <Table<Order>
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={data.recentOrders}
              locale={{ emptyText: 'Chưa có hoá đơn' }}
              columns={[
                { title: 'Mã', dataIndex: 'code', render: (v, o) => <Link to={`/orders?open=${o.id}`}>{v}</Link> },
                {
                  title: 'Khách',
                  render: (_, o) => (o.customer ? <Link to={`/customers/${o.customer.id}`}>{o.customer.name}</Link> : '—'),
                },
                { title: 'Cơ sở', render: (_, o) => <LocationText branch={o.branch ? { ...o.branch, brand: o.brand } : null} brandId={o.brandId} /> },
                { title: 'Tổng tiền', dataIndex: 'total', align: 'right', render: (v) => money(v) },
                { title: 'Điểm', dataIndex: 'pointsEarned', align: 'right', render: (v) => `+${num(v)}` },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}
