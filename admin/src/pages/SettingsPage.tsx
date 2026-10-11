import { useEffect, useState } from 'react';
import { App, Button, Card, Col, Form, Input, InputNumber, Row, Skeleton, Typography } from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { api } from '../api/client';
import type { Settings } from '../api/types';
import { useRequest } from '../hooks/useRequest';
import { PageHeader } from '../components/PageHeader';
import { errMsg, money, moneyInput } from '../utils/format';

const NUMERIC: (keyof Settings)[] = ['pointPerAmount', 'welcomePoints', 'bookingMinAdvanceMinutes', 'bookingMaxDays', 'maxPartySize'];

type FormValues = Omit<Settings, 'pointPerAmount' | 'welcomePoints' | 'bookingMinAdvanceMinutes' | 'bookingMaxDays' | 'maxPartySize'> & {
  pointPerAmount: number;
  welcomePoints: number;
  bookingMinAdvanceMinutes: number;
  bookingMaxDays: number;
  maxPartySize: number;
};

export default function SettingsPage() {
  const { message } = App.useApp();
  const [form] = Form.useForm<FormValues>();
  const { data } = useRequest(() => api.get<Settings>('/settings'), []);
  const [saving, setSaving] = useState(false);
  const ppa = Form.useWatch('pointPerAmount', form);

  useEffect(() => {
    if (!data) return;
    const v: Record<string, string | number> = { ...data };
    for (const k of NUMERIC) v[k] = Number(data[k]);
    form.setFieldsValue(v as unknown as FormValues);
  }, [data, form]);

  if (!data) return <Skeleton active paragraph={{ rows: 10 }} />;

  return (
    <>
      <PageHeader title="Cài đặt" subtitle="Cấu hình chung cho Mini App và chương trình tích điểm" />
      <Form
        form={form}
        layout="vertical"
        onFinish={async (v) => {
          setSaving(true);
          try {
            const body: Record<string, string> = {};
            for (const [k, val] of Object.entries(v)) body[k] = val === null || val === undefined ? '' : String(val);
            await api.put<Settings>('/settings', body);
            message.success('Đã lưu cài đặt');
          } catch (e) {
            message.error(errMsg(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title="Thông tin nhà hàng" style={{ height: '100%' }}>
              <Form.Item name="restaurantName" label="Tên nhà hàng" rules={[{ required: true, whitespace: true, message: 'Nhập tên nhà hàng' }]} extra="Hiển thị trên đầu Mini App">
                <Input maxLength={200} />
              </Form.Item>
              <Form.Item name="hotline" label="Hotline" extra="Khách bấm để gọi từ Mini App">
                <Input maxLength={30} />
              </Form.Item>
              <Form.Item name="about" label="Giới thiệu" extra="Đoạn giới thiệu ngắn về nhà hàng, giữ nguyên xuống dòng">
                <Input.TextArea rows={6} maxLength={5000} />
              </Form.Item>
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card title="Tích điểm" style={{ marginBottom: 16 }}>
              <Form.Item
                name="pointPerAmount"
                label="Số tiền cho 1 điểm"
                rules={[{ required: true, message: 'Bắt buộc' }]}
                extra={`Khách nhận 1 điểm cho mỗi ${money(ppa || 0)} thanh toán, sau đó nhân với hệ số của hạng. VD: hoá đơn 500.000đ, hạng hệ số ×1,5 → ${
                  ppa ? Math.floor((500000 / ppa) * 1.5) : 0
                } điểm.`}
              >
                <InputNumber min={1} step={1000} suffix="đ" style={{ width: 240 }} {...moneyInput} />
              </Form.Item>
              <Form.Item name="welcomePoints" label="Điểm chào mừng" rules={[{ required: true, message: 'Bắt buộc' }]} extra="Tặng một lần khi khách đăng ký thành viên lần đầu. 0 = không tặng.">
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
        </Row>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} size="large">
            Lưu cài đặt
          </Button>
          <Typography.Text type="secondary">Thay đổi áp dụng ngay cho Mini App và các hoá đơn mới.</Typography.Text>
        </div>
      </Form>
    </>
  );
}
