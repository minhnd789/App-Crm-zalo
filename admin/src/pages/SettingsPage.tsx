import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Card, Col, Descriptions, Form, InputNumber, Row, Skeleton, Space, Typography } from 'antd';
import { EditOutlined, SaveOutlined } from '@ant-design/icons';
import { api } from '../api/client';
import type { Settings } from '../api/types';
import { useRequest } from '../hooks/useRequest';
import { useAuth } from '../auth/AuthContext';
import { useIsSuperAdmin } from '../auth/useIsManager';
import { PageHeader } from '../components/PageHeader';
import { BrandDot, BrandSelect, BrandTag } from '../components/BrandBadge';
import { errMsg, money, moneyInput } from '../utils/format';

type FormValues = Record<keyof Settings, number>;

export default function SettingsPage() {
  const { message } = App.useApp();
  const { brand: filterBrand, brands } = useAuth();
  const superAdmin = useIsSuperAdmin();
  const [form] = Form.useForm<FormValues>();
  // Đang xem tất cả thương hiệu → chọn thương hiệu cần cài đặt
  const [pickedId, setPickedId] = useState<number | undefined>(filterBrand?.id ?? brands[0]?.id);
  const brand = filterBrand ?? brands.find((b) => b.id === pickedId) ?? null;
  const brandQuery = filterBrand ? undefined : brand?.id;
  const { data } = useRequest(() => api.get<Settings>('/settings', { brandId: brandQuery }), [brandQuery], { enabled: !!brand });
  const [saving, setSaving] = useState(false);
  const ppa = Form.useWatch('pointPerAmount', form);

  useEffect(() => {
    if (!data) return;
    const v = {} as FormValues;
    for (const [k, val] of Object.entries(data)) v[k as keyof Settings] = Number(val);
    form.setFieldsValue(v);
  }, [data, form]);

  const header = (
    <>
      <PageHeader
        title="Cài đặt"
        subtitle="Cấu hình tích điểm và đặt bàn riêng của từng thương hiệu"
        extra={
          filterBrand ? (
            <BrandTag brand={filterBrand} />
          ) : (
            <Space>
              <Typography.Text type="secondary">Thương hiệu:</Typography.Text>
              <BrandSelect style={{ width: 240 }} value={pickedId} onChange={setPickedId} data-testid="settings-brand" />
            </Space>
          )
        }
      />
    </>
  );

  if (!brand) return header;
  if (!data) return (
    <>
      {header}
      <Skeleton active paragraph={{ rows: 10 }} />
    </>
  );

  return (
    <>
      {header}
      <Form
        form={form}
        layout="vertical"
        onFinish={async (v) => {
          setSaving(true);
          try {
            const body: Record<string, string> = {};
            for (const [k, val] of Object.entries(v)) body[k] = val === null || val === undefined ? '' : String(val);
            await api.put<Settings>(`/settings${brandQuery ? `?brandId=${brandQuery}` : ''}`, body);
            message.success(`Đã lưu cài đặt cho ${brand.name}`);
          } catch (e) {
            message.error(errMsg(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title="Tích điểm" style={{ marginBottom: 16 }}>
              <Form.Item
                name="pointPerAmount"
                label="Số tiền cho 1 điểm"
                rules={[{ required: true, message: 'Bắt buộc' }]}
                extra={`Khách nhận 1 điểm cho mỗi ${money(ppa || 0)} thanh toán tại thương hiệu này, sau đó nhân với hệ số của hạng. VD: hoá đơn 500.000đ, hạng hệ số ×1,5 → ${
                  ppa ? Math.floor((500000 / ppa) * 1.5) : 0
                } điểm.`}
              >
                <InputNumber min={1} step={1000} suffix="đ" style={{ width: 240 }} {...moneyInput} />
              </Form.Item>
              <Form.Item
                name="welcomePoints"
                label="Điểm chào mừng"
                rules={[{ required: true, message: 'Bắt buộc' }]}
                extra="Tặng một lần khi khách vào Mini App của thương hiệu lần đầu. 0 = không tặng."
              >
                <InputNumber min={0} precision={0} suffix="điểm" style={{ width: 240 }} />
              </Form.Item>
            </Card>
            <Card title="Đặt bàn">
              <Form.Item
                name="bookingMinAdvanceMinutes"
                label="Đặt trước tối thiểu"
                rules={[{ required: true, message: 'Bắt buộc' }]}
                extra="Khách phải đặt bàn trước giờ đến ít nhất bao nhiêu phút."
              >
                <InputNumber min={0} precision={0} suffix="phút" style={{ width: 240 }} />
              </Form.Item>
              <Form.Item name="bookingMaxDays" label="Đặt trước tối đa" rules={[{ required: true, message: 'Bắt buộc' }]} extra="Khách chỉ được chọn ngày trong khoảng này kể từ hôm nay.">
                <InputNumber min={1} precision={0} suffix="ngày" style={{ width: 240 }} />
              </Form.Item>
              <Form.Item name="maxPartySize" label="Số khách tối đa mỗi lượt đặt" rules={[{ required: true, message: 'Bắt buộc' }]} extra="Đoàn đông hơn cần gọi hotline.">
                <InputNumber min={1} precision={0} suffix="người" style={{ width: 240 }} />
              </Form.Item>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            {brand ? (
              <Card
                title="Thông tin thương hiệu"
                extra={
                  superAdmin ? (
                    <Link to={`/brands?edit=${brand.id}`}>
                      <Button icon={<EditOutlined />}>Sửa thương hiệu</Button>
                    </Link>
                  ) : null
                }
              >
                <Descriptions column={1} size="small" styles={{ label: { width: 130 } }}>
                  <Descriptions.Item label="Tên">
                    <BrandDot color={brand.primaryColor} /> <b>{brand.name}</b> ({brand.code})
                  </Descriptions.Item>
                  <Descriptions.Item label="Hotline">{brand.hotline || '—'}</Descriptions.Item>
                  <Descriptions.Item label="Giới thiệu">
                    <span className="pre-line">{brand.about || '—'}</span>
                  </Descriptions.Item>
                </Descriptions>
                <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                  Tên, logo, màu, hotline, giới thiệu và cấu hình Zalo được quản lý ở trang Thương hiệu
                  {superAdmin ? '.' : ' (chỉ quản trị toàn hệ thống).'}
                </Typography.Paragraph>
              </Card>
            ) : null}
          </Col>
        </Row>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} size="large">
            Lưu cài đặt
          </Button>
          <Typography.Text type="secondary">Thay đổi áp dụng ngay cho Mini App và các hoá đơn mới của thương hiệu này.</Typography.Text>
        </div>
      </Form>
    </>
  );
}
