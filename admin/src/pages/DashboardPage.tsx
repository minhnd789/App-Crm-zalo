import { Card, Col, Empty, Row, Segmented, Skeleton, Statistic, Table, Typography } from 'antd';
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
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import dayjs from 'dayjs';
import { api } from '../api/client';
import type { Booking, Dashboard, Order } from '../api/types';
import { useRequest } from '../hooks/useRequest';
import { datetime, money, num } from '../utils/format';
import { PageHeader } from '../components/PageHeader';
import { StatusTag } from '../components/StatusTag';
import { Button } from 'antd';
import { useAuth } from '../auth/AuthContext';

const PRIMARY = '#d4380d';

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
  const { brand } = useAuth();
  const { data, loading, reload } = useRequest(() => api.get<Dashboard>('/dashboard'), []);
  const [metric, setMetric] = useState<'revenue' | 'orders'>('revenue');

  if (!data) return <Skeleton active paragraph={{ rows: 12 }} />;

  const chartData = data.revenueByDay.map((d) => ({ ...d, label: dayjs(d.date).format('DD/MM') }));
  const tierData = data.tierDistribution.filter((t) => t.count > 0);

  return (
    <>
      <PageHeader
        title={`Tổng quan${brand ? ` – ${brand.name}` : ''}`}
        subtitle={`Cập nhật lúc ${dayjs().format('HH:mm DD/MM/YYYY')}`}
        extra={
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => reload()}>
            Làm mới
          </Button>
        }
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={6}>
          <StatCard title="Thành viên của thương hiệu" value={num(data.totalCustomers)} icon={<TeamOutlined />} to="/customers?onlyBrand=true" />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <StatCard title="Thành viên mới hôm nay" value={num(data.newCustomersToday)} icon={<UserAddOutlined />} />
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
                    tickFormatter={(v: number) =>
                      metric === 'revenue' ? (v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('vi-VN')}tr` : v >= 1000 ? `${v / 1000}k` : String(v)) : String(v)
                    }
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
          <Card title="Phân bố hạng (thành viên thương hiệu)" style={{ height: '100%' }}>
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
                      <div style={{ fontSize: 12, color: '#8c8c8c' }}>{b.contactPhone}</div>
                    </>
                  ),
                },
                { title: 'Số khách', dataIndex: 'partySize', align: 'center' },
                { title: 'Chi nhánh', render: (_, b) => b.branch?.name },
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
                { title: 'Tổng tiền', dataIndex: 'total', align: 'right', render: (v) => money(v) },
                { title: 'Điểm', dataIndex: 'pointsEarned', align: 'right', render: (v) => `+${num(v)}` },
                { title: 'Thời gian', dataIndex: 'createdAt', render: (v) => <span className="nowrap">{datetime(v)}</span> },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}
