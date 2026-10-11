import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  App,
  AutoComplete,
  Avatar,
  Button,
  Card,
  Checkbox,
  Col,
  ColorPicker,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Radio,
  Row,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { Color } from 'antd/es/color-picker';
import { ApiOutlined, CheckCircleFilled, EditOutlined, KeyOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '../api/client';
import type { Brand } from '../api/types';
import { useRequest } from '../hooks/useRequest';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { ImageUpload } from '../components/ImageUpload';
import { BrandDot } from '../components/BrandBadge';
import { errMsg, num } from '../utils/format';

export const DCORP_PRESETS = [
  { value: 'https://api-stg.dcorp.com.vn', label: 'Sandbox (UAT) – https://api-stg.dcorp.com.vn' },
  { value: 'https://api.dcorp.com.vn', label: 'Production – https://api.dcorp.com.vn' },
];

function validHttpUrl(v: string | undefined) {
  if (!v?.trim()) return Promise.resolve();
  try {
    const u = new URL(v.trim());
    if (u.protocol === 'http:' || u.protocol === 'https:') return Promise.resolve();
  } catch {
    /* không hợp lệ */
  }
  return Promise.reject(new Error('URL không hợp lệ (cần http:// hoặc https://)'));
}

export default function BrandsPage() {
  const { message } = App.useApp();
  const { refresh, brandId } = useAuth();
  const [params, setParams] = useSearchParams();
  const { data, loading, reload, setData } = useRequest(() => api.get<Brand[]>('/brands'), []);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [open, setOpen] = useState(false);

  // Mở sẵn form sửa khi đi từ trang Cài đặt: /brands?edit=<id>
  useEffect(() => {
    const id = Number(params.get('edit'));
    if (!id || !data) return;
    const b = data.find((x) => x.id === id);
    if (b) {
      setEditing(b);
      setOpen(true);
    }
    const p = new URLSearchParams(params);
    p.delete('edit');
    setParams(p, { replace: true });
  }, [data, params, setParams]);

  const changed = async () => {
    await reload();
    await refresh().catch(() => undefined); // cập nhật danh sách thương hiệu ở thanh trên
  };

  return (
    <>
      <PageHeader
        title="Thương hiệu"
        subtitle="Mỗi thương hiệu có Mini App + Zalo OA, các cơ sở, voucher, cài đặt tích điểm riêng. Khách hàng và hạng dùng chung."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Thêm thương hiệu
          </Button>
        }
      />
      <Card>
        <Table<Brand>
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={false}
          scroll={{ x: 1000 }}
          columns={[
            {
              title: 'Thương hiệu',
              render: (_, b) => (
                <Space>
                  <Avatar shape="square" size={44} src={b.logoUrl || undefined} style={{ background: b.primaryColor }}>
                    {b.name.slice(0, 1)}
                  </Avatar>
                  <div>
                    <Typography.Text strong>{b.name}</Typography.Text> {b.id === brandId ? <Tag color="processing">Đang chọn</Tag> : null}
                    <div>
                      <Typography.Text type="secondary" copyable={{ text: b.code }}>
                        Mã: {b.code}
                      </Typography.Text>
                    </div>
                  </div>
                </Space>
              ),
            },
            {
              title: 'Màu',
              dataIndex: 'primaryColor',
              render: (c: string) => (
                <Space size={6}>
                  <BrandDot color={c} size={14} />
                  <Typography.Text type="secondary">{c}</Typography.Text>
                </Space>
              ),
            },
            { title: 'Hotline', dataIndex: 'hotline', render: (v) => v || '—' },
            {
              title: 'Zalo',
              render: (_, b) => (
                <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                  <div>App ID: {b.zaloAppId || <Typography.Text type="secondary">chưa có</Typography.Text>}</div>
                  <div>OA ID: {b.zaloOaId || <Typography.Text type="secondary">chưa có</Typography.Text>}</div>
                  <Space size={4} wrap>
                    <Tag color={b.hasZaloAppSecretKey ? 'green' : 'default'}>Secret key {b.hasZaloAppSecretKey ? '✓' : '✗'}</Tag>
                    <Tag color={b.hasZaloOaAccessToken ? 'green' : 'default'}>OA token {b.hasZaloOaAccessToken ? '✓' : '✗'}</Tag>
                  </Space>
                </div>
              ),
            },
            {
              title: 'POS r_keeper',
              render: (_, b) =>
                b.posEnabled ? (
                  (() => {
                    const warns: string[] = [];
                    if (b.posProvider === 'DCORP') {
                      if (!b.dcorpClientId) warns.push('Thiếu Client ID');
                      if (!b.hasDcorpClientSecret) warns.push('Thiếu Client secret');
                      if (!b.dcorpOrganization) warns.push('Thiếu Organization');
                      if (!b.dcorpBaseUrl) warns.push('Thiếu địa chỉ API');
                    } else if (!b.posWebhookUrl) warns.push('Chưa có webhook');
                    if (!b.hasPosApiKey) warns.push('Chưa tạo API key nhận bill');
                    const env = b.dcorpBaseUrl?.includes('-stg') ? 'UAT' : b.dcorpBaseUrl ? 'PROD' : null;
                    return (
                      <Space direction="vertical" size={2}>
                        <Space size={4}>
                          <Tag color={warns.length ? 'gold' : 'green'} style={{ marginInlineEnd: 0 }}>
                            Đang bật
                          </Tag>
                          <Tag color={b.posProvider === 'DCORP' ? 'blue' : 'default'} style={{ marginInlineEnd: 0 }}>
                            {b.posProvider === 'DCORP' ? `DCorp${env ? ` · ${env}` : ''}` : 'Webhook'}
                          </Tag>
                        </Space>
                        {warns.map((w) => (
                          <Typography.Text key={w} type="warning" style={{ fontSize: 12 }}>
                            {w}
                          </Typography.Text>
                        ))}
                      </Space>
                    );
                  })()
                ) : (
                  <Tag>Tắt</Tag>
                ),
            },
            { title: 'Cơ sở', align: 'right', render: (_, b) => num(b._count?.branches ?? 0) },
            { title: 'Thành viên', align: 'right', render: (_, b) => num(b._count?.wallets ?? 0) },
            {
              title: 'Hoạt động',
              dataIndex: 'active',
              render: (v: boolean, b) => (
                <Switch
                  size="small"
                  checked={v}
                  onChange={async (active) => {
                    try {
                      const saved = await api.put<Brand>(`/brands/${b.id}`, { active });
                      setData((d) => d?.map((x) => (x.id === b.id ? { ...x, ...saved } : x)));
                      await refresh().catch(() => undefined);
                      message.success(active ? 'Đã bật thương hiệu' : 'Đã ngừng hoạt động – Mini App của thương hiệu sẽ không truy cập được');
                    } catch (e) {
                      message.error(errMsg(e));
                    }
                  }}
                />
              ),
            },
            {
              title: '',
              width: 60,
              render: (_, b) => (
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  title="Sửa"
                  onClick={() => {
                    setEditing(b);
                    setOpen(true);
                  }}
                />
              ),
            },
          ]}
        />
      </Card>
      <BrandModal open={open} brand={editing} onClose={() => setOpen(false)} onSaved={changed} onKeyRotated={() => void reload()} />
    </>
  );
}

