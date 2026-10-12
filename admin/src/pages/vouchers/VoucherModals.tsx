import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Alert,
  App,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Switch,
  Typography,
  Button,
  Popconfirm,
} from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { api } from '../../api/client';
import type { Customer, CustomerVoucher, Paged, Voucher, VoucherCheck } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { BranchSelect, BrandSelect, BrandTag } from '../../components/BrandBadge';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useTiers } from '../../hooks/useCatalog';
import { ImageUpload } from '../../components/ImageUpload';
import { StatusTag } from '../../components/StatusTag';
import { TierTag } from '../../components/TierTag';
import { datetime, errMsg, money, moneyInput } from '../../utils/format';
import { discountText } from '../../utils/voucher';

interface FormValues {
  brandId?: number;
  title: string;
  description?: string;
  imageUrl?: string | null;
  discountType: 'PERCENT' | 'AMOUNT' | 'GIFT';
  discountValue?: number | null;
  maxDiscount?: number | null;
  minOrder?: number | null;
  kind: 'free' | 'points';
  pointCost?: number | null;
  totalQuantity?: number | null;
  perCustomerLimit: number;
  validDays: number;
  startDate?: Dayjs | null;
  endDate?: Dayjs | null;
  minTierId?: number | null;
  active: boolean;
}

