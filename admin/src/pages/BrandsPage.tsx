import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  App,
  Avatar,
  Button,
  Card,
  Checkbox,
  Col,
  ColorPicker,
  Divider,
  Form,
  Input,
  Modal,
  Row,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { Color } from 'antd/es/color-picker';
import { CheckCircleFilled, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '../api/client';
import type { Brand } from '../api/types';
import { useRequest } from '../hooks/useRequest';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/PageHeader';
import { ImageUpload } from '../components/ImageUpload';
import { BrandDot } from '../components/BrandBadge';
import { errMsg, num } from '../utils/format';

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
      <BrandModal open={open} brand={editing} onClose={() => setOpen(false)} onSaved={changed} />
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
  name: 'zaloAppSecretKey' | 'zaloOaAccessToken';
  clearName: 'clearAppSecret' | 'clearOaToken';
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

function BrandModal({ open, brand, onClose, onSaved }: { open: boolean; brand: Brand | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form] = Form.useForm<BrandForm>();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);

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
            active: brand.active,
          }
        : { primaryColor: '#C2410C', active: true },
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
            active: v.active,
          };
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
      </Form>
    </Modal>
  );
}
