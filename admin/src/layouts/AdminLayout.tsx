import { useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { App, Avatar, Button, Dropdown, Form, Grid, Input, Layout, Menu, Modal, Result, Select, Space, Tag, Typography, theme } from 'antd';
import type { MenuProps } from 'antd';
import {
  BankOutlined,
  CalendarOutlined,
  CrownOutlined,
  DashboardOutlined,
  GiftOutlined,
  KeyOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  NotificationOutlined,
  PlusCircleOutlined,
  SettingOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined,
  FileTextOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import { isManager, isSuperAdmin, ROLE_LABEL } from '../auth/roles';
import { BrandDot, BrandLabel } from '../components/BrandBadge';
import { api } from '../api/client';
import { errMsg } from '../utils/format';

const { Sider, Header, Content } = Layout;

export default function AdminLayout() {
  const { user, logout, brands, brand, brandId, setBrandId } = useAuth();
  const manager = isManager(user);
  const superAdmin = isSuperAdmin(user);
  const location = useLocation();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const [collapsed, setCollapsed] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const { token } = theme.useToken();
  const { message } = App.useApp();

  const items: MenuProps['items'] = useMemo(
    () => [
      { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Tổng quan</Link> },
      { key: '/orders/new', icon: <PlusCircleOutlined />, label: <Link to="/orders/new">Tạo hoá đơn</Link> },
      { type: 'divider' },
      { key: '/customers', icon: <TeamOutlined />, label: <Link to="/customers">Khách hàng</Link> },
      { key: '/bookings', icon: <CalendarOutlined />, label: <Link to="/bookings">Đặt bàn</Link> },
      { key: '/orders', icon: <FileTextOutlined />, label: <Link to="/orders">Hoá đơn / Tích điểm</Link> },
      { key: '/vouchers', icon: <GiftOutlined />, label: <Link to="/vouchers">Voucher</Link> },
      { key: '/promotions', icon: <NotificationOutlined />, label: <Link to="/promotions">Chương trình ưu đãi</Link> },
      { key: '/tiers', icon: <CrownOutlined />, label: <Link to="/tiers">Hạng thành viên</Link> },
      { key: '/branches', icon: <ShopOutlined />, label: <Link to="/branches">Chi nhánh</Link> },
      ...(manager
        ? ([
            { type: 'divider' },
            ...(superAdmin ? [{ key: '/brands', icon: <AppstoreOutlined />, label: <Link to="/brands">Thương hiệu</Link> }] : []),
            { key: '/settings', icon: <SettingOutlined />, label: <Link to="/settings">Cài đặt</Link> },
            { key: '/admins', icon: <BankOutlined />, label: <Link to="/admins">Tài khoản quản trị</Link> },
          ] as MenuProps['items'] & object[])
        : []),
    ],
    [manager, superAdmin],
  );

  // Chọn mục menu khớp dài nhất với đường dẫn hiện tại
  const keys = ['/', '/orders/new', '/customers', '/bookings', '/orders', '/vouchers', '/promotions', '/tiers', '/branches', '/brands', '/settings', '/admins'];
  // Trang dùng chung không cần chọn thương hiệu
  const globalPage = ['/brands', '/tiers', '/admins'].some((k) => location.pathname.startsWith(k));
  const selected =
    keys
      .filter((k) => (k === '/' ? location.pathname === '/' : location.pathname === k || location.pathname.startsWith(k + '/')))
      .sort((a, b) => b.length - a.length)[0] ?? '/';

  const userMenu: MenuProps = {
    items: [
      { key: 'pw', icon: <KeyOutlined />, label: 'Đổi mật khẩu' },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Đăng xuất', danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'pw') setPwOpen(true);
      if (key === 'logout') {
        logout();
        navigate('/login', { replace: true });
      }
    },
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
        collapsedWidth={screens.md ? 80 : 0}
        trigger={null}
        width={232}
        theme="light"
        style={{ borderRight: `1px solid ${token.colorBorderSecondary}`, position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: collapsed ? '0 24px' : '0 20px',
            fontWeight: 700,
            fontSize: 16,
            color: token.colorPrimary,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <img src="/favicon.svg" width={28} height={28} alt="" />
          {!collapsed && <span>CRM Nhà hàng</span>}
        </div>
        <Menu mode="inline" selectedKeys={[selected]} items={items} style={{ borderInlineEnd: 'none' }} />
      </Sider>
      <Layout>
        <Header
          style={{
            background: token.colorBgContainer,
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            borderTop: `3px solid ${brand?.primaryColor || token.colorPrimary}`,
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <Space size={12}>
            <Button
              type="text"
              aria-label="Thu gọn menu"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
            />
            {user && user.brandId === null && brands.length > 0 ? (
              <Space size={8}>
                {screens.md ? <Typography.Text type="secondary">Thương hiệu:</Typography.Text> : null}
                <Select
                  data-testid="brand-switcher"
                  value={brandId ?? undefined}
                  onChange={(id: number) => {
                    setBrandId(id);
                    const b = brands.find((x) => x.id === id);
                    if (b) message.info(`Đang thao tác: ${b.name}`);
                  }}
                  style={{ minWidth: screens.md ? 240 : 160 }}
                  popupMatchSelectWidth={false}
                  options={brands.map((b) => ({ value: b.id, label: <BrandLabel brand={b} /> }))}
                />
              </Space>
            ) : brand ? (
              <Tag
                data-testid="brand-fixed"
                style={{ padding: '4px 10px', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff' }}
              >
                <BrandDot color={brand.primaryColor} />
                {brand.name}
              </Tag>
            ) : null}
          </Space>
          <Dropdown menu={userMenu} trigger={['click']} placement="bottomRight">
            <Space style={{ cursor: 'pointer' }} data-testid="user-menu">
              <Avatar style={{ background: token.colorPrimary }} icon={<UserOutlined />} />
              <span style={{ lineHeight: 1.2 }}>
                <Typography.Text strong>{user?.name}</Typography.Text>{' '}
                {user ? (
                  <Tag color={superAdmin ? 'purple' : manager ? 'volcano' : 'blue'}>
                    {superAdmin ? 'Quản trị hệ thống' : ROLE_LABEL[user.role]}
                  </Tag>
                ) : null}
              </span>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ padding: screens.md ? 24 : 12 }}>
          {!brandId && !globalPage ? (
            <Result
              status="info"
              title="Chưa có thương hiệu"
              subTitle={
                superAdmin ? 'Hãy tạo thương hiệu đầu tiên để bắt đầu quản lý.' : 'Tài khoản chưa được gán thương hiệu nào, liên hệ quản trị hệ thống.'
              }
              extra={
                superAdmin ? (
                  <Link to="/brands">
                    <Button type="primary">Quản lý thương hiệu</Button>
                  </Link>
                ) : null
              }
            />
          ) : (
            // Đổi thương hiệu → dựng lại trang để tải lại dữ liệu
            <div key={brandId ?? 'none'}>
              <Outlet />
            </div>
          )}
        </Content>
      </Layout>
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </Layout>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      title="Đổi mật khẩu"
      open={open}
      onCancel={onClose}
      okText="Lưu"
      cancelText="Huỷ"
      confirmLoading={saving}
      destroyOnHidden
      onOk={() => form.submit()}
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        onFinish={async (v: { oldPassword: string; newPassword: string }) => {
          setSaving(true);
          try {
            await api.post('/auth/change-password', { oldPassword: v.oldPassword, newPassword: v.newPassword });
            message.success('Đã đổi mật khẩu');
            onClose();
          } catch (e) {
            message.error(errMsg(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form.Item name="oldPassword" label="Mật khẩu hiện tại" rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label="Mật khẩu mới"
          rules={[
            { required: true, message: 'Nhập mật khẩu mới' },
            { min: 6, message: 'Tối thiểu 6 ký tự' },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="Nhập lại mật khẩu mới"
          dependencies={['newPassword']}
          rules={[
            { required: true, message: 'Nhập lại mật khẩu mới' },
            ({ getFieldValue }) => ({
              validator: (_, v) =>
                !v || v === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('Mật khẩu không khớp')),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
