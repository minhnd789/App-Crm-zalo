import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Input,
  List,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  ImportOutlined,
  ExportOutlined,
  MinusCircleOutlined,
  ReloadOutlined,
  SendOutlined,
  UserAddOutlined,
} from '@ant-design/icons';
import { api } from '../../api/client';
import type { Customer, Paged, PosLogsPage, PosLogStatus, PosLogType, PosSyncLog } from '../../api/types';
import { useRequest } from '../../hooks/useRequest';
import { useAuth } from '../../auth/AuthContext';
import { useIsManager } from '../../auth/useIsManager';
import { PageHeader } from '../../components/PageHeader';
import { BrandDot } from '../../components/BrandBadge';
import { TierTag } from '../../components/TierTag';
import { datetime, errMsg, money, num } from '../../utils/format';

export const POS_STATUS: Record<PosLogStatus, { label: string; color: string; icon: JSX.Element; hint: string }> = {
  PENDING: { label: 'Chờ gửi', color: 'processing', icon: <ClockCircleOutlined />, hint: 'Đang chờ gửi / gửi lại tự động' },
  SUCCESS: { label: 'Thành công', color: 'success', icon: <CheckCircleOutlined />, hint: 'Đã đồng bộ' },
  FAILED: { label: 'Lỗi', color: 'error', icon: <CloseCircleOutlined />, hint: 'Gửi lại tự động thất bại / xử lý lỗi' },
  UNMATCHED: { label: 'Chưa khớp', color: 'warning', icon: <ExclamationCircleOutlined />, hint: 'Bill chưa khớp khách hoặc mã cơ sở' },
  IGNORED: { label: 'Bỏ qua', color: 'default', icon: <MinusCircleOutlined />, hint: 'Không cần xử lý' },
};

export const POS_TYPE: Record<PosLogType, string> = {
  CUSTOMER_UPSERT: 'Khách hàng',
  BILL_PAID: 'Bill thanh toán',
  BILL_VOID: 'Huỷ bill',
};

const DIRECTION = {
  OUT: { label: 'Gửi khách sang POS', short: 'CRM → POS', icon: <ExportOutlined /> },
  IN: { label: 'Nhận bill từ POS', short: 'POS → CRM', icon: <ImportOutlined /> },
} as const;

