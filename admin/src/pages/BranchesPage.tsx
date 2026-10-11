import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { App, Button, Card, Col, Empty, Form, Tag, Image, Input, Modal, Popconfirm, Row, Space, Switch, Table, TimePicker, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { api } from '../api/client';
import type { Branch } from '../api/types';
import { useRequest } from '../hooks/useRequest';
import { useIsManager } from '../auth/useIsManager';
import { invalidateCatalog } from '../hooks/useCatalog';
import { PageHeader } from '../components/PageHeader';
import { BrandDot, BrandSelect, BrandTag } from '../components/BrandBadge';
import { useAuth } from '../auth/AuthContext';
import { ImageUpload } from '../components/ImageUpload';
import { errMsg, num } from '../utils/format';

export default function BranchesPage() {
  const manager = useIsManager();
  const { message } = App.useApp();
  const { data, loading, reload } = useRequest(() => api.get<Branch[]>('/branches'), []);
  const { brands, brand: filterBrand } = useAuth();
  const groups = useMemo(() => {
    const m = new Map<number, Branch[]>();
    for (const b of data ?? []) {
      if (!m.has(b.brandId)) m.set(b.brandId, []);
      m.get(b.brandId)!.push(b);
    }
    return [...m.entries()];
  }, [data]);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [open, setOpen] = useState(false);
  const changed = () => {
    invalidateCatalog('branches');
    reload();
  };
  return (
    <>
      <PageHeader
        title="Cơ sở"
        scoped
        subtitle="Mỗi thương hiệu có các cơ sở đặt tên theo vị trí (VD: Quận 1). Khách chọn cơ sở hay đến khi đăng ký thành viên."
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
              Thêm cơ sở
            </Button>
          ) : null
        }
      />
      {groups.length === 0 && !loading ? (
        <Card>
          <Empty description="Chưa có cơ sở" />
        </Card>
      ) : null}
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {(groups.length ? groups : [[0, [] as Branch[]] as const]).map(([bid, list]) => {
          const b = brands.find((x) => x.id === bid);
          return (
            <Card
              key={bid}
              loading={loading && !data}
              title={
                b ? (
                  <Space>
                    <BrandDot color={b.primaryColor} size={12} />
                    {b.name}
                    <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
                      {list.length} cơ sở · {num(list.reduce((s, x) => s + (x._count?.members ?? 0), 0))} thành viên đăng ký
                    </Typography.Text>
                  </Space>
                ) : (
                  'Cơ sở'
                )
              }
            >
        <Table<Branch>
          rowKey="id"
                    dataSource={list}
          pagination={false}
          scroll={{ x: 900 }}
          columns={[
            {
              title: 'Cơ sở',
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
            {
              title: 'Mã POS',
              dataIndex: 'posCode',
              render: (v: string | null) => (v ? <Tag color="geekblue">{v}</Tag> : <Typography.Text type="secondary">—</Typography.Text>),
            },
            { title: 'Điện thoại', dataIndex: 'phone', render: (v) => v || '—' },
            {
              title: 'Thành viên đăng ký',
              align: 'right',
              render: (_, b) => <Link to={`/customers?branchId=${b.id}`}>{num(b._count?.members ?? 0)}</Link>,
            },
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
                      title="Xoá cơ sở?"
                      description="Cơ sở đã có đặt bàn/hoá đơn/thành viên sẽ chỉ bị ngừng hoạt động."
                      okText="Xoá"
                      okButtonProps={{ danger: true }}
                      cancelText="Không"
                      onConfirm={async () => {
                        try {
                          const r = await api.del<{ deleted: boolean }>(`/branches/${b.id}`);
                          message.success(r.deleted ? 'Đã xoá cơ sở' : 'Cơ sở đã có dữ liệu nên được chuyển sang ngừng hoạt động');
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
          );
        })}
      </Space>
      <BranchModal open={open} branch={editing} defaultBrandId={filterBrand?.id} onClose={() => setOpen(false)} onSaved={changed} />
    </>
  );
}

interface BranchForm {
  brandId?: number;
  posCode?: string;
  name: string;
  address: string;
  phone?: string;
  openTime: Dayjs;
  closeTime: Dayjs;
  imageUrl?: string | null;
  active: boolean;
}

const hm = (s: string) => dayjs(s, 'HH:mm');

function BranchModal({
  open,
  branch,
  defaultBrandId,
  onClose,
  onSaved,
}: {
  open: boolean;
  branch: Branch | null;
  defaultBrandId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
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
            posCode: branch.posCode ?? '',
            openTime: hm(branch.openTime),
            closeTime: hm(branch.closeTime),
            imageUrl: branch.imageUrl,
            active: branch.active,
          }
        : { openTime: hm('10:00'), closeTime: hm('22:00'), active: true, brandId: defaultBrandId },
    );
  }, [open, branch, form, defaultBrandId]);
  return (
    <Modal
      title={branch ? 'Sửa cơ sở' : 'Thêm cơ sở'}
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
            ...(!branch && !defaultBrandId ? { brandId: v.brandId } : {}),
            name: v.name.trim(),
            address: v.address.trim(),
            phone: v.phone?.trim() || null,
            posCode: v.posCode?.trim() || null,
            openTime: v.openTime.format('HH:mm'),
            closeTime: v.closeTime.format('HH:mm'),
            imageUrl: v.imageUrl || null,
            active: v.active,
          };
          setSaving(true);
          try {
            if (branch) await api.put(`/branches/${branch.id}`, body);
            else await api.post('/branches', body);
            message.success('Đã lưu cơ sở');
            onSaved();
            onClose();
          } catch (e) {
            message.error(errMsg(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        {branch ? (
          <Form.Item label="Thương hiệu">
            <BrandTag brand={branch.brand} brandId={branch.brandId} />
          </Form.Item>
        ) : !defaultBrandId ? (
          <Form.Item name="brandId" label="Thương hiệu" rules={[{ required: true, message: 'Chọn thương hiệu' }]}>
            <BrandSelect />
          </Form.Item>
        ) : null}
        <Form.Item
          name="name"
          label="Tên cơ sở (theo vị trí)"
          rules={[{ required: true, whitespace: true, message: 'Nhập tên cơ sở' }]}
          extra="Đặt theo vị trí, VD: Quận 1, Cầu Giấy. Khi hiển thị sẽ kèm tên thương hiệu."
        >
          <Input maxLength={200} placeholder="VD: Quận 1" />
        </Form.Item>
        <Form.Item
          name="posCode"
          label="Mã POS (r_keeper)"
          extra="Mã nhà hàng / điểm bán bên r_keeper – để bill gửi về được ghi nhận đúng cơ sở"
        >
          <Input maxLength={50} placeholder="VD: RK-Q1" data-testid="branch-pos-code" />
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
        <Form.Item name="active" label="Đang hoạt động" valuePropName="checked" extra="Cơ sở ngừng hoạt động sẽ không hiện khi khách đặt bàn / đăng ký">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
