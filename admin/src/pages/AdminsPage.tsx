import { useEffect, useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Select, Switch, Table, Tag } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '../api/client';
import type { AdminUser, Role } from '../api/types';
import { useRequest } from '../hooks/useRequest';
import { useAuth } from '../auth/AuthContext';
import { ROLE_LABEL } from '../auth/roles';
import { PageHeader } from '../components/PageHeader';
import { datetime, errMsg } from '../utils/format';

export default function AdminsPage() {
  const { user } = useAuth();
  const { message } = App.useApp();
  const { data, loading, reload } = useRequest(() => api.get<AdminUser[]>('/admins'), []);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="Tài khoản quản trị"
        subtitle="Quản lý: toàn quyền. Nhân viên: tạo hoá đơn, xử lý đặt bàn, tặng voucher, xem dữ liệu."
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Thêm tài khoản
          </Button>
        }
      />
      <Card>
        <Table<AdminUser>
          rowKey="id"
          loading={loading}
          dataSource={data}
          pagination={false}
          columns={[
            { title: 'Tên đăng nhập', dataIndex: 'username', render: (v, a) => (a.id === user?.id ? <>{v} <Tag>Bạn</Tag></> : v) },
            { title: 'Họ tên', dataIndex: 'name' },
            { title: 'Vai trò', dataIndex: 'role', render: (r: Role) => <Tag color={r === 'ADMIN' ? 'volcano' : 'blue'}>{ROLE_LABEL[r]}</Tag> },
            {
              title: 'Hoạt động',
              dataIndex: 'active',
              render: (v: boolean, a) => (
                <Switch
                  size="small"
                  checked={v}
                  disabled={a.id === user?.id}
                  onChange={async (c) => {
                    try {
                      await api.put(`/admins/${a.id}`, { active: c });
                      message.success(c ? 'Đã mở khoá tài khoản' : 'Đã khoá tài khoản');
                      reload();
                    } catch (e) {
                      message.error(errMsg(e));
                    }
                  }}
                />
              ),
            },
            { title: 'Ngày tạo', dataIndex: 'createdAt', render: datetime },
            {
              title: '',
              width: 60,
              render: (_, a) => (
                <Button
                  type="text"
                  icon={<EditOutlined />}
                  title="Sửa"
                  onClick={() => {
                    setEditing(a);
                    setOpen(true);
                  }}
                />
              ),
            },
          ]}
        />
      </Card>
      <AdminModal open={open} admin={editing} selfId={user?.id} onClose={() => setOpen(false)} onSaved={() => reload()} />
    </>
  );
}

interface AdminForm {
  username: string;
  name: string;
  role: Role;
  password?: string;
  active: boolean;
}

function AdminModal({
  open,
  admin,
  selfId,
  onClose,
  onSaved,
}: {
  open: boolean;
  admin: AdminUser | null;
  selfId?: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm<AdminForm>();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  const isSelf = !!admin && admin.id === selfId;
  useEffect(() => {
    if (!open) return;
    form.resetFields();
    form.setFieldsValue(admin ? { username: admin.username, name: admin.name, role: admin.role, active: admin.active ?? true } : { role: 'STAFF', active: true });
  }, [open, admin, form]);
  return (
    <Modal
      title={admin ? `Sửa tài khoản ${admin.username}` : 'Thêm tài khoản'}
      open={open}
      onCancel={onClose}
      okText="Lưu"
      cancelText="Huỷ"
      confirmLoading={saving}
      onOk={() => form.submit()}
      forceRender
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={async (v) => {
          setSaving(true);
          try {
            if (admin) {
              await api.put(`/admins/${admin.id}`, {
                name: v.name.trim(),
                role: v.role,
                active: v.active,
                ...(v.password ? { password: v.password } : {}),
              });
            } else {
              await api.post('/admins', { username: v.username.trim(), name: v.name.trim(), password: v.password, role: v.role });
            }
            message.success('Đã lưu tài khoản');
            onSaved();
            onClose();
          } catch (e) {
            message.error(errMsg(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form.Item
          name="username"
          label="Tên đăng nhập"
          rules={[
            { required: true, message: 'Nhập tên đăng nhập' },
            { min: 3, message: 'Tối thiểu 3 ký tự' },
            { pattern: /^[a-zA-Z0-9_.]+$/, message: 'Chỉ dùng chữ, số, dấu _ và .' },
          ]}
        >
          <Input disabled={!!admin} autoComplete="off" maxLength={50} />
        </Form.Item>
        <Form.Item name="name" label="Họ tên" rules={[{ required: true, whitespace: true, message: 'Nhập họ tên' }]}>
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item name="role" label="Vai trò" extra={isSelf ? 'Không thể tự hạ quyền tài khoản của chính mình' : undefined}>
          <Select
            disabled={isSelf}
            options={[
              { value: 'STAFF', label: 'Nhân viên' },
              { value: 'ADMIN', label: 'Quản lý' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="password"
          label={admin ? 'Đặt lại mật khẩu' : 'Mật khẩu'}
          extra={admin ? 'Để trống nếu không đổi' : undefined}
          rules={[{ required: !admin, message: 'Nhập mật khẩu' }, { min: 6, message: 'Tối thiểu 6 ký tự' }]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        {admin ? (
          <Form.Item name="active" label="Hoạt động" valuePropName="checked">
            <Switch disabled={isSelf} />
          </Form.Item>
        ) : null}
      </Form>
    </Modal>
  );
}