interface BrandForm {
  code: string;
  name: string;
  logoUrl?: string | null;
  primaryColor: string | Color;
  hotline?: string;
  about?: string;
  zaloAppId?: string;
  zaloOaId?: string;
  zaloAppSecretKey?: string;
  zaloOaAccessToken?: string;
  clearAppSecret?: boolean;
  clearOaToken?: boolean;
  posEnabled: boolean;
  posProvider: 'WEBHOOK' | 'DCORP';
  posWebhookUrl?: string;
  posWebhookSecret?: string;
  clearPosSecret?: boolean;
  dcorpBaseUrl?: string;
  dcorpClientId?: string;
  dcorpClientSecret?: string;
  clearDcorpSecret?: boolean;
  dcorpOrganization?: number | null;
  active: boolean;
}

/** Ô nhập secret chỉ ghi: để trống = giữ nguyên, có tuỳ chọn xoá */
function SecretField({
  name,
  clearName,
  label,
  configured,
  form,
}: {
  name: 'zaloAppSecretKey' | 'zaloOaAccessToken' | 'posWebhookSecret' | 'dcorpClientSecret';
  clearName: 'clearAppSecret' | 'clearOaToken' | 'clearPosSecret' | 'clearDcorpSecret';
  label: string;
  configured: boolean;
  form: ReturnType<typeof Form.useForm<BrandForm>>[0];
}) {
  const clearing = Form.useWatch(clearName, form);
  return (
    <Form.Item
      label={
        <Space>
          {label}
          {configured ? (
            <Tag color="green" icon={<CheckCircleFilled />}>
              Đã cấu hình
            </Tag>
          ) : (
            <Tag>Chưa cấu hình</Tag>
          )}
        </Space>
      }
      extra={configured ? 'Để trống = giữ nguyên giá trị hiện tại. Giá trị đã lưu không bao giờ hiển thị lại.' : undefined}
    >
      <Space.Compact block>
        <Form.Item name={name} noStyle>
          <Input.Password
            autoComplete="new-password"
            placeholder={configured ? '•••••••• (giữ nguyên)' : 'Nhập giá trị'}
            disabled={!!clearing}
            visibilityToggle
          />
        </Form.Item>
      </Space.Compact>
      {configured ? (
        <Form.Item name={clearName} valuePropName="checked" noStyle>
          <Checkbox style={{ marginTop: 6 }}>Xoá giá trị đã lưu</Checkbox>
        </Form.Item>
      ) : null}
    </Form.Item>
  );
}

