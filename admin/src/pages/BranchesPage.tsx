import { useEffect, useState } from 'react';
import { App, Button, Card, Col, Form, Image, Input, Modal, Popconfirm, Row, Space, Switch, Table, TimePicker, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { api } from '../api/client';
import type { Branch } from '../api/types';
import { useRequest } from '../hooks/useRequest';
import { useIsManager } from '../auth/useIsManager';
import { invalidateCatalog } from '../hooks/useCatalog';
import { PageHeader } from '../components/PageHeader';
import { ImageUpload } from '../components/ImageUpload';
import { errMsg } from '../utils/format';

export default function BranchesPage() {
  const manager = useIsManager();
  const { message } = App.useApp();
  const { data, loading, reload } = useRequest(() => api.get<Branch[]>('/branches'), []);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [open, setOpen] = useState(false);
  const changed = () => {
    invalidateCatalog('branches');
    reload();
  };
  return (
    <>
      <PageHeader
        title="Chi nhánh"
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
              Thêm chi nhánh
            </Button>
          ) : null
        }
      />
      <Card>
        <Table<Branch>
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={false}
          scroll={{ x: 900 }}
          columns={[
            {
              title: 'Chi nhánh',
              render: (_, b) => (
                <Space>
                  {b.imageUrl ? (
                    <Image src={b.imageUrl} width={72} height={48} style={{ objectFit: 'cover', borderRadius: 4 }} />
                  ) : (
                    <div style={{ width: 72, height: 48, background: '#f0f0f0', borderRadius: 4 }} />
                  )}
                  <div>
                    <Typography.Text strong>{b.name}</Typography.Text>
                    <div>
                      <Typography.Text type="secondary">{b.address}</Typography.Text>
                    </div>
                  </div>
                </Space>
              ),
            },
            { title: 'Điện thoại', dataIndex: 'phone', render: (v) => v || '—' },
            { title: 'Giờ mở cửa', render: (_, b) => `${b.openTime} – ${b.closeTime}` },
            {
              title: 'Hoạt động',
              dataIndex: 'active',
              render: (v: boolean, b) => (
                <Switch
                  size="small"
                  checked={v}
                  disabled={!manager}
                  onChange={async (c) => {
                    try {
                      await api.put(`/branches/${b.id}`, { active: c });
                      changed();
                    } catch (e) {
                      message.error(errMsg(e));
                    }
                  }}
                />
              ),
            },
            {
              title: '',
              width: 100,
              render: (_, b) =>
                manager ? (
                  <Space size={0}>
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      title="Sửa"
                      onClick={() => {
                        setEditing(b);
                        setOpen(true);
                      }}
                    />
                    <Popconfirm
                      title="Xoá chi nhánh?"
                      description="Chi nhánh đã có đặt bàn/hoá đơn sẽ chỉ bị ngừng hoạt động."
                      okText="Xoá"
                      okButtonProps={{ danger: true }}
                      cancelText="Không"
                      onConfirm={async () => {
                        try {
                          const r = await api.del<{ deleted: boolean }>(`/branches/${b.id}`);
                          message.success(r.deleted ? 'Đã xoá chi nhánh' : 'Chi nhánh đã có dữ liệu nên được chuyển sang ngừng hoạt động');
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
      <BranchModal open={open} branch={editing} onClose={() => setOpen(false)} onSaved={changed} />
    </>
  );
}

interface BranchForm {
  name: string;
  address: string;
  phone?: string;
  openTime: Dayjs;
  closeTime: Dayjs;
  imageUrl?: string | null;
  active: boolean;
}

const hm = (s: string) => dayjs(s, 'HH:mm');

function BranchModal({ open, branch, onClose, onSaved }: { open: boolean; branch: Branch | null; onClose: () => void; onSaved: () => void }) {
  const [form] = Form.useForm<BranchForm>();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(
      branch
        ? {
            name: branch.name,
            address: branch.address,
            phone: branch.phone ?? '',
            openTime: hm(branch.openTime),
            closeTime: hm(branch.closeTime),
            imageUrl: branch.imageUrl,
            active: branch.active,
          }
        : { openTime: hm('10:00'), closeTime: hm('22:00'), active: true },
    );
  }, [open, branch, form]);
  return (
    <Modal
      title={branch ? 'Sửa chi nhánh' : 'Thêm chi nhánh'}
      open={open}
      onCancel={onClose}
      okText="Lưu"
      cancelText="Huỷ"
      confirmLoading={saving}
      onOk={() => form.submit()}
      forceRender
      width={640}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={async (v) => {
          const body = {
            name: v.name.trim(),
            address: v.address.trim(),
            phone: v.phone?.trim() || null,
            openTime: v.openTime.format('HH:mm'),
            closeTime: v.closeTime.format('HH:mm'),
            imageUrl: v.imageUrl || null,
            active: v.active,
          };
          setSaving(true);
          try {
            if (branch) await api.put(`/branches/${branch.id}`, body);
            else await api.post('/branches', body);
            message.success('Đã lưu chi nhánh');
            onSaved();
            onClose();
          } catch (e) {
            message.error(errMsg(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form.Item name="name" label="Tên chi nhánh" rules={[{ required: true, whitespace: true, message: 'Nhập tên chi nhánh' }]}>
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item name="address" label="Địa chỉ" rules={[{ required: true, whitespace: true, message: 'Nhập địa chỉ' }]}>
          <Input maxLength={500} />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="phone" label="Điện thoại">
              <Input maxLength={20} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="openTime" label="Giờ mở cửa" rules={[{ required: true, message: 'Bắt buộc' }]}>
              <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} needConfirm={false} />
            </Form.Item>
          </Col>
          <Col xs={12} md={8}>
            <Form.Item name="closeTime" label="Giờ đóng cửa" rules={[{ required: true, message: 'Bắt buộc' }]}>
              <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} needConfirm={false} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="imageUrl" label="Ảnh">
          <ImageUpload />
        </Form.Item>
        <Form.Item name="active" label="Đang hoạt động" valuePropName="checked" extra="Chi nhánh ngừng hoạt động sẽ không hiện khi khách đặt bàn">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
