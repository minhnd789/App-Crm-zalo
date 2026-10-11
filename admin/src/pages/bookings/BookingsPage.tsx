import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Table,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CheckOutlined, CloseOutlined, LoginOutlined, PlusCircleOutlined, ReloadOutlined, UserDeleteOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { api } from '../../api/client';
import type { Booking, BookingStatus, Paged } from '../../api/types';
import { useRequest } from '../../hooks/useRequest';
import { useBranches } from '../../hooks/useCatalog';
import { PageHeader } from '../../components/PageHeader';
import { BOOKING_STATUS, StatusTag } from '../../components/StatusTag';
import { datetime, errMsg, num, time } from '../../utils/format';

type Range = [Dayjs, Dayjs] | null;

const defaultRange = (): [Dayjs, Dayjs] => [dayjs().startOf('day'), dayjs().add(7, 'day').startOf('day')];

export default function BookingsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const branches = useBranches();
  const [range, setRange] = useState<Range>(params.get('range') === 'all' ? null : defaultRange());
  const [status, setStatus] = useState<string | undefined>(params.get('status') || undefined);
  const [branchId, setBranchId] = useState<number | undefined>();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [view, setView] = useState<'list' | 'day'>('list');
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Tính from/to theo giờ địa phương rồi đổi sang ISO (UTC); "to" là đầu ngày kế tiếp (lt)
  const from = range ? range[0].startOf('day').toISOString() : undefined;
  const to = range ? range[1].add(1, 'day').startOf('day').toISOString() : undefined;

  const { data, loading, reload } = useRequest(
    () => api.get<Paged<Booking>>('/bookings', { from, to, status, branchId, q, page, pageSize, order: 'asc' }),
    [from, to, status, branchId, q, page, pageSize],
  );

  const update = async (b: Booking, next: BookingStatus, extra: { adminNote?: string | null; notify?: boolean } = {}) => {
    setBusyId(b.id);
    try {
      await api.patch(`/bookings/${b.id}`, { status: next, ...extra });
      message.success(`${b.code}: ${BOOKING_STATUS[next].label}`);
      await reload();
    } catch (e) {
      message.error(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const createOrderLink = (b: Booking) =>
    `/orders/new?customer=${encodeURIComponent(b.customer?.memberCode || b.customer?.phone || b.contactPhone)}&booking=${b.id}`;

  const actions = (b: Booking) => {
    const busy = busyId === b.id;
    switch (b.status) {
      case 'PENDING':
        return (
          <Space size={4} wrap>
            <Button size="small" type="primary" icon={<CheckOutlined />} loading={busy} onClick={() => update(b, 'CONFIRMED')}>
              Xác nhận
            </Button>
            <Button size="small" danger icon={<CloseOutlined />} disabled={busy} onClick={() => setCancelTarget(b)}>
              Huỷ
            </Button>
          </Space>
        );
      case 'CONFIRMED':
        return (
          <Space size={4} wrap>
            <Button size="small" type="primary" icon={<LoginOutlined />} loading={busy} onClick={() => update(b, 'ARRIVED')}>
              Khách đã đến
            </Button>
            <Popconfirm title="Đánh dấu khách không đến?" okText="Đồng ý" cancelText="Không" onConfirm={() => update(b, 'NO_SHOW')}>
              <Button size="small" icon={<UserDeleteOutlined />} disabled={busy}>
                Không đến
              </Button>
            </Popconfirm>
            <Button size="small" danger icon={<CloseOutlined />} disabled={busy} onClick={() => setCancelTarget(b)}>
              Huỷ
            </Button>
          </Space>
        );
      case 'ARRIVED':
        return (
          <Space size={4} wrap>
            <Button size="small" type="primary" icon={<PlusCircleOutlined />} onClick={() => navigate(createOrderLink(b))}>
              Tạo hoá đơn
            </Button>
            <Popconfirm
              title="Hoàn thành mà không tạo hoá đơn?"
              description="Khách sẽ không được tích điểm cho lần ghé này."
              okText="Hoàn thành"
              cancelText="Không"
              onConfirm={() => update(b, 'COMPLETED', { notify: false })}
            >
              <Button size="small" disabled={busy}>
                Hoàn thành
              </Button>
            </Popconfirm>
          </Space>
        );
      default:
        return <Typography.Text type="secondary">—</Typography.Text>;
    }
  };

  const columns: ColumnsType<Booking> = [
    {
      title: 'Thời gian',
      dataIndex: 'bookingTime',
      width: 140,
      render: (v) => (
        <span className="nowrap">
          <b>{time(v)}</b> {dayjs(v).format('DD/MM/YYYY')}
        </span>
      ),
    },
    { title: 'Mã', dataIndex: 'code', width: 110, render: (v) => <span className="nowrap">{v}</span> },
    {
      title: 'Khách',
      render: (_, b) => (
        <>
          <Link to={`/customers/${b.customerId}`}>{b.contactName}</Link>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>
            {b.contactPhone}
            {b.customer && b.customer.name !== b.contactName ? ` · TK: ${b.customer.name}` : ''}
          </div>
        </>
      ),
    },
    { title: 'Số người', dataIndex: 'partySize', align: 'center', width: 90 },
    { title: 'Chi nhánh', render: (_, b) => b.branch?.name, width: 140 },
    {
      title: 'Ghi chú',
      render: (_, b) => (
        <div style={{ maxWidth: 200 }}>
          {b.note ? <div>{b.note}</div> : null}
          {b.adminNote ? (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              NH: {b.adminNote}
            </Typography.Text>
          ) : null}
          {!b.note && !b.adminNote ? '—' : null}
        </div>
      ),
    },
    { title: 'Trạng thái', dataIndex: 'status', width: 120, render: (s) => <StatusTag kind="booking" status={s} /> },
    { title: 'Thao tác', width: 220, render: (_, b) => actions(b) },
  ];

  const grouped = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of data?.items ?? []) {
      const k = dayjs(b.bookingTime).format('YYYY-MM-DD');
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(b);
    }
    return [...m.entries()];
  }, [data]);

  const isToday = !!range && range[0].isSame(dayjs(), 'day') && range[1].isSame(dayjs(), 'day');

  return (
    <>
      <PageHeader
        title="Đặt bàn"
        subtitle={data ? `${num(data.total)} lịch đặt bàn` : undefined}
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => reload()} loading={loading}>
            Làm mới
          </Button>
        }
      />
      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Segmented
            value={isToday ? 'today' : range ? 'range' : 'all'}
            onChange={(v) => {
              setPage(1);
              if (v === 'today') setRange([dayjs().startOf('day'), dayjs().startOf('day')]);
              else if (v === 'range') setRange(defaultRange());
              else setRange(null);
            }}
            options={[
              { label: 'Hôm nay', value: 'today' },
              { label: '7 ngày tới', value: 'range' },
              { label: 'Tất cả', value: 'all' },
            ]}
          />
          <DatePicker.RangePicker
            format="DD/MM/YYYY"
            value={range}
            onChange={(v) => {
              setPage(1);
              setRange(v && v[0] && v[1] ? [v[0], v[1]] : null);
            }}
            placeholder={['Từ ngày', 'Đến ngày']}
          />
          <Select
            allowClear
            placeholder="Trạng thái"
            style={{ width: 160 }}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            options={Object.entries(BOOKING_STATUS).map(([value, s]) => ({ value, label: s.label }))}
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
          <Input.Search
            allowClear
            placeholder="Mã, tên, SĐT"
            style={{ width: 220 }}
            onSearch={(v) => {
              setQ(v.trim());
              setPage(1);
            }}
          />
          <Segmented
            value={view}
            onChange={(v) => setView(v as 'list' | 'day')}
            options={[
              { label: 'Danh sách', value: 'list' },
              { label: 'Theo ngày', value: 'day' },
            ]}
          />
        </Space>

        {view === 'list' ? (
          <Table<Booking>
            rowKey="id"
            loading={loading}
            dataSource={data?.items}
            columns={columns}
            scroll={{ x: 1080 }}
            pagination={{
              current: page,
              pageSize,
              total: data?.total,
              showSizeChanger: true,
              pageSizeOptions: [20, 50, 100],
              showTotal: (t) => `Tổng ${num(t)} lịch`,
              onChange: (p, s) => {
                setPage(p);
                setPageSize(s);
              },
            }}
          />
        ) : grouped.length === 0 ? (
          <Empty description="Không có lịch đặt bàn" />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            {grouped.map(([day, list]) => {
              const guests = list.filter((b) => b.status !== 'CANCELLED').reduce((s, b) => s + b.partySize, 0);
              const d = dayjs(day);
              return (
                <Card
                  key={day}
                  size="small"
                  type="inner"
                  title={
                    <span style={{ textTransform: 'capitalize' }}>
                      {d.format('dddd, DD/MM/YYYY')}
                      {d.isSame(dayjs(), 'day') ? ' (hôm nay)' : ''}
                    </span>
                  }
                  extra={
                    <Tooltip title="Không tính lịch đã huỷ">
                      <span>
                        {list.length} lịch · {guests} khách
                      </span>
                    </Tooltip>
                  }
                >
                  <Table<Booking> rowKey="id" size="small" pagination={false} dataSource={list} columns={columns} scroll={{ x: 1080 }} />
                </Card>
              );
            })}
            {data && data.total > data.items.length ? (
              <Typography.Text type="secondary">
                Đang hiển thị {data.items.length}/{data.total} lịch – chuyển sang "Danh sách" để xem các trang tiếp theo.
              </Typography.Text>
            ) : null}
          </Space>
        )}
      </Card>

      <CancelModal
        booking={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={async (adminNote, notify) => {
          if (!cancelTarget) return;
          await update(cancelTarget, 'CANCELLED', { adminNote: adminNote || null, notify });
          setCancelTarget(null);
        }}
      />
    </>
  );
}