function BrandModal({
  open,
  brand,
  onClose,
  onSaved,
  onKeyRotated,
}: {
  open: boolean;
  brand: Brand | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onKeyRotated: () => void;
}) {
  const [form] = Form.useForm<BrandForm>();
  const { message, modal } = App.useApp();
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const posEnabled = Form.useWatch('posEnabled', form);
  const posProvider = Form.useWatch('posProvider', form);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => setTestResult(null), [brand, open]);
  // Kiểm tra dùng cấu hình ĐÃ LƯU → chỉ bật khi đã lưu đủ thông tin DCorp
  const canTestDcorp = !!brand && brand.posProvider === 'DCORP' && !!brand.dcorpClientId && brand.hasDcorpClientSecret && !!brand.dcorpBaseUrl;
  const testDcorp = async () => {
    if (!brand) return;
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await api.post<{ ok: boolean; message: string }>(`/brands/${brand.id}/dcorp-test`));
    } catch (e) {
      setTestResult({ ok: false, message: errMsg(e) });
    } finally {
      setTesting(false);
    }
  };
  useEffect(() => setHasKey(!!brand?.hasPosApiKey), [brand, open]);

  const rotateKey = async () => {
    if (!brand) return;
    setRotating(true);
    try {
      const { apiKey } = await api.post<{ apiKey: string }>(`/brands/${brand.id}/pos-api-key`);
      setHasKey(true);
      onKeyRotated();
      modal.success({
        title: 'API key POS mới',
        width: 560,
        content: (
          <div>
            <Typography.Paragraph>
              <Typography.Text code copyable={{ text: apiKey, tooltips: ['Sao chép', 'Đã sao chép'] }} style={{ wordBreak: 'break-all' }} data-testid="pos-api-key">
                {apiKey}
              </Typography.Text>
            </Typography.Paragraph>
            <Alert
              type="warning"
              showIcon
              message="Gửi key này cho DCorp, key chỉ hiển thị 1 lần."
              description="Connector gửi key trong header X-Api-Key khi gọi POST /api/pos/bills. Đóng hộp thoại này sẽ không xem lại được."
            />
          </div>
        ),
        okText: 'Đã lưu key',
      });
    } catch (e) {
      message.error(errMsg(e));
    } finally {
      setRotating(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      brand
        ? {
            code: brand.code,
            name: brand.name,
            logoUrl: brand.logoUrl,
            primaryColor: brand.primaryColor,
            hotline: brand.hotline ?? '',
            about: brand.about ?? '',
            zaloAppId: brand.zaloAppId ?? '',
            zaloOaId: brand.zaloOaId ?? '',
            posEnabled: brand.posEnabled,
            posProvider: brand.posProvider ?? 'WEBHOOK',
            posWebhookUrl: brand.posWebhookUrl ?? '',
            dcorpBaseUrl: brand.dcorpBaseUrl ?? '',
            dcorpClientId: brand.dcorpClientId ?? '',
            dcorpOrganization: brand.dcorpOrganization,
            active: brand.active,
          }
        : { primaryColor: '#C2410C', active: true, posEnabled: false, posProvider: 'DCORP', dcorpBaseUrl: DCORP_PRESETS[0].value },
    );
  }, [open, brand, form]);

  return (
    <Modal
      title={brand ? `Sửa thương hiệu: ${brand.name}` : 'Thêm thương hiệu'}
      open={open}
      onCancel={onClose}
      okText="Lưu"
      cancelText="Huỷ"
      confirmLoading={saving}
      onOk={() => form.submit()}
      width={760}
      forceRender
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={async (v) => {
          const opt = (x?: string) => (x?.trim() ? x.trim() : null);
          const secret = (val: string | undefined, clear: boolean | undefined) =>
            clear ? null : val?.trim() ? val.trim() : undefined; // undefined = không gửi = giữ nguyên
          const body: Record<string, unknown> = {
            code: v.code.trim().toUpperCase(),
            name: v.name.trim(),
            logoUrl: v.logoUrl || null,
            primaryColor: typeof v.primaryColor === 'string' ? v.primaryColor : v.primaryColor.toHexString(),
            hotline: opt(v.hotline),
            about: v.about?.trim() ? v.about : null,
            zaloAppId: opt(v.zaloAppId),
            zaloOaId: opt(v.zaloOaId),
            posEnabled: !!v.posEnabled,
            posProvider: v.posProvider ?? 'WEBHOOK',
            posWebhookUrl: opt(v.posWebhookUrl),
            dcorpBaseUrl: opt(v.dcorpBaseUrl)?.replace(/\/+$/, '') ?? null,
            dcorpClientId: opt(v.dcorpClientId),
            dcorpOrganization: v.dcorpOrganization ?? null,
            active: v.active,
          };
          const s3 = secret(v.posWebhookSecret, v.clearPosSecret);
          if (s3 !== undefined) body.posWebhookSecret = s3;
          const s4 = secret(v.dcorpClientSecret, v.clearDcorpSecret);
          if (s4 !== undefined) body.dcorpClientSecret = s4;
          const s1 = secret(v.zaloAppSecretKey, v.clearAppSecret);
          const s2 = secret(v.zaloOaAccessToken, v.clearOaToken);
          if (s1 !== undefined) body.zaloAppSecretKey = s1;
          if (s2 !== undefined) body.zaloOaAccessToken = s2;
          setSaving(true);
          try {
            if (brand) await api.put(`/brands/${brand.id}`, body);
            else await api.post('/brands', body);
            message.success('Đã lưu thương hiệu');
            onClose();
            await onSaved();
          } catch (e) {
            message.error(errMsg(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Row gutter={16}>
          <Col xs={24} md={14}>
            <Form.Item name="name" label="Tên thương hiệu" rules={[{ required: true, whitespace: true, message: 'Nhập tên thương hiệu' }]}>
              <Input maxLength={200} placeholder="VD: Nhà hàng Ngon" />
            </Form.Item>
          </Col>
          <Col xs={24} md={10}>
            <Form.Item
              name="code"
              label="Mã thương hiệu"
              rules={[
                { required: true, whitespace: true, message: 'Nhập mã' },
                { min: 2, message: 'Tối thiểu 2 ký tự' },
                { pattern: /^[A-Za-z0-9_-]+$/, message: 'Chỉ gồm chữ, số, dấu _ và -' },
              ]}
              extra={brand ? 'Đổi mã phải cập nhật VITE_BRAND của Mini App tương ứng' : 'Dùng trong cấu hình Mini App (VITE_BRAND)'}
            >
              <Input maxLength={30} style={{ textTransform: 'uppercase' }} placeholder="VD: BRAND_A" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col xs={24} md={14}>
            <Form.Item name="logoUrl" label="Logo">
              <ImageUpload />
            </Form.Item>
          </Col>
          <Col xs={12} md={5}>
            <Form.Item name="primaryColor" label="Màu chủ đạo">
              <ColorPicker showText format="hex" />
            </Form.Item>
          </Col>
          <Col xs={12} md={5}>
            <Form.Item name="active" label="Hoạt động" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="hotline" label="Hotline" extra="Khách bấm để gọi từ Mini App">
          <Input maxLength={30} />
        </Form.Item>
        <Form.Item name="about" label="Giới thiệu" extra="Hiển thị trong Mini App, giữ nguyên xuống dòng">
          <Input.TextArea rows={4} maxLength={5000} />
        </Form.Item>

        <Divider orientation="left" plain>
          Kết nối Zalo
        </Divider>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Secret key và OA access token chỉ ghi: hệ thống không bao giờ hiển thị lại giá trị đã lưu."
        />
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="zaloAppId" label="Zalo Mini App ID">
              <Input maxLength={100} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="zaloOaId" label="Zalo OA ID">
              <Input maxLength={100} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <SecretField
              form={form}
              name="zaloAppSecretKey"
              clearName="clearAppSecret"
              label="App secret key"
              configured={!!brand?.hasZaloAppSecretKey}
            />
          </Col>
          <Col xs={24} md={12}>
            <SecretField
              form={form}
              name="zaloOaAccessToken"
              clearName="clearOaToken"
              label="OA access token"
              configured={!!brand?.hasZaloOaAccessToken}
            />
          </Col>
        </Row>

        <Divider orientation="left" plain>
          Kết nối phần mềm bán hàng (r_keeper)
        </Divider>
        <Typography.Paragraph type="secondary">
          Khi khách đăng ký thành viên, CRM gửi thông tin khách sang r_keeper (qua API DCorp RK7 CRM hoặc connector tự viết). Bill thanh toán / huỷ từ r_keeper
          được gửi về CRM để cộng điểm và chi tiêu. Mỗi cơ sở cần khai báo <b>Mã POS</b> tương ứng.
        </Typography.Paragraph>
        <Form.Item name="posEnabled" label="Bật kết nối POS" valuePropName="checked">
          <Switch data-testid="pos-enabled" />
        </Form.Item>
        <Form.Item name="posProvider" label="Cách gửi khách mới sang POS">
          <Radio.Group
            disabled={!posEnabled}
            options={[
              { value: 'DCORP', label: 'API DCorp (RK7 CRM)' },
              { value: 'WEBHOOK', label: 'Connector tự viết (webhook)' },
            ]}
            data-testid="pos-provider"
          />
        </Form.Item>
        {posProvider === 'DCORP' ? (
          <>
            <Row gutter={16}>
              <Col xs={24} md={14}>
                <Form.Item
                  name="dcorpBaseUrl"
                  label="Địa chỉ API DCorp"
                  rules={[{ validator: (_, v: string | undefined) => validHttpUrl(v) }]}
                  extra="Chọn môi trường hoặc nhập địa chỉ khác"
                >
                  <AutoComplete
                    disabled={!posEnabled}
                    options={DCORP_PRESETS}
                    placeholder="https://api-stg.dcorp.com.vn"
                    data-testid="dcorp-base-url"
                  />
                </Form.Item>
              </Col>
              <Col xs={24} md={10}>
                <Form.Item name="dcorpOrganization" label="Organization" extra="Mã tổ chức DCorp cấp, UAT và PROD khác nhau">
                  <InputNumber min={1} precision={0} style={{ width: '100%' }} disabled={!posEnabled} data-testid="dcorp-org" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="dcorpClientId" label="Client ID">
                  <Input maxLength={200} autoComplete="off" disabled={!posEnabled} data-testid="dcorp-client-id" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <SecretField
                  form={form}
                  name="dcorpClientSecret"
                  clearName="clearDcorpSecret"
                  label="Client secret"
                  configured={!!brand?.hasDcorpClientSecret}
                />
              </Col>
            </Row>
            <Form.Item>
              <Space direction="vertical" style={{ width: '100%' }}>
                <Tooltip title={canTestDcorp ? 'Lấy thử access token bằng thông tin đã lưu' : 'Lưu Client ID, Client secret và địa chỉ API trước, rồi mở lại để kiểm tra'}>
                  <Button icon={<ApiOutlined />} onClick={testDcorp} loading={testing} disabled={!canTestDcorp} data-testid="dcorp-test">
                    Kiểm tra kết nối DCorp
                  </Button>
                </Tooltip>
                {testResult ? (
                  <Alert
                    type={testResult.ok ? 'success' : 'error'}
                    showIcon
                    message={testResult.ok ? 'Kết nối DCorp thành công' : 'Kết nối DCorp thất bại'}
                    description={testResult.message}
                    data-testid="dcorp-test-result"
                  />
                ) : null}
              </Space>
            </Form.Item>
          </>
        ) : (
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item
              name="posWebhookUrl"
              label="Webhook URL (connector DCorp)"
              rules={[{ validator: (_, v: string | undefined) => validHttpUrl(v) }]}
              extra="CRM gửi khách hàng mới / cập nhật tới địa chỉ này"
            >
              <Input placeholder="https://connector.dcorp.vn/crm/webhook" disabled={!posEnabled} maxLength={1000} data-testid="pos-webhook-url" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <SecretField
              form={form}
              name="posWebhookSecret"
              clearName="clearPosSecret"
              label="Webhook secret (ký HMAC)"
              configured={!!brand?.hasPosWebhookSecret}
            />
          </Col>
        </Row>
        )}
        <Form.Item label="API key POS (nhận bill)" extra="Dùng khi DCorp/r_keeper gửi bill về CRM (header X-Api-Key khi gọi POST /api/pos/bills).">
          <Space wrap>
            {hasKey ? (
              <Tag color="green" icon={<CheckCircleFilled />}>
                Đã tạo
              </Tag>
            ) : (
              <Tag>Chưa tạo</Tag>
            )}
            {brand ? (
              <Popconfirm
                title="Tạo API key mới?"
                description={hasKey ? 'Key cũ sẽ ngừng hoạt động ngay – connector phải cập nhật key mới.' : 'Key chỉ hiển thị 1 lần sau khi tạo.'}
                okText="Tạo key"
                cancelText="Không"
                onConfirm={rotateKey}
              >
                <Button icon={<KeyOutlined />} loading={rotating} data-testid="pos-rotate-key">
                  Tạo API key mới
                </Button>
              </Popconfirm>
            ) : (
              <Typography.Text type="secondary">Lưu thương hiệu trước rồi tạo key.</Typography.Text>
            )}
          </Space>
        </Form.Item>
      </Form>
    </Modal>
  );
}
