import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import { errMsg } from '../utils/format';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const redirect = params.get('redirect') || '/';

  if (user) return <Navigate to={redirect} replace />;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'linear-gradient(135deg, #fff2e8 0%, #f5f5f5 60%)',
      }}
    >
      <Card style={{ width: 380, maxWidth: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/favicon.svg" width={48} height={48} alt="" />
          <Typography.Title level={3} style={{ margin: '8px 0 0' }}>
            Trang quản trị
          </Typography.Title>
          <Typography.Text type="secondary">CRM nhà hàng – đăng nhập để tiếp tục</Typography.Text>
        </div>
        {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
        <Form
          layout="vertical"
          size="large"
          onFinish={async (v: { username: string; password: string }) => {
            setLoading(true);
            setError(null);
            try {
              await login(v.username.trim(), v.password);
              navigate(redirect, { replace: true });
            } catch (e) {
              setError(errMsg(e));
            } finally {
              setLoading(false);
            }
          }}
        >
          <Form.Item name="username" rules={[{ required: true, message: 'Nhập tên đăng nhập' }]}>
            <Input prefix={<UserOutlined />} placeholder="Tên đăng nhập" autoComplete="username" autoFocus />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Mật khẩu" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>
            Đăng nhập
          </Button>
        </Form>
      </Card>
    </div>
  );
}