/** In JSON đẹp; nếu không phải JSON thì trả nguyên văn */
function pretty(raw: string | null) {
  if (!raw) return null;
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function parse<T>(raw: string | null): T | null {
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

interface BillPayload {
  billId?: string;
  total?: number;
  subtotal?: number;
  discount?: number;
  branchCode?: string;
  customer?: { memberCode?: string; phone?: string; posCustomerId?: string };
}
interface CustomerPayload {
  customer?: { name?: string; memberCode?: string; phone?: string };
  // payload gửi API DCorp /crm/cnv/register
  firstName?: string;
  middleName?: string;
  lastName?: string;
  phone?: string;
  organization?: number;
  customerId?: number;
}

export default function PosSyncPage() {
  const { message } = App.useApp();
  const { allBrands, brands } = useAuth();
  const isDcorp = (r: PosSyncLog) => brands.find((b) => b.id === r.brandId)?.posProvider === 'DCORP';
  const manager = useIsManager();
  const [direction, setDirection] = useState<string | undefined>();
  const [status, setStatus] = useState<PosLogStatus | undefined>();
  const [type, setType] = useState<string | undefined>();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [busy, setBusy] = useState<number | null>(null);
  const [assignFor, setAssignFor] = useState<PosSyncLog | null>(null);

  const { data, loading, reload } = useRequest(
    () => api.get<PosLogsPage>('/pos/logs', { direction, status, type, q, page, pageSize }),
    [direction, status, type, q, page, pageSize],
  );
  const counts = data?.statusCounts ?? {};
  const unmatched = counts.UNMATCHED ?? 0;

  const retry = async (log: PosSyncLog, customerId?: number) => {
    setBusy(log.id);
    try {
      const r = await api.post<PosSyncLog>(`/pos/logs/${log.id}/retry`, customerId ? { customerId } : {});
      const st = POS_STATUS[r.status];
      if (r.status === 'SUCCESS') message.success(log.direction === 'OUT' ? 'Đã gửi khách sang POS' : 'Đã xử lý bill, cộng điểm cho khách');
      else message.warning(`Kết quả: ${st?.label ?? r.status}${r.error ? ` – ${r.error}` : ''}`);
      await reload();
      return r;
    } catch (e) {
      message.error(errMsg(e));
      return undefined;
    } finally {
      setBusy(null);
    }
  };

  const filterStatus = (s: PosLogStatus | undefined) => {
    setStatus(s);
    setPage(1);
  };

  const columns: ColumnsType<PosSyncLog> = [
    {
      title: allBrands ? 'Thời gian / thương hiệu' : 'Thời gian',
      dataIndex: 'createdAt',
      width: 130,
      render: (v, r) => (
        <div style={{ lineHeight: 1.5 }}>
          {datetime(v)}
          {allBrands ? (
            <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, color: '#595959' }}>
              <BrandDot color={r.brand?.primaryColor} size={8} />
              {r.brand?.name}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      title: 'Chiều / loại',
      width: 120,
      render: (_, r) => (
        <div>
          <Tag icon={DIRECTION[r.direction].icon} color={r.direction === 'IN' ? 'geekblue' : 'purple'} style={{ marginInlineEnd: 0 }}>
            {r.direction === 'OUT' && isDcorp(r) ? 'CRM → DCorp' : DIRECTION[r.direction].short}
          </Tag>
          {r.direction === 'OUT' && isDcorp(r) ? <div style={{ fontSize: 12, color: '#1677ff' }}>DCorp RK7 CRM</div> : null}
          <div style={{ fontSize: 12, marginTop: 2 }}>{POS_TYPE[r.type] ?? r.type}</div>
        </div>
      ),
    },
    {
      title: 'Mã bill / khách',
      render: (_, r) => {
        if (r.direction === 'IN') {
          const b = parse<BillPayload>(r.payload);
          const who = b?.customer ? b.customer.memberCode || b.customer.phone || b.customer.posCustomerId : null;
          return (
            <div style={{ lineHeight: 1.5, minWidth: 180 }}>
              <Typography.Text strong className="nowrap">
                {r.externalId ?? b?.billId ?? '—'}
              </Typography.Text>
              <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                {b?.total !== undefined ? money(b.total) : b?.subtotal !== undefined ? money(b.subtotal - (b.discount ?? 0)) : ''}
                {b?.branchCode ? ` · ${b.branchCode}` : ''}
                {who ? ` · KH: ${who}` : ' · không có thông tin khách'}
              </div>
            </div>
          );
        }
        const p = parse<CustomerPayload>(r.payload);
        const c = p?.customer;
        // Payload DCorp: { firstName, middleName, lastName, phone, organization }
        const dcorpName = [p?.firstName, p?.middleName, p?.lastName].filter(Boolean).join(' ');
        const name = c?.name ?? (dcorpName || r.customer?.name) ?? `Khách #${r.externalId ?? r.customerId}`;
        const phone = c?.phone ?? p?.phone;
        return (
          <div style={{ lineHeight: 1.5 }}>
            <Typography.Text strong>{name}</Typography.Text>
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>
              {c?.memberCode ? `Mã TV ${c.memberCode}` : ''}
              {phone ? `${c?.memberCode ? ' · ' : ''}${phone}` : ''}
              {p?.organization ? ` · org ${p.organization}` : ''}
            </div>
          </div>
        );
      },
    },
    {
      title: 'Khách CRM',
      width: 140,
      render: (_, r) =>
        r.customer ? (
          <div style={{ lineHeight: 1.5 }}>
            <Link to={`/customers/${r.customer.id}`}>{r.customer.name}</Link>
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>{r.customer.phone}</div>
          </div>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: 'Hoá đơn',
      width: 120,
      render: (_, r) =>
        r.order ? (
          <div style={{ lineHeight: 1.5 }}>
            <Link to={`/orders?open=${r.order.id}`}>{r.order.code}</Link>
            <div style={{ fontSize: 12, color: r.order.status === 'CANCELLED' ? '#cf1322' : '#389e0d' }}>
              {r.order.status === 'CANCELLED' ? 'Đã huỷ' : `+${num(r.order.pointsEarned)} điểm`}
            </div>
          </div>
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: 'Trạng thái / lỗi',
      width: 210,
      render: (_, r) => {
        const st = POS_STATUS[r.status];
        return (
          <div>
            <Tag color={st?.color} icon={st?.icon} style={{ marginInlineEnd: 0 }}>
              {st?.label ?? r.status}
            </Tag>
            {parse<{ duplicate?: boolean }>(r.response)?.duplicate ? (
              <Tooltip title="POS gửi lại bill đã ghi nhận trước đó – không cộng điểm lần 2">
                <Tag style={{ marginInlineStart: 4, marginInlineEnd: 0 }}>Trùng</Tag>
              </Tooltip>
            ) : null}
            <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 2 }}>
              {r.attempts > 0 ? `${r.attempts} lần gửi` : ''}
              {r.nextRetryAt && (r.status === 'PENDING' || r.status === 'FAILED') ? (
                <Tooltip title="Lần gửi lại tự động tiếp theo">
                  <div>Gửi lại: {datetime(r.nextRetryAt)}</div>
                </Tooltip>
              ) : null}
            </div>
            {r.error ? (
              <Typography.Paragraph type="danger" style={{ fontSize: 12, margin: '2px 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }} data-testid="pos-error">
                {r.error}
              </Typography.Paragraph>
            ) : null}
          </div>
        );
      },
    },
    {
      title: '',
      width: 140,
      render: (_, r) => {
        if (!manager) return null;
        if (r.direction === 'OUT' && (r.status === 'PENDING' || r.status === 'FAILED')) {
          return (
            <Button size="small" icon={<SendOutlined />} loading={busy === r.id} onClick={() => retry(r)} data-testid="pos-resend">
              Gửi lại
            </Button>
          );
        }
        if (r.direction === 'IN' && (r.status === 'UNMATCHED' || r.status === 'FAILED')) {
          return (
            <Space direction="vertical" size={4}>
              <Popconfirm title="Xử lý lại bill này?" description="Hệ thống tìm lại khách / cơ sở theo dữ liệu bill." okText="Xử lý" cancelText="Không" onConfirm={() => retry(r)}>
                <Button size="small" icon={<ReloadOutlined />} loading={busy === r.id}>
                  Xử lý lại
                </Button>
              </Popconfirm>
              <Button size="small" type="primary" icon={<UserAddOutlined />} onClick={() => setAssignFor(r)} data-testid="pos-assign">
                Gán khách & xử lý
              </Button>
            </Space>
          );
        }
        return null;
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Đồng bộ POS"
        scoped
        subtitle="Nhật ký đồng bộ với phần mềm bán hàng r_keeper (DCorp): gửi khách hàng mới sang POS, nhận bill thanh toán / huỷ về CRM"
        extra={
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => reload()}>
            Làm mới
          </Button>
        }
      />
      {unmatched > 0 ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`Có ${num(unmatched)} bill chưa khớp khách hàng hoặc mã cơ sở`}
          description="Khách chưa được cộng điểm cho các bill này. Kiểm tra Mã POS của cơ sở, hoặc dùng “Gán khách & xử lý” để chọn đúng khách."
          action={
            <Button size="small" onClick={() => filterStatus('UNMATCHED')} data-testid="pos-show-unmatched">
              Xem bill chưa khớp
            </Button>
          }
        />
      ) : null}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {(Object.keys(POS_STATUS) as PosLogStatus[]).map((k) => {
          const st = POS_STATUS[k];
          const active = status === k;
          return (
            <Col key={k} style={{ flex: '1 1 0', minWidth: 170 }}>
              <Card
                hoverable
                size="small"
                onClick={() => filterStatus(active ? undefined : k)}
                style={{ borderColor: active ? '#d4380d' : undefined }}
                data-testid={`pos-count-${k}`}
              >
                <Statistic
                  title={
                    <Space size={6}>
                      <Tag color={st.color} icon={st.icon} style={{ marginInlineEnd: 0 }}>
                        {st.label}
                      </Tag>
                    </Space>
                  }
                  value={num(counts[k] ?? 0)}
                />
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {st.hint}
                </Typography.Text>
              </Card>
            </Col>
          );
        })}
      </Row>
      <Card>
        <Space wrap style={{ marginBottom: 16 }}>
          <Select
            allowClear
            placeholder="Chiều đồng bộ"
            style={{ width: 200 }}
            value={direction}
            onChange={(v) => {
              setDirection(v);
              setPage(1);
            }}
            options={[
              { value: 'OUT', label: DIRECTION.OUT.label },
              { value: 'IN', label: DIRECTION.IN.label },
            ]}
          />
          <Select
            allowClear
            placeholder="Trạng thái"
            style={{ width: 160 }}
            value={status}
            onChange={(v) => filterStatus(v)}
            options={(Object.keys(POS_STATUS) as PosLogStatus[]).map((k) => ({ value: k, label: POS_STATUS[k].label }))}
          />
          <Select
            allowClear
            placeholder="Loại"
            style={{ width: 170 }}
            value={type}
            onChange={(v) => {
              setType(v);
              setPage(1);
            }}
            options={(Object.keys(POS_TYPE) as PosLogType[]).map((k) => ({ value: k, label: POS_TYPE[k] }))}
          />
          <Input.Search
            allowClear
            placeholder="Tìm theo mã bill"
            style={{ width: 220 }}
            onSearch={(v) => {
              setQ(v.trim());
              setPage(1);
            }}
          />
        </Space>
        <Table<PosSyncLog>
          rowKey="id"
          loading={loading}
          dataSource={data?.items}
          columns={columns}
          scroll={{ x: 1050 }}
          locale={{ emptyText: <Empty description="Chưa có dữ liệu đồng bộ" /> }}
          expandable={{
            expandedRowRender: (r) => (
              <Row gutter={16}>
                <Col xs={24} lg={12}>
                  <Typography.Text strong>
                    {r.direction === 'IN' ? 'Dữ liệu bill nhận được' : isDcorp(r) ? 'Dữ liệu gửi DCorp (/crm/cnv/register)' : 'Dữ liệu gửi đi'}
                  </Typography.Text>
                  <pre className="json-block">{pretty(r.payload)}</pre>
                </Col>
                <Col xs={24} lg={12}>
                  <Typography.Text strong>
                    {r.direction === 'IN' ? 'Phản hồi CRM' : isDcorp(r) ? 'Phản hồi DCorp RK7 CRM' : 'Phản hồi connector'}
                  </Typography.Text>
                  <pre className="json-block">{pretty(r.response) ?? '(chưa có)'}</pre>
                </Col>
              </Row>
            ),
          }}
          pagination={{
            current: page,
            pageSize,
            total: data?.total,
            showSizeChanger: true,
            showTotal: (t) => `Tổng ${num(t)} bản ghi`,
            onChange: (p, s) => {
              setPage(p);
              setPageSize(s);
            },
          }}
        />
      </Card>
      <AssignCustomerModal
        log={assignFor}
        onClose={() => setAssignFor(null)}
        onConfirm={async (customerId) => {
          if (!assignFor) return;
          const r = await retry(assignFor, customerId);
          if (r) setAssignFor(null);
        }}
      />
    </>
  );
}

/** Tìm khách theo SĐT / mã thành viên rồi gán cho bill chưa khớp */
function AssignCustomerModal({
  log,
  onClose,
  onConfirm,
}: {
  log: PosSyncLog | null;
  onClose: () => void;
  onConfirm: (customerId: number) => Promise<void>;
}) {
  const [results, setResults] = useState<Customer[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const bill = log ? parse<BillPayload>(log.payload) : null;

  const search = async (q: string) => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const res = await api.get<Paged<Customer>>('/customers', { q: q.trim(), pageSize: 10 });
      setResults(res.items);
      setSelected(res.items.length === 1 ? res.items[0] : null);
    } finally {
      setSearching(false);
    }
  };

  return (
    <Modal
      title={log ? `Gán khách cho bill ${log.externalId ?? ''}` : ''}
      open={!!log}
      onCancel={onClose}
      okText="Gán khách & xử lý"
      cancelText="Huỷ"
      okButtonProps={{ disabled: !selected }}
      confirmLoading={saving}
      destroyOnHidden
      afterClose={() => {
        setResults(null);
        setSelected(null);
      }}
      onOk={async () => {
        if (!selected) return;
        setSaving(true);
        try {
          await onConfirm(selected.id);
        } finally {
          setSaving(false);
        }
      }}
    >
      {bill ? (
        <Typography.Paragraph type="secondary">
          Bill {bill.billId}: {bill.total !== undefined ? money(bill.total) : ''}
          {bill.branchCode ? ` · mã cơ sở ${bill.branchCode}` : ''}. Khách được chọn sẽ được cộng điểm và chi tiêu cho bill này.
        </Typography.Paragraph>
      ) : null}
      <Input.Search
        placeholder="SĐT hoặc mã thành viên"
        enterButton="Tìm"
        loading={searching}
        onSearch={search}
        autoFocus
        data-testid="pos-assign-search"
      />
      {results ? (
        results.length === 0 ? (
          <Empty style={{ marginTop: 16 }} description="Không tìm thấy khách hàng" />
        ) : (
          <List
            style={{ marginTop: 12 }}
            bordered
            size="small"
            dataSource={results}
            renderItem={(c) => (
              <List.Item
                onClick={() => setSelected(c)}
                style={{ cursor: 'pointer', background: selected?.id === c.id ? '#fff7e6' : undefined }}
                data-testid="pos-assign-item"
              >
                <List.Item.Meta
                  title={
                    <Space>
                      {c.name}
                      <TierTag tier={c.tier} />
                      {selected?.id === c.id ? <Tag color="orange">Đã chọn</Tag> : null}
                    </Space>
                  }
                  description={`${c.phone ?? 'Chưa có SĐT'} · Mã TV ${c.memberCode}`}
                />
              </List.Item>
            )}
          />
        )
      ) : null}
    </Modal>
  );
}
