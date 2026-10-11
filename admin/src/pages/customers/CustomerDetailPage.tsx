import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  App,
  Avatar,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Radio,
  Result,
  Row,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tabs,
  Typography,
} from 'antd';
import { EditOutlined, GiftOutlined, PlusCircleOutlined, StarOutlined, UserOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { api } from '../../api/client';
import type { CustomerDetail, Paged, Voucher } from '../../api/types';
import { useRequest } from '../../hooks/useRequest';
import { useIsManager } from '../../auth/useIsManager';
import { TierTag } from '../../components/TierTag';
import { StatusTag, VOUCHER_SOURCE } from '../../components/StatusTag';
import { OrderDrawer } from '../../components/OrderDrawer';
import { date, datetime, errMsg, GENDER_LABEL, money, num } from '../../utils/format';
import { discountText } from '../../utils/voucher';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const manager = useIsManager();
  const { data: c, loading, error, reload } = useRequest(() => api.get<CustomerDetail>(`/customers/${id}`), [id]);
  const [editOpen, setEditOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(null);

  if (error && !c) return <Result status="404" title={error} extra={<Link to="/customers">Về danh sách khách hàng</Link>} />;
  if (!c) return <Skeleton active avatar paragraph={{ rows: 10 }} />;

  const tierStart = c.tier?.minPoints ?? 0;
  const percent = c.nextTier ? Math.min(100, Math.round(((c.lifetimePoints - tierStart) / (c.nextTier.minPoints - tierStart)) * 100)) : 100;

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
          Quay lại
        </Button>
      </Space>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={10}>
          <Card
            loading={loading && !c}
            title="Thông tin khách hàng"
            extra={
              <Button icon={<EditOutlined />} onClick={() => setEditOpen(true)}>
                Sửa
              </Button>
            }
          >
            <Space align="center" size={16} style={{ marginBottom: 16 }}>
              <Avatar size={64} src={c.avatar || undefined} icon={<UserOutlined />} />
              <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {c.name}
                </Typography.Title>
                <TierTag tier={c.tier} />
              </div>
            </Space>
            <Descriptions column={1} size="small" styles={{ label: { width: 130 } }}>
              <Descriptions.Item label="Mã thành viên">
                <Typography.Text copyable strong>
                  {c.memberCode}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Số điện thoại">{c.phone || '—'}</Descriptions.Item>
              <Descriptions.Item label="Ngày sinh">{date(c.birthday)}</Descriptions.Item>
              <Descriptions.Item label="Giới tính">{c.gender ? GENDER_LABEL[c.gender] : '—'}</Descriptions.Item>
              <Descriptions.Item label="Quan tâm OA">{c.followedOA ? 'Có' : 'Chưa'}</Descriptions.Item>
              <Descriptions.Item label="Ngày tham gia">{datetime(c.createdAt)}</Descriptions.Item>
              <Descriptions.Item label="Ghé gần nhất">{datetime(c.lastVisitAt)}</Descriptions.Item>
              <Descriptions.Item label="Ghi chú">
                <span className="pre-line">{c.note || '—'}</span>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card title="Thành viên">
            <Row gutter={[16, 16]}>
              <Col span={12} md={6}>
                <Statistic title="Điểm hiện có" value={num(c.points)} />
              </Col>
              <Col span={12} md={6}>
                <Statistic title="Điểm tích luỹ" value={num(c.lifetimePoints)} />
              </Col>
              <Col span={12} md={6}>
                <Statistic title="Tổng chi tiêu" value={money(c.totalSpent)} />
              </Col>
              <Col span={12} md={6}>
                <Statistic title="Lượt ghé" value={c.visitCount} />
              </Col>
            </Row>
            <div style={{ marginTop: 16 }}>
              {c.nextTier ? (
                <>
                  <Typography.Text>
                    Còn <b>{num(c.pointsToNextTier)}</b> điểm tích luỹ để lên hạng <TierTag tier={c.nextTier} />
                  </Typography.Text>
                  <Progress percent={percent} strokeColor={c.nextTier.color} />
                </>
              ) : (
                <Typography.Text type="secondary">Khách đã đạt hạng cao nhất.</Typography.Text>
              )}
              {c.tier ? (
                <Typography.Paragraph type="secondary" style={{ marginTop: 4, marginBottom: 0 }}>
                  Hệ số tích điểm hạng {c.tier.name}: ×{c.tier.pointMultiplier}
                </Typography.Paragraph>
              ) : null}
            </div>
            <Space wrap style={{ marginTop: 16 }}>
              <Button
                type="primary"
                icon={<PlusCircleOutlined />}
                onClick={() => navigate(`/orders/new?customer=${encodeURIComponent(c.phone || c.memberCode)}`)}
              >
                Tạo hoá đơn
              </Button>
              <Button icon={<GiftOutlined />} onClick={() => setGiftOpen(true)}>
                Tặng voucher
              </Button>
              {manager ? (
                <Button icon={<StarOutlined />} onClick={() => setPointsOpen(true)}>
                  Cộng/trừ điểm
                </Button>
              ) : null}
            </Space>
          </Card>
        </Col>
        <Col span={24}>
          <Card>
            <Tabs
              items={[
                {
                  key: 'orders',
                  label: `Hoá đơn (${c.orders.length})`,
                  children: (
                    <Table
                      size="small"
                      rowKey="id"
                      dataSource={c.orders}
                      pagination={{ pageSize: 10 }}
                      onRow={(o) => ({ onClick: () => setOrderId(o.id), style: { cursor: 'pointer' } })}
                      columns={[
                        { title: 'Mã', dataIndex: 'code', render: (v) => <a>{v}</a> },
                        { title: 'Thời gian', dataIndex: 'createdAt', render: datetime },
                        { title: 'Chi nhánh', render: (_, o) => o.branch?.name ?? '—' },
                        { title: 'Tổng tiền', dataIndex: 'total', align: 'right', render: money },
                        { title: 'Điểm', dataIndex: 'pointsEarned', align: 'right', render: (v) => `+${num(v)}` },
                        { title: 'Trạng thái', dataIndex: 'status', render: (s) => <StatusTag kind="order" status={s} /> },
                      ]}
                    />
                  ),
                },
                {
                  key: 'bookings',
                  label: `Đặt bàn (${c.bookings.length})`,
                  children: (
                    <Table
                      size="small"
                      rowKey="id"
                      dataSource={c.bookings}
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: 'Mã', dataIndex: 'code' },
                        { title: 'Thời gian', dataIndex: 'bookingTime', render: datetime },
                        { title: 'Chi nhánh', render: (_, b) => b.branch?.name },
                        { title: 'Số khách', dataIndex: 'partySize', align: 'center' },
                        { title: 'Ghi chú', dataIndex: 'note', ellipsis: true },
                        { title: 'Trạng thái', dataIndex: 'status', render: (s) => <StatusTag kind="booking" status={s} /> },
                      ]}
                    />
                  ),
                },
                {
                  key: 'vouchers',
                  label: `Voucher (${c.vouchers.length})`,
                  children: (
                    <Table
                      size="small"
                      rowKey="id"
                      dataSource={c.vouchers}
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: 'Mã', dataIndex: 'code', render: (v) => <Typography.Text copyable>{v}</Typography.Text> },
                        { title: 'Voucher', render: (_, v) => <Link to={`/vouchers/${v.voucherId}`}>{v.voucher.title}</Link> },
                        { title: 'Ưu đãi', render: (_, v) => discountText(v.voucher) },
                        { title: 'Nguồn', dataIndex: 'source', render: (s) => VOUCHER_SOURCE[s] ?? s },
                        { title: 'Nhận lúc', dataIndex: 'createdAt', render: datetime },
                        { title: 'Hết hạn', dataIndex: 'expiresAt', render: datetime },
                        { title: 'Trạng thái', dataIndex: 'status', render: (s) => <StatusTag kind="voucher" status={s} /> },
                      ]}
                    />
                  ),
                },
                {
                  key: 'points',
                  label: 'Lịch sử điểm',
                  children: (
                    <Table
                      size="small"
                      rowKey="id"
                      dataSource={c.pointTransactions}
                      pagination={{ pageSize: 10 }}
                      columns={[
                        { title: 'Thời gian', dataIndex: 'createdAt', render: datetime },
                        { title: 'Loại', dataIndex: 'type', render: (t) => <StatusTag kind="point" status={t} /> },
                        { title: 'Nội dung', dataIndex: 'description' },
                        {
                          title: 'Điểm',
                          dataIndex: 'points',
                          align: 'right',
                          render: (p: number) => (
                            <Typography.Text type={p >= 0 ? 'success' : 'danger'}>
                              {p > 0 ? '+' : ''}
                              {num(p)}
                            </Typography.Text>
                          ),
                        },
                        { title: 'Số dư', dataIndex: 'balanceAfter', align: 'right', render: num },
                        { title: 'Người thực hiện', render: (_, t) => t.admin?.name ?? '—' },
                      ]}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <EditCustomerModal open={editOpen} customer={c} onClose={() => setEditOpen(false)} onSaved={() => reload()} />
      {manager ? <PointsModal open={pointsOpen} customer={c} onClose={() => setPointsOpen(false)} onSaved={() => reload()} /> : null}
      <GiftVoucherModal open={giftOpen} customer={c} onClose={() => setGiftOpen(false)} onSaved={() => reload()} />
      <OrderDrawer orderId={orderId} onClose={() => setOrderId(null)} onChanged={() => reload()} />
    </>
  );
}