function CancelModal({
  booking,
  onClose,
  onConfirm,
}: {
  booking: Booking | null;
  onClose: () => void;
  onConfirm: (adminNote: string, notify: boolean) => Promise<void>;
}) {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      title={booking ? `Huỷ lịch đặt bàn ${booking.code}` : ''}
      open={!!booking}
      onCancel={onClose}
      okText="Huỷ lịch"
      okButtonProps={{ danger: true }}
      cancelText="Đóng"
      confirmLoading={saving}
      destroyOnHidden
      onOk={() => form.submit()}
    >
      {booking ? (
        <Typography.Paragraph>
          {booking.contactName} – {booking.partySize} khách lúc {datetime(booking.bookingTime)} tại {booking.branch?.name}
        </Typography.Paragraph>
      ) : null}
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{ adminNote: booking?.adminNote ?? '', notify: true }}
        onFinish={async (v: { adminNote: string; notify: boolean }) => {
          setSaving(true);
          try {
            await onConfirm(v.adminNote?.trim() ?? '', v.notify);
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form.Item name="adminNote" label="Lý do / ghi chú (không bắt buộc)">
          <Input.TextArea rows={3} maxLength={1000} placeholder="VD: Nhà hàng hết bàn khung giờ này" />
        </Form.Item>
        <Form.Item name="notify" valuePropName="checked">
          <Checkbox>Gửi thông báo cho khách qua Zalo OA (nếu khách đã quan tâm OA)</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}
