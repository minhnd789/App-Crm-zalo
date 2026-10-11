import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  App,
  Avatar,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  Radio,
  Result,
  Row,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { InputRef } from 'antd';
import { CrownOutlined, DeleteOutlined, PlusOutlined, QrcodeOutlined, SearchOutlined, UserOutlined, SwapOutlined } from '@ant-design/icons';
import { api } from '../../api/client';
import type { CustomerLookup, Order, Settings, Voucher, VoucherCheck } from '../../api/types';
import { useBranches } from '../../hooks/useCatalog';
import { useRequest } from '../../hooks/useRequest';
import { PageHeader } from '../../components/PageHeader';
import { TierTag } from '../../components/TierTag';
import { StatusTag } from '../../components/StatusTag';
import { QrScanModal } from '../../components/QrScanModal';
import { date, datetime, errMsg, money, moneyInput, num } from '../../utils/format';
import { discountText, voucherDiscount } from '../../utils/voucher';

interface ItemRow {
  key: number;
  name: string;
  quantity: number;
  price: number;
}

interface ChosenVoucher {
  code: string;
  voucher: Voucher;
  /** chủ sở hữu (khi nhập mã tay) */
  ownerId: number;
  ownerName?: string;
  invalidReason: string | null;
}

const LAST_BRANCH_KEY = 'crm_admin_last_branch';
let rowSeq = 1;
const emptyRow = (): ItemRow => ({ key: rowSeq++, name: '', quantity: 1, price: 0 });

/** Lấy mã thành viên từ nội dung QR (có thể là mã thuần hoặc chuỗi chứa mã) */
function parseQr(text: string) {
  const t = text.trim();
  const m = t.match(/\b\d{10}\b/);
  return m ? m[0] : t;
}