interface ModalProps {
  open: boolean;
  customer: CustomerDetail;
  onClose: () => void;
  onSaved: () => void;
}

function EditCustomerModal({ open, customer, onClose, onSaved }: ModalProps) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      title="Sửa thông tin khách hàng"
      open={open}
      onCancel={onClose}
      okText="Lưu"
      cancelText="Huỷ"
      confirmLoading={saving}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{
          name: customer.name,
          phone: customer.phone,
          birthday: customer.birthday ? dayjs(customer.birthday) : null,
          gender: customer.gender,
          note: customer.note,
        }}
        onFinish={async (v: { name: string; phone?: string; birthday?: Dayjs | null; gender?: string | null; note?: string }) => {
          setSaving(true);
          try {
            await api.put(`/customers/${customer.id}`, {
              name: v.name,
              phone: v.phone?.trim() ? v.phone.trim() : null,
              birthday: v.birthday ? v.birthday.format('YYYY-MM-DD') : null,
              gender: v.gender ?? null,
              note: v.note?.trim() ? v.note : null,
            });
            message.success('Đã cập nhật khách hàng');
            onClose();
            onSaved();
          } catch (e) {
            message.error(errMsg(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form.Item name="name" label="Họ tên" rules={[{ required: true, whitespace: true, message: 'Nhập họ tên' }]}>
          <Input maxLength={100} />
        </Form.Item>
        <Form.Item
          name="phone"
          label="Số điện thoại"
          rules={[{ pattern: /^(\+?84|0)[\d\s.-]{9,12}$/, message: 'Số điện thoại không hợp lệ' }]}
        >
          <Input placeholder="0901234567" />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="birthday" label="Ngày sinh">
              <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs())} />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="gender" label="Giới tính">
              <Radio.Group>
                <Radio value="MALE">Nam</Radio>
                <Radio value="FEMALE">Nữ</Radio>
                <Radio value="OTHER">Khác</Radio>
              </Radio.Group>
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="note" label="Ghi chú nội bộ" extra="Chỉ nhân viên nhà hàng nhìn thấy (sở thích, dị ứng...)">
          <Input.TextArea rows={3} maxLength={2000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function PointsModal({ open, customer, onClose, onSaved }: ModalProps) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      title={`Cộng/trừ điểm – ${customer.name}`}
      open={open}
      onCancel={onClose}
      okText="Xác nhận"
      cancelText="Huỷ"
      confirmLoading={saving}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Typography.Paragraph type="secondary">
        Điểm hiện có: <b>{num(customer.points)}</b> · Điểm tích luỹ: <b>{num(customer.lifetimePoints)}</b>
      </Typography.Paragraph>
      <Form
        form={form}
        layout="vertical"
        preserve={false}
        initialValues={{ mode: 'add', affectTier: false }}
        onFinish={async (v: { mode: 'add' | 'sub'; amount: number; description: string; affectTier: boolean }) => {
          setSaving(true);
          try {
            const points = v.mode === 'add' ? v.amount : -v.amount;
            const res = await api.post<{ tierUp: boolean; customer: { points: number; tier: { name: string } | null } }>(
              `/customers/${customer.id}/points`,
              { points, description: v.description, affectTier: v.affectTier },
            );
            message.success(
              `Đã ${points > 0 ? 'cộng' : 'trừ'} ${num(Math.abs(points))} điểm. Số dư: ${num(res.customer.points)}${
                res.tierUp && res.customer.tier ? ` – lên hạng ${res.customer.tier.name}!` : ''
              }`,
            );
            onClose();
            onSaved();
          } catch (e) {
            message.error(errMsg(e));
          } finally {
            setSaving(false);
          }
        }}
      >
        <Form.Item name="mode">
          <Radio.Group optionType="button" buttonStyle="solid">
            <Radio value="add">Cộng điểm</Radio>
            <Radio value="sub">Trừ điểm</Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item name="amount" label="Số điểm" rules={[{ required: true, message: 'Nhập số điểm' }]}>
          <InputNumber min={1} precision={0} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="description" label="Lý do" rules={[{ required: true, whitespace: true, message: 'Nhập lý do' }]}>
          <Input placeholder="VD: Bù điểm hoá đơn giấy, tặng sự kiện..." maxLength={200} />
        </Form.Item>
        <Form.Item name="affectTier" valuePropName="checked" extra="Nếu chọn, số điểm này cũng được cộng/trừ vào điểm tích luỹ dùng để xét hạng.">
          <Checkbox>Tính vào điểm xét hạng</Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  );
}

function GiftVoucherModal({ open, customer, onClose, onSaved }: ModalProps) {
  const { message } = App.useApp();
  const [voucherId, setVoucherId] = useState<number | undefined>();
  const [saving, setSaving] = useState(false);
  const { data, loading } = useRequest(() => api.get<Paged<Voucher>>('/vouchers', { pageSize: 100 }), [open], { enabled: open });
  const now = dayjs();
  const options = (data?.items ?? [])
    .filter((v) => v.active && (!v.endDate || dayjs(v.endDate).isAfter(now)) && (v.totalQuantity === null || v.issuedCount < v.totalQuantity))
    .map((v) => ({
      value: v.id,
      label: `${v.title} – ${discountText(v, false)}${v.totalQuantity !== null ? ` (còn ${v.totalQuantity - v.issuedCount})` : ''}`,
    }));
  return (
    <Modal
      title={`Tặng voucher – ${customer.name}`}
      open={open}
      onCancel={onClose}
      okText="Tặng"
      cancelText="Huỷ"
      okButtonProps={{ disabled: !voucherId }}
      confirmLoading={saving}
      destroyOnHidden
      afterClose={() => setVoucherId(undefined)}
      onOk={async () => {
        if (!voucherId) return;
        setSaving(true);
        try {
          const cv = await api.post<{ code: string }>(`/customers/${customer.id}/vouchers`, { voucherId });
          message.success(`Đã tặng voucher, mã: ${cv.code}`);
          onClose();
          onSaved();
        } catch (e) {
          message.error(errMsg(e));
        } finally {
          setSaving(false);
        }
      }}
    >
      <Typography.Paragraph type="secondary">
        Voucher tặng sẽ bỏ qua điều kiện điểm và hạng. Khách xem trong mục "Voucher của tôi" trên Mini App.
      </Typography.Paragraph>
      <Select
        showSearch
        optionFilterProp="label"
        loading={loading}
        placeholder="Chọn voucher đang hoạt động"
        style={{ width: '100%' }}
        value={voucherId}
        onChange={setVoucherId}
        options={options}
        notFoundContent="Không có voucher khả dụng"
      />
    </Modal>
  );
}
