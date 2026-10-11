import { useEffect, useState } from 'react';
import { Alert, App, Button, Card, ColorPicker, Form, Input, InputNumber, Modal, Popconfirm, Space, Table, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { Color } from 'antd/es/color-picker';
import { api } from '../api/client';
import type { Tier } from '../api/types';
import { useRequest } from '../hooks/useRequest';
import { useIsManager } from '../auth/useIsManager';
import { invalidateCatalog } from '../hooks/useCatalog';
import { PageHeader } from '../components/PageHeader';
import { TierTag } from '../components/TierTag';
import { errMsg, num } from '../utils/format';

export default function TiersPage() {
  const manager = useIsManager();
  const { message } = App.useApp();
  const { data, loading, reload } = useRequest(() => api.get<Tier[]>('/tiers'), []);
  const [editing, setEditing] = useState<Tier | null>(null);
  const [open, setOpen] = useState(false);
  const changed = () => {
    invalidateCatalog('tiers');
    reload();
  };

  return (
    <>
      <PageHeader
        title="Hạng thành viên"
        subtitle="Khách tự động lên hạng khi điểm tích luỹ đạt mức tối thiểu."
        extra={
          manager ? (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              Thêm hạng
            </Button>
          ) : null
        }
      />
      <Card>
        <Table<Tier>
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={false}
          scroll={{ x: 900 }}
          columns={[
            { title: 'Hạng', render: (_, t) => <TierTag tier={t} /> },
            { title: 'Mã', dataIndex: 'code' },
            { title: 'Điểm tích luỹ tối thiểu', dataIndex: 'minPoints', align: 'right', render: num },
            { title: 'Hệ số điểm', dataIndex: 'pointMultiplier', align: 'right', render: (v) => `×${v}` },
            {
              title: 'Quyền lợi',
              dataIndex: 'benefits',
              render: (v: string | null) =>
                v ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {v
                      .split('\n')
                      .filter((l) => l.trim())
                      .map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                  </ul>
                ) : (
                  '—'
                ),
            },
            {
              title: 'Số khách',
              align: 'right',
              render: (_, t) => <Link to={`/customers?tierId=${t.id}`}>{num(t._count?.customers ?? 0)}</Link>,
            },
            {
              title: '',
              width: 100,
              render: (_, t) =>
                manager ? (
                  <Space size={0}>
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      title="Sửa"
                      onClick={() => {
                        setEditing(t);
                        setOpen(true);
                      }}
                    />
                    <Popconfirm
                      title="Xoá hạng này?"
                      description="Khách thuộc hạng này sẽ được xếp lại hạng theo điểm tích luỹ."
                      okText="Xoá"
                      okButtonProps={{ danger: true }}
                      cancelText="Không"
                      onConfirm={async () => {
                        try {
                          await api.del(`/tiers/${t.id}`);
                          message.success('Đã xoá hạng');
                          changed();
                        } catch (e) {
                          message.error(errMsg(e));
                        }
                      }}
                    >
                      <Button type="text" danger icon={<DeleteOutlined />} title="Xoá" />
                    </Popconfirm>
                  </Space>
                ) : null,
            },
          ]}
        />
      </Card>
      <TierModal open={open} tier={editing} onClose={() => setOpen(false)} onSaved={changed} />
    </>
  );
}

interface TierForm {
  name: string;
  code: string;
  minPoints: number;
  pointMultiplier: number;
  color: string | Color;
  benefits?: string;
}

function TierModal({ open, tier, onClose, onSaved }: { open: boolean; tier: Tier | null; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<TierForm>();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      tier
        ? { name: tier.name, code: tier.code, minPoints: tier.minPoints, pointMultiplier: tier.pointMultiplier, color: tier.color, benefits: tier.benefits ?? '' }
        : { minPoints: 0, pointMultiplier: 1, color: '#9E9E9E' },
    );
  }, [open, tier, form]);
  return (
    <Modal
      title={tier ? `Sửa hạng ${tier.name}` : 'Thêm hạng thành viên'}
      open={open}
      onCancel={onClose}
      okText="Lưu"
      cancelText="Huỷ"
      confirmLoading={saving}
      onOk={() => form.submit()}
      forceRender
    >
      <Alert type="info" showIcon style={{ marginBottom: 16 }} message="Sau khi lưu, hệ thống tự xếp lại hạng cho toàn bộ khách hàng." />
      <Form
        form={form}
        layout="vertical"
        onFinish={async (v) => {
          const color = typeof v.color === 'string' ? v.color : v.color.toHexString();
          const body = {
            name: v.name.trim(),
            code: v.code.trim().toUpperCase(),
            minPoints: v.minPoints,
            pointMultiplier: v.pointMultiplier,
            color,
            benefits: v.benefits?.trim() ? v.benefits.trim() : null,
          };
          setSaving(true);
          try {
            if (tier) await api.put(`/tiers/${tier.id}`, body);
            else await api.post('/tiers', body);
            message.success('Đã lưu hạng thành viên');
            onSaved();
            onClose();
          } catch (e) {
            message.error(errMsg(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form.Item name="name" label="Tên hạng" rules={[{ required: true, whitespace: true, message: 'Nhập tên hạng' }]}>
          <Input maxLength={100} placeholder="VD: Vàng" />
        </Form.Item>
        <Form.Item
          name="code"
          label="Mã hạng"
          rules={[
            { required: true, whitespace: true, message: 'Nhập mã hạng' },
            { pattern: /^[A-Za-z0-9_]+$/, message: 'Chỉ chữ, số và dấu _' },
          ]}
          extra="Mã duy nhất, viết hoa không dấu, VD: GOLD"
        >
          <Input maxLength={50} style={{ textTransform: 'uppercase' }} />
        </Form.Item>
        <Space size={16} wrap>
          <Form.Item name="minPoints" label="Điểm tích luỹ tối thiểu" rules={[{ required: true, message: 'Bắt buộc' }]}>
            <InputNumber min={0} precision={0} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="pointMultiplier" label="Hệ số nhân điểm" rules={[{ required: true, message: 'Bắt buộc' }]} extra="VD 1.5 = nhận gấp 1,5 lần điểm">
            <InputNumber min={0} max={100} step={0.1} style={{ width: 160 }} prefix="×" />
          </Form.Item>
          <Form.Item name="color" label="Màu hiển thị">
            <ColorPicker showText format="hex" />
          </Form.Item>
        </Space>
        <Form.Item name="benefits" label="Quyền lợi" extra="Mỗi dòng là một quyền lợi">
          <Input.TextArea rows={5} maxLength={5000} />
        </Form.Item>
        <Typography.Text type="secondary">Hạng có điểm tối thiểu 0 là hạng mặc định cho khách mới.</Typography.Text>
      </Form>
    </Modal>
  );
}