export default function OrderCreatePage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const branches = useBranches();
  const { data: settings } = useRequest(() => api.get<Settings>('/settings'), []);
  const pointPerAmount = Number(settings?.pointPerAmount ?? 10000) || 10000;

  // Bước 1 – tìm khách
  const [query, setQuery] = useState(params.get('customer') ?? '');
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerLookup | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const queryRef = useRef<InputRef>(null);

  // Bước 2 – hoá đơn
  const [branchId, setBranchId] = useState<number | undefined>();
  const [bookingId, setBookingId] = useState<number | undefined>();
  const [totalOnly, setTotalOnly] = useState(false);
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [subtotalInput, setSubtotalInput] = useState<number | null>(null);
  const [discountInput, setDiscountInput] = useState<number | null>(null);
  const [voucherMode, setVoucherMode] = useState<'list' | 'code'>('list');
  const [voucherCodeInput, setVoucherCodeInput] = useState('');
  const [checkingCode, setCheckingCode] = useState(false);
  const [chosen, setChosen] = useState<ChosenVoucher | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ order: Order; tierUp: boolean } | null>(null);

  const lookup = async (raw: string, presetBookingId?: number) => {
    const q = raw.trim();
    if (!q) {
      setLookupError('Nhập số điện thoại hoặc mã thành viên');
      return;
    }
    setLooking(true);
    setLookupError(null);
    try {
      const c = await api.get<CustomerLookup | null>('/customers/lookup', { q });
      if (!c) throw new Error('Không tìm thấy khách hàng');
      setCustomer(c);
      resetOrder();
      const b = presetBookingId ? c.bookings.find((x) => x.id === presetBookingId) : undefined;
      if (b) {
        setBookingId(b.id);
        setBranchId(b.branchId);
      } else if (presetBookingId) {
        message.warning('Lịch đặt bàn không còn mở hoặc không thuộc khách này');
      }
    } catch (e) {
      setCustomer(null);
      setLookupError(errMsg(e));
    } finally {
      setLooking(false);
    }
  };

  // Mở từ trang khách hàng / đặt bàn: ?customer=...&booking=...
  useEffect(() => {
    const c = params.get('customer');
    if (c) void lookup(c, params.get('booking') ? Number(params.get('booking')) : undefined);
    else queryRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chi nhánh mặc định: chi nhánh dùng lần trước
  useEffect(() => {
    if (branchId || branches.length === 0) return;
    let last: number | undefined;
    try {
      last = Number(localStorage.getItem(LAST_BRANCH_KEY)) || undefined;
    } catch {
      /* bỏ qua */
    }
    const active = branches.filter((b) => b.active);
    setBranchId(active.find((b) => b.id === last)?.id ?? active[0]?.id);
  }, [branches, branchId]);

  function resetOrder() {
    setBookingId(undefined);
    setItems([emptyRow()]);
    setSubtotalInput(null);
    setDiscountInput(null);
    setChosen(null);
    setVoucherCodeInput('');
    setVoucherMode('list');
    setNote('');
    setResult(null);
  }

  // ---- Tính toán xem trước ----
  const itemsTotal = items.reduce((s, i) => s + (i.quantity || 0) * (i.price || 0), 0);
  const subtotal = totalOnly ? (subtotalInput ?? 0) : itemsTotal;
  const discount = Math.min(discountInput ?? 0, subtotal);
  const base = subtotal - discount;
  const voucherReason = chosen
    ? chosen.invalidReason ??
      (customer && chosen.ownerId !== customer.id ? `Voucher thuộc về khách khác${chosen.ownerName ? ` (${chosen.ownerName})` : ''}` : null) ??
      (base < chosen.voucher.minOrder ? `Áp dụng cho hoá đơn từ ${money(chosen.voucher.minOrder)} (sau giảm giá)` : null)
    : null;
  const vDiscount = chosen && !voucherReason ? voucherDiscount(chosen.voucher, base) : 0;
  const total = base - vDiscount;
  const multiplier = customer?.tier?.pointMultiplier ?? 1;
  const estPoints = total > 0 ? Math.floor((total / pointPerAmount) * multiplier) : 0;

  const filledItems = items.filter((i) => i.name.trim() || i.price > 0);
  const itemsError = !totalOnly && filledItems.some((i) => !i.name.trim()) ? 'Nhập tên món cho các dòng có giá' : null;
  const canSubmit = !!customer && subtotal > 0 && !itemsError && !voucherReason && !submitting;

  const checkCode = async () => {
    const code = voucherCodeInput.trim().toUpperCase();
    if (!code) return;
    setCheckingCode(true);
    try {
      const r = await api.get<VoucherCheck>('/vouchers/check', { code, amount: base > 0 ? base : undefined });
      setChosen({
        code: r.code,
        voucher: r.voucher,
        ownerId: r.customerId,
        ownerName: r.customer?.name,
        // lý do do backend trả về (đã dùng / hết hạn); điều kiện đơn tối thiểu tự tính lại khi đổi số tiền
        invalidReason: r.status !== 'AVAILABLE' ? r.reason : null,
      });
    } catch (e) {
      setChosen(null);
      message.error(errMsg(e));
    } finally {
      setCheckingCode(false);
    }
  };

  const submit = async () => {
    if (!customer || !canSubmit) return;
    setSubmitting(true);
    try {
      const body = {
        customerId: customer.id,
        branchId: branchId ?? null,
        bookingId: bookingId ?? null,
        items: totalOnly ? [] : filledItems.map((i) => ({ name: i.name.trim(), quantity: i.quantity, price: i.price })),
        ...(totalOnly ? { subtotal } : {}),
        discount,
        voucherCode: chosen && !voucherReason ? chosen.code : null,
        note: note.trim() || null,
      };
      const res = await api.post<{ order: Order; tierUp: boolean }>('/orders', body);
      try {
        if (branchId) localStorage.setItem(LAST_BRANCH_KEY, String(branchId));
      } catch {
        /* bỏ qua */
      }
      setResult(res);
      window.scrollTo({ top: 0 });
    } catch (e) {
      message.error(errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const startNew = () => {
    setCustomer(null);
    setQuery('');
    resetOrder();
    navigate('/orders/new', { replace: true });
    setTimeout(() => queryRef.current?.focus(), 50);
  };

  const voucherOptions = useMemo(
    () =>
      (customer?.vouchers ?? []).map((cv) => ({
        value: cv.code,
        label: (
          <span>
            <b>{cv.voucher.title}</b> – {discountText(cv.voucher)}{' '}
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              ({cv.code}, HSD {date(cv.expiresAt)})
            </Typography.Text>
          </span>
        ),
        search: `${cv.voucher.title} ${cv.code}`,
      })),
    [customer],
  );

  // ---------- Kết quả ----------
  if (result) {
    const c = result.order.customer;
    return (
      <>
        <PageHeader title="Tạo hoá đơn" />
        <Card>
          <Result
            status="success"
            title={`Đã tạo hoá đơn ${result.order.code}`}
            subTitle={
              <div style={{ fontSize: 15 }}>
                <div>
                  Khách <b>{c?.name}</b> thanh toán <b>{money(result.order.total)}</b>
                </div>
                <div style={{ marginTop: 8 }}>
                  Được cộng{' '}
                  <Typography.Text type="success" strong style={{ fontSize: 22 }}>
                    +{num(result.order.pointsEarned)} điểm
                  </Typography.Text>
                </div>
                {c?.points !== undefined ? <div style={{ marginTop: 4 }}>Điểm hiện có: {num(c.points)}</div> : null}
              </div>
            }
            extra={[
              <Button type="primary" key="new" onClick={startNew} size="large">
                Tạo hoá đơn mới
              </Button>,
              c ? (
                <Link key="cust" to={`/customers/${c.id}`}>
                  <Button size="large">Xem khách hàng</Button>
                </Link>
              ) : null,
              <Link key="order" to={`/orders?open=${result.order.id}`}>
                <Button size="large">Xem hoá đơn</Button>
              </Link>,
            ]}
          >
            {result.tierUp && c?.tier ? (
              <Alert
                type="success"
                showIcon
                icon={<CrownOutlined />}
                message={
                  <span>
                    Chúc mừng! Khách đã lên hạng <TierTag tier={c.tier} />
                  </span>
                }
                description={`Từ hoá đơn tiếp theo khách được nhân ×${c.tier.pointMultiplier} điểm.`}
              />
            ) : null}
          </Result>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Tạo hoá đơn & tích điểm" subtitle="Tìm khách bằng SĐT hoặc quét mã thành viên, nhập hoá đơn để cộng điểm" />
      <Steps
        size="small"
        current={customer ? 1 : 0}
        style={{ marginBottom: 16, maxWidth: 520 }}
        items={[{ title: 'Tìm khách hàng' }, { title: 'Nhập hoá đơn' }]}
      />
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={9}>
          <Card title="1. Khách hàng">
            <Space.Compact style={{ width: '100%' }}>
              <Input
                ref={queryRef}
                size="large"
                allowClear
                placeholder="SĐT hoặc mã thành viên"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onPressEnter={() => lookup(query)}
                prefix={<SearchOutlined />}
                data-testid="lookup-input"
              />
              <Button size="large" type="primary" loading={looking} onClick={() => lookup(query)}>
                Tìm
              </Button>
              <Button size="large" icon={<QrcodeOutlined />} onClick={() => setScanOpen(true)} title="Quét QR bằng camera" />
            </Space.Compact>
            {lookupError ? (
              <Alert
                style={{ marginTop: 12 }}
                type="error"
                showIcon
                message={lookupError}
                description="Khách cần đăng ký thành viên trên Zalo Mini App và cập nhật số điện thoại trước khi tích điểm."
              />
            ) : null}

            {customer ? (
              <div style={{ marginTop: 16 }}>
                <Space align="center" size={12}>
                  <Avatar size={56} src={customer.avatar || undefined} icon={<UserOutlined />} />
                  <div>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      <Link to={`/customers/${customer.id}`}>{customer.name}</Link>
                    </Typography.Title>
                    <Space size={6} wrap>
                      <TierTag tier={customer.tier} />
                      <Tag>×{multiplier} điểm</Tag>
                    </Space>
                  </div>
                </Space>
                <Descriptions column={1} size="small" style={{ marginTop: 12 }} styles={{ label: { width: 150 } }}>
                  <Descriptions.Item label="SĐT">{customer.phone || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Mã thành viên">{customer.memberCode}</Descriptions.Item>
                  <Descriptions.Item label="Điểm hiện có">
                    <b>{num(customer.points)}</b>
                  </Descriptions.Item>
                  <Descriptions.Item label="Điểm tích luỹ">{num(customer.lifetimePoints)}</Descriptions.Item>
                  <Descriptions.Item label="Lượt ghé">{customer.visitCount}</Descriptions.Item>
                  <Descriptions.Item label="Voucher khả dụng">{customer.vouchers.length}</Descriptions.Item>
                  {customer.note ? (
                    <Descriptions.Item label="Ghi chú">
                      <span className="pre-line">{customer.note}</span>
                    </Descriptions.Item>
                  ) : null}
                </Descriptions>
                <Button icon={<SwapOutlined />} onClick={startNew} style={{ marginTop: 8 }}>
                  Đổi khách khác
                </Button>
              </div>
            ) : !lookupError ? (
              <Empty style={{ marginTop: 24 }} description="Chưa chọn khách hàng" />
            ) : null}
          </Card>
        </Col>

        <Col xs={24} xl={15}>
          <Card title="2. Hoá đơn" style={{ opacity: customer ? 1 : 0.55 }}>
            <fieldset disabled={!customer} style={{ border: 0, padding: 0, margin: 0 }}>
              <Form layout="vertical" component="div">
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <Form.Item label="Chi nhánh">
                      <Select
                        value={branchId}
                        onChange={setBranchId}
                        disabled={!customer}
                        placeholder="Chọn chi nhánh"
                        options={branches.filter((b) => b.active || b.id === branchId).map((b) => ({ value: b.id, label: b.name }))}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={12}>
                    <Form.Item label="Lịch đặt bàn (không bắt buộc)" extra={bookingId ? 'Lịch sẽ chuyển sang "Hoàn thành".' : undefined}>
                      <Select
                        allowClear
                        disabled={!customer}
                        value={bookingId}
                        onChange={(v) => {
                          setBookingId(v);
                          const b = customer?.bookings.find((x) => x.id === v);
                          if (b) setBranchId(b.branchId);
                        }}
                        placeholder={customer?.bookings.length ? 'Chọn lịch đặt bàn của khách' : 'Khách không có lịch đang mở'}
                        options={(customer?.bookings ?? []).map((b) => ({
                          value: b.id,
                          label: (
                            <span>
                              {b.code} · {datetime(b.bookingTime)} · {b.partySize} khách · {b.branch?.name}{' '}
                              <StatusTag kind="booking" status={b.status} />
                            </span>
                          ),
                        }))}
                      />
                    </Form.Item>
                  </Col>
                </Row>

                <Space style={{ marginBottom: 12 }}>
                  <Switch checked={totalOnly} onChange={setTotalOnly} disabled={!customer} id="total-only" />
                  <label htmlFor="total-only">Chỉ nhập tổng tiền (lấy từ máy POS)</label>
                </Space>

                {totalOnly ? (
                  <Form.Item label="Tổng tiền món" required>
                    <InputNumber
                      size="large"
                      min={0}
                      step={1000}
                      style={{ width: 260 }}
                      value={subtotalInput}
                      onChange={(v) => setSubtotalInput(v ?? null)}
                      disabled={!customer}
                      suffix="đ"
                      data-testid="subtotal-input"
                      {...moneyInput}
                    />
                  </Form.Item>
                ) : (
                  <>
                    <Table<ItemRow>
                      size="small"
                      rowKey="key"
                      pagination={false}
                      dataSource={items}
                      style={{ marginBottom: 8 }}
                      columns={[
                        {
                          title: 'Tên món',
                          render: (_, r) => (
                            <Input
                              value={r.name}
                              placeholder="VD: Lẩu thái"
                              disabled={!customer}
                              status={!r.name.trim() && r.price > 0 ? 'error' : undefined}
                              onChange={(e) => setItems((xs) => xs.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)))}
                            />
                          ),
                        },
                        {
                          title: 'SL',
                          width: 90,
                          render: (_, r) => (
                            <InputNumber
                              min={1}
                              precision={0}
                              value={r.quantity}
                              disabled={!customer}
                              style={{ width: '100%' }}
                              onChange={(v) => setItems((xs) => xs.map((x) => (x.key === r.key ? { ...x, quantity: v ?? 1 } : x)))}
                            />
                          ),
                        },
                        {
                          title: 'Đơn giá',
                          width: 160,
                          render: (_, r) => (
                            <InputNumber
                              min={0}
                              step={1000}
                              value={r.price || null}
                              disabled={!customer}
                              style={{ width: '100%' }}
                              onChange={(v) => setItems((xs) => xs.map((x) => (x.key === r.key ? { ...x, price: v ?? 0 } : x)))}
                              {...moneyInput}
                            />
                          ),
                        },
                        { title: 'Thành tiền', width: 120, align: 'right', render: (_, r) => money(r.quantity * r.price) },
                        {
                          width: 48,
                          render: (_, r) => (
                            <Button
                              type="text"
                              danger
                              aria-label="Xoá dòng"
                              icon={<DeleteOutlined />}
                              disabled={!customer || items.length === 1}
                              onClick={() => setItems((xs) => xs.filter((x) => x.key !== r.key))}
                            />
                          ),
                        },
                      ]}
                    />
                    <Button type="dashed" icon={<PlusOutlined />} block disabled={!customer} onClick={() => setItems((xs) => [...xs, emptyRow()])}>
                      Thêm món
                    </Button>
                    {itemsError ? <Typography.Text type="danger">{itemsError}</Typography.Text> : null}
                  </>
                )}

                <Divider />
                <Row gutter={16}>
                  <Col xs={24} md={10}>
                    <Form.Item label="Giảm giá thủ công" extra="Giảm trực tiếp trên hoá đơn (trước voucher)">
                      <InputNumber
                        min={0}
                        step={1000}
                        style={{ width: '100%' }}
                        value={discountInput}
                        onChange={(v) => setDiscountInput(v ?? null)}
                        disabled={!customer}
                        suffix="đ"
                        {...moneyInput}
                      />
                    </Form.Item>
                  </Col>
                  <Col xs={24} md={14}>
                    <Form.Item
                      label={
                        <Space>
                          Voucher
                          <Radio.Group
                            size="small"
                            value={voucherMode}
                            disabled={!customer}
                            onChange={(e) => {
                              setVoucherMode(e.target.value);
                              setChosen(null);
                              setVoucherCodeInput('');
                            }}
                            optionType="button"
                            options={[
                              { value: 'list', label: `Ví của khách (${customer?.vouchers.length ?? 0})` },
                              { value: 'code', label: 'Nhập mã' },
                            ]}
                          />
                        </Space>
                      }
                      validateStatus={voucherReason ? 'error' : undefined}
                      help={
                        voucherReason ??
                        (chosen ? `${chosen.voucher.title}: ${discountText(chosen.voucher)} → giảm ${money(vDiscount)}` : undefined)
                      }
                    >
                      {voucherMode === 'list' ? (
                        <Select
                          allowClear
                          showSearch
                          disabled={!customer}
                          optionFilterProp="search"
                          placeholder={customer?.vouchers.length ? 'Chọn voucher của khách' : 'Khách không có voucher khả dụng'}
                          value={chosen?.code}
                          onChange={(code) => {
                            const cv = customer?.vouchers.find((x) => x.code === code);
                            setChosen(cv ? { code: cv.code, voucher: cv.voucher, ownerId: cv.customerId, invalidReason: null } : null);
                          }}
                          options={voucherOptions}
                        />
                      ) : (
                        <Space.Compact style={{ width: '100%' }}>
                          <Input
                            placeholder="VD: VABC2345"
                            value={voucherCodeInput}
                            disabled={!customer}
                            onChange={(e) => {
                              setVoucherCodeInput(e.target.value.toUpperCase());
                              setChosen(null);
                            }}
                            onPressEnter={checkCode}
                          />
                          <Button onClick={checkCode} loading={checkingCode} disabled={!customer || !voucherCodeInput.trim()}>
                            Kiểm tra
                          </Button>
                        </Space.Compact>
                      )}
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="Ghi chú">
                  <Input.TextArea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} disabled={!customer} />
                </Form.Item>
              </Form>
            </fieldset>

            <Card size="small" style={{ background: '#fafafa' }}>
              <Row gutter={[16, 8]} align="middle">
                <Col xs={24} md={14}>
                  <Descriptions column={1} size="small" styles={{ label: { width: 150 } }}>
                    <Descriptions.Item label="Tạm tính">{money(subtotal)}</Descriptions.Item>
                    <Descriptions.Item label="Giảm giá">{discount ? `-${money(discount)}` : '0đ'}</Descriptions.Item>
                    <Descriptions.Item label="Voucher">{vDiscount ? `-${money(vDiscount)}` : '0đ'}</Descriptions.Item>
                    <Descriptions.Item label={<b>Khách trả</b>}>
                      <b style={{ fontSize: 20 }} data-testid="order-total">
                        {money(total)}
                      </b>
                    </Descriptions.Item>
                  </Descriptions>
                </Col>
                <Col xs={24} md={10} style={{ textAlign: 'center' }}>
                  <Typography.Text type="secondary">Điểm dự kiến</Typography.Text>
                  <div style={{ fontSize: 30, fontWeight: 700, color: '#389e0d' }} data-testid="est-points">
                    +{num(estPoints)}
                  </div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {num(pointPerAmount)}đ = 1 điểm × hệ số {multiplier}
                  </Typography.Text>
                </Col>
              </Row>
            </Card>

            <Button
              type="primary"
              size="large"
              block
              style={{ marginTop: 16 }}
              disabled={!canSubmit}
              loading={submitting}
              onClick={submit}
            >
              Lưu hoá đơn & cộng điểm
            </Button>
          </Card>
        </Col>
      </Row>

      <QrScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onResult={(text) => {
          setScanOpen(false);
          const code = parseQr(text);
          setQuery(code);
          void lookup(code);
        }}
      />
    </>
  );
}