/** Tạo / sửa mẫu voucher */
export function VoucherFormModal({
  open,
  voucher,
  onClose,
  onSaved,
}: {
  open: boolean;
  voucher: Voucher | null;
  onClose: () => void;
  onSaved: (v: Voucher) => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const { message } = App.useApp();
  const tiers = useTiers();
  const { brandId: brandFilter } = useAuth();
  const [saving, setSaving] = useState(false);
  const discountType = Form.useWatch('discountType', form);
  const kind = Form.useWatch('kind', form);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      voucher
        ? {
            title: voucher.title,
            description: voucher.description ?? '',
            imageUrl: voucher.imageUrl,
            discountType: voucher.discountType,
            discountValue: voucher.discountValue,
            maxDiscount: voucher.maxDiscount,
            minOrder: voucher.minOrder,
            kind: voucher.pointCost > 0 ? 'points' : 'free',
            pointCost: voucher.pointCost || null,
            totalQuantity: voucher.totalQuantity,
            perCustomerLimit: voucher.perCustomerLimit,
            validDays: voucher.validDays,
            startDate: voucher.startDate ? dayjs(voucher.startDate) : null,
            endDate: voucher.endDate ? dayjs(voucher.endDate) : null,
            minTierId: voucher.minTierId,
            active: voucher.active,
          }
        : { discountType: 'PERCENT', kind: 'free', perCustomerLimit: 1, validDays: 30, active: true, minOrder: 0 },
    );
  }, [open, voucher, form]);

  const onFinish = async (v: FormValues) => {
    const body = {
      // Tạo mới khi đang xem tất cả thương hiệu → phải chọn thương hiệu
      ...(!voucher && !brandFilter ? { brandId: v.brandId } : {}),
      title: v.title.trim(),
      description: v.description?.trim() || null,
      imageUrl: v.imageUrl || null,
      discountType: v.discountType,
      discountValue: v.discountType === 'GIFT' ? 0 : (v.discountValue ?? 0),
      maxDiscount: v.discountType === 'PERCENT' ? (v.maxDiscount ?? null) || null : null,
      minOrder: v.minOrder ?? 0,
      pointCost: v.kind === 'points' ? (v.pointCost ?? 0) : 0,
      totalQuantity: v.totalQuantity ?? null,
      perCustomerLimit: v.perCustomerLimit,
      validDays: v.validDays,
      startDate: v.startDate ? v.startDate.startOf('day').toISOString() : null,
      endDate: v.endDate ? v.endDate.endOf('day').toISOString() : null,
      minTierId: v.minTierId ?? null,
      active: v.active,
    };
    setSaving(true);
    try {
      const saved = voucher ? await api.put<Voucher>(`/vouchers/${voucher.id}`, body) : await api.post<Voucher>('/vouchers', body);
      message.success(voucher ? 'Đã cập nhật voucher' : 'Đã tạo voucher');
      onSaved(saved);
      onClose();
    } catch (e) {
      message.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={voucher ? `Sửa voucher: ${voucher.title}` : 'Tạo voucher'}
      open={open}
      onCancel={onClose}
      okText="Lưu"
      cancelText="Huỷ"
      confirmLoading={saving}
      onOk={() => form.submit()}
      width={760}
      forceRender
    >
      <Form form={form} layout="vertical" onFinish={onFinish}>
        {voucher ? (
          <Form.Item label="Thương hiệu">
            <BrandTag brand={voucher.brand} brandId={voucher.brandId} />
          </Form.Item>
        ) : !brandFilter ? (
          <Form.Item name="brandId" label="Thương hiệu" rules={[{ required: true, message: 'Chọn thương hiệu' }]}>
            <BrandSelect data-testid="voucher-brand" />
          </Form.Item>
        ) : null}
        <Form.Item name="title" label="Tên voucher" rules={[{ required: true, whitespace: true, message: 'Nhập tên voucher' }]}>
          <Input maxLength={200} placeholder="VD: Giảm 10% cho hoá đơn từ 500.000đ" />
        </Form.Item>
        <Form.Item name="description" label="Mô tả / điều kiện áp dụng">
          <Input.TextArea rows={3} maxLength={5000} />
        </Form.Item>
        <Form.Item name="imageUrl" label="Ảnh">
          <ImageUpload />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="discountType" label="Loại ưu đãi">
              <Select
                options={[
                  { value: 'PERCENT', label: 'Giảm theo %' },
                  { value: 'AMOUNT', label: 'Giảm số tiền' },
                  { value: 'GIFT', label: 'Quà tặng (món/dịch vụ)' },
                ]}
              />
            </Form.Item>
          </Col>
          {discountType === 'PERCENT' ? (
            <>
              <Col xs={12} md={8}>
                <Form.Item
                  name="discountValue"
                  label="Phần trăm giảm"
                  rules={[{ required: true, message: 'Nhập % giảm' }, { type: 'number', min: 1, max: 100, message: '1–100%' }]}
                >
                  <InputNumber min={1} max={100} precision={0} suffix="%" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={12} md={8}>
                <Form.Item name="maxDiscount" label="Giảm tối đa" extra="Để trống = không giới hạn">
                  <InputNumber min={0} step={1000} suffix="đ" style={{ width: '100%' }} {...moneyInput} />
                </Form.Item>
              </Col>
            </>
          ) : discountType === 'AMOUNT' ? (
            <Col xs={24} md={8}>
              <Form.Item name="discountValue" label="Số tiền giảm" rules={[{ required: true, message: 'Nhập số tiền giảm' }]}>
                <InputNumber min={1000} step={1000} suffix="đ" style={{ width: '100%' }} {...moneyInput} />
              </Form.Item>
            </Col>
          ) : (
            <Col xs={24} md={16}>
              <Typography.Paragraph type="secondary" style={{ marginTop: 30 }}>
                Voucher quà tặng không trừ tiền hoá đơn – ghi rõ quà trong phần mô tả.
              </Typography.Paragraph>
            </Col>
          )}
        </Row>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="minOrder" label="Hoá đơn tối thiểu" extra="0 = không yêu cầu">
              <InputNumber min={0} step={10000} suffix="đ" style={{ width: '100%' }} {...moneyInput} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="kind" label="Cách nhận">
              <Radio.Group
                optionType="button"
                options={[
                  { value: 'free', label: 'Miễn phí' },
                  { value: 'points', label: 'Đổi điểm' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            {kind === 'points' ? (
              <Form.Item name="pointCost" label="Số điểm cần đổi" rules={[{ required: true, message: 'Nhập số điểm' }]}>
                <InputNumber min={1} precision={0} suffix="điểm" style={{ width: '100%' }} />
              </Form.Item>
            ) : null}
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="totalQuantity" label="Tổng số lượng phát" extra="Để trống = không giới hạn">
              <InputNumber min={voucher?.issuedCount ?? 0} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="perCustomerLimit" label="Tối đa mỗi khách" rules={[{ required: true, message: 'Bắt buộc' }]}>
              <InputNumber min={1} precision={0} suffix="lần" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="validDays" label="Hiệu lực sau khi nhận" rules={[{ required: true, message: 'Bắt buộc' }]}>
              <InputNumber min={1} precision={0} suffix="ngày" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={12} md={8}>
            <Form.Item name="startDate" label="Ngày bắt đầu phát">
              <DatePicker format="DD/MM/YYYY" placeholder="Chọn ngày" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item
              name="endDate"
              label="Ngày kết thúc"
              dependencies={['startDate']}
              rules={[
                ({ getFieldValue }) => ({
                  validator: (_, v: Dayjs | null) => {
                    const s: Dayjs | null = getFieldValue('startDate');
                    return !v || !s || !v.isBefore(s, 'day') ? Promise.resolve() : Promise.reject(new Error('Phải sau ngày bắt đầu'));
                  },
                }),
              ]}
              extra="Voucher của khách hết hạn muộn nhất vào ngày này"
            >
              <DatePicker format="DD/MM/YYYY" placeholder="Chọn ngày" style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name="minTierId" label="Hạng tối thiểu">
              <Select allowClear placeholder="Tất cả hạng" options={tiers.map((t) => ({ value: t.id, label: t.name }))} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="active" label="Đang hoạt động" valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/** Ô chọn nhiều khách hàng có tìm kiếm từ server */
export function CustomerMultiSelect({ value, onChange }: { value?: number[]; onChange?: (v: number[]) => void }) {
  const [options, setOptions] = useState<{ value: number; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const search = (q: string) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.get<Paged<Customer>>('/customers', { q, pageSize: 20 });
        setOptions((prev) => {
          const keep = prev.filter((o) => value?.includes(o.value));
          const next = res.items.map((c) => ({ value: c.id, label: `${c.name}${c.phone ? ` – ${c.phone}` : ''} (${c.memberCode})` }));
          return [...keep, ...next.filter((n) => !keep.some((k) => k.value === n.value))];
        });
      } catch {
        /* bỏ qua */
      } finally {
        setLoading(false);
      }
    }, 300);
  };
  useEffect(() => {
    search('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Select
      mode="multiple"
      showSearch
      filterOption={false}
      onSearch={search}
      loading={loading}
      value={value}
      onChange={onChange}
      options={options}
      placeholder="Tìm theo tên, SĐT, mã thành viên"
      notFoundContent={loading ? 'Đang tìm...' : 'Không tìm thấy'}
    />
  );
}

/** Tặng voucher hàng loạt theo hạng hoặc danh sách khách */
export function GiftBulkModal({ voucher, onClose, onDone }: { voucher: Voucher | null; onClose: () => void; onDone?: () => void }) {
  const [form] = Form.useForm<{ target: 'tier' | 'branch' | 'customers'; tierId?: number; branchId?: number; customerIds?: number[] }>();
  const { message, modal } = App.useApp();
  const tiers = useTiers();
  const target = Form.useWatch('target', form);
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      title={voucher ? `Tặng hàng loạt: ${voucher.title}` : ''}
      open={!!voucher}
      onCancel={onClose}
      okText="Tặng voucher"
      cancelText="Huỷ"
      confirmLoading={saving}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      {voucher?.totalQuantity !== null && voucher ? (
        <Alert
          style={{ marginBottom: 12 }}
          type="info"
          showIcon
          message={`Còn ${voucher.totalQuantity - voucher.issuedCount} lượt phát. Khách vượt số lượng sẽ không nhận được.`}
        />
      ) : null}
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{ target: 'tier' }}
        onFinish={async (v) => {
          if (!voucher) return;
          setSaving(true);
          try {
            const res = await api.post<{ success: number; failed: number; errors: { customerId: number; error: string }[] }>(
              `/vouchers/${voucher.id}/gift`,
              v.target === 'tier' ? { tierId: v.tierId } : v.target === 'branch' ? { branchId: v.branchId } : { customerIds: v.customerIds },
            );
            if (res.failed > 0) {
              modal.warning({
                title: `Đã tặng ${res.success} khách, ${res.failed} khách lỗi`,
                content: (
                  <ul style={{ paddingLeft: 18 }}>
                    {res.errors.map((e) => (
                      <li key={e.customerId}>
                        Khách #{e.customerId}: {e.error}
                      </li>
                    ))}
                  </ul>
                ),
              });
            } else {
              message.success(res.success ? `Đã tặng voucher cho ${res.success} khách` : 'Không có khách nào để tặng');
            }
            onDone?.();
            onClose();
          } catch (e) {
            message.error(errMsg(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form.Item name="target" label="Tặng cho">
          <Radio.Group
            optionType="button"
            options={[
              { value: 'tier', label: 'Theo hạng' },
              { value: 'branch', label: 'Theo cơ sở đăng ký' },
              { value: 'customers', label: 'Chọn khách hàng' },
            ]}
          />
        </Form.Item>
        {target === 'branch' ? (
          <Form.Item
            name="branchId"
            label="Cơ sở"
            rules={[{ required: true, message: 'Chọn cơ sở' }]}
            extra="Tặng cho toàn bộ khách đã chọn cơ sở này khi đăng ký thành viên"
          >
            <BranchSelect brandId={voucher?.brandId ?? null} data-testid="gift-branch" />
          </Form.Item>
        ) : target === 'customers' ? (
          <Form.Item name="customerIds" label="Khách hàng" rules={[{ required: true, message: 'Chọn ít nhất 1 khách' }]}>
            <CustomerMultiSelect />
          </Form.Item>
        ) : (
          <Form.Item
            name="tierId"
            label="Hạng thành viên"
            rules={[{ required: true, message: 'Chọn hạng' }]}
            extra="Chỉ tặng cho khách thuộc hạng này đã là thành viên (có ví) của thương hiệu của voucher"
          >
            <Select
              options={tiers.map((t) => ({ value: t.id, label: t.name }))}
              placeholder="Chọn hạng"
            />
          </Form.Item>
        )}
        <Typography.Text type="secondary">Voucher tặng bỏ qua điều kiện điểm/hạng tối thiểu và giới hạn mỗi khách.</Typography.Text>
      </Form>
    </Modal>
  );
}

/** Công cụ kiểm tra mã voucher khách đưa tại quầy */
export function VoucherCheckModal({ open, onClose, onRedeemed }: { open: boolean; onClose: () => void; onRedeemed?: () => void }) {
  const [code, setCode] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VoucherCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { message } = App.useApp();
  const [redeeming, setRedeeming] = useState(false);
  const redeem = async () => {
    if (!result) return;
    setRedeeming(true);
    try {
      const cv = await api.post<CustomerVoucher>('/vouchers/redeem', { code: result.code });
      setResult({ ...result, ...cv, voucher: cv.voucher ?? result.voucher, customer: result.customer, valid: false, reason: 'Voucher đã được sử dụng', discount: null });
      message.success(`Đã ghi nhận sử dụng voucher ${result.code}`);
      onRedeemed?.();
    } catch (e) {
      message.error(errMsg(e));
    } finally {
      setRedeeming(false);
    }
  };
  const check = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.get<VoucherCheck>('/vouchers/check', { code: code.trim(), amount: amount || undefined }));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal
      title="Kiểm tra mã voucher"
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      afterClose={() => {
        setCode('');
        setAmount(null);
        setResult(null);
        setError(null);
      }}
    >
      <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
        <Input
          placeholder="Mã voucher, VD: VABC2345"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onPressEnter={check}
          autoFocus
        />
        <InputNumber
          placeholder="Số tiền HĐ (tuỳ chọn)"
          min={0}
          step={1000}
          value={amount}
          onChange={(v) => setAmount(v)}
          style={{ width: 220 }}
          {...moneyInput}
        />
        <Button type="primary" loading={loading} onClick={check}>
          Kiểm tra
        </Button>
      </Space.Compact>
      {error ? <Alert type="error" showIcon message={error} /> : null}
      {result ? (
        <>
          <Alert
            type={result.valid ? 'success' : 'error'}
            showIcon
            message={result.valid ? 'Voucher hợp lệ' : 'Voucher không dùng được'}
            description={result.reason ?? (result.discount !== null ? `Giảm ${money(result.discount)} cho hoá đơn ${money(amount)}` : undefined)}
            style={{ marginBottom: 12 }}
          />
          <Descriptions column={1} size="small" bordered styles={{ label: { width: 140 } }}>
            <Descriptions.Item label="Mã">{result.code}</Descriptions.Item>
            <Descriptions.Item label="Thương hiệu">
              <BrandTag brand={result.voucher.brand} brandId={result.brandId} />
            </Descriptions.Item>
            <Descriptions.Item label="Voucher">
              <Link to={`/vouchers/${result.voucherId}`} onClick={onClose}>
                {result.voucher.title}
              </Link>
              <div>{discountText(result.voucher)}</div>
            </Descriptions.Item>
            <Descriptions.Item label="Chủ sở hữu">
              {result.customer ? (
                <>
                  <Link to={`/customers/${result.customer.id}`} onClick={onClose}>
                    {result.customer.name}
                  </Link>{' '}
                  {result.customer.phone ? `· ${result.customer.phone} ` : ''}
                  <TierTag tier={result.customer.tier} />
                </>
              ) : (
                '—'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Trạng thái">
              <StatusTag kind="voucher" status={result.status} />
              {result.order ? <> – hoá đơn {result.order.code}</> : null}
            </Descriptions.Item>
            <Descriptions.Item label="Hết hạn">{datetime(result.expiresAt)}</Descriptions.Item>
            {result.usedAt ? <Descriptions.Item label="Dùng lúc">{datetime(result.usedAt)}</Descriptions.Item> : null}
          </Descriptions>
          {result.valid && result.status === 'AVAILABLE' ? (
            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Popconfirm
                title="Xác nhận khách sử dụng voucher này?"
                description="Voucher sẽ chuyển sang Đã dùng và không thể dùng lại."
                okText="Xác nhận"
                cancelText="Không"
                onConfirm={redeem}
              >
                <Button type="primary" icon={<CheckCircleOutlined />} loading={redeeming} data-testid="voucher-redeem">
                  Xác nhận sử dụng
                </Button>
              </Popconfirm>
            </div>
          ) : null}
        </>
      ) : null}
    </Modal>
  );
}
