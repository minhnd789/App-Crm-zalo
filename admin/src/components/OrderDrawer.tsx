import { App, Button, Descriptions, Drawer, Popconfirm, Skeleton, Table, Typography } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { api } from '../api/client';
import type { Order } from '../api/types';
import { useRequest } from '../hooks/useRequest';
import { useIsManager } from '../auth/useIsManager';
import { datetime, errMsg, money, num } from '../utils/format';
import { StatusTag } from './StatusTag';
import { TierTag } from './TierTag';
import { LocationText } from './BrandBadge';

/** Ngăn chi tiết hoá đơn + nút huỷ (chỉ quản lý) */
export function OrderDrawer({ orderId, onClose, onChanged }: { orderId: number | null; onClose: () => void; onChanged?: () => void }) {
  const manager = useIsManager();
  const { message } = App.useApp();
  const [cancelling, setCancelling] = useState(false);
  const { data: o, setData } = useRequest(() => api.get<Order>(`/orders/${orderId}`), [orderId], { enabled: !!orderId });
  const order = o && o.id === orderId ? o : undefined;

  return (
    <Drawer
      title={order ? `Hoá đơn ${order.code}` : 'Hoá đơn'}
      open={!!orderId}
      onClose={onClose}
      width={560}
      extra={
        manager && order?.status === 'COMPLETED' ? (
          <Popconfirm
            title="Huỷ hoá đơn này?"
            description={
              <div style={{ maxWidth: 280 }}>
                Khách sẽ bị trừ lại {num(order.pointsEarned)} điểm đã cộng (cả điểm xét hạng), tổng chi tiêu giảm{' '}
                {money(order.total)} và voucher đã dùng (nếu có) được trả lại. Không thể hoàn tác.
              </div>
            }
            okText="Huỷ hoá đơn"
            okButtonProps={{ danger: true }}
            cancelText="Không"
            onConfirm={async () => {
              setCancelling(true);
              try {
                const updated = await api.post<Order>(`/orders/${order.id}/cancel`);
                setData(updated);
                message.success('Đã huỷ hoá đơn và hoàn điểm');
                onChanged?.();
              } catch (e) {
                message.error(errMsg(e));
              } finally {
                setCancelling(false);
              }
            }}
          >
            <Button danger icon={<StopOutlined />} loading={cancelling}>
              Huỷ hoá đơn
            </Button>
          </Popconfirm>
        ) : null
      }
    >
      {!order ? (
        <Skeleton active />
      ) : (
        <>
          <Descriptions column={1} size="small" bordered styles={{ label: { width: 160 } }}>
            <Descriptions.Item label="Trạng thái">
              <StatusTag kind="order" status={order.status} />
              {order.cancelledAt ? <Typography.Text type="secondary"> lúc {datetime(order.cancelledAt)}</Typography.Text> : null}
            </Descriptions.Item>
            <Descriptions.Item label="Khách hàng">
              {order.customer ? (
                <>
                  <Link to={`/customers/${order.customer.id}`}>{order.customer.name}</Link>{' '}
                  {order.customer.phone ? `· ${order.customer.phone} ` : ''}
                  {order.customer.tier ? <TierTag tier={order.customer.tier} /> : null}
                </>
              ) : (
                '—'
              )}
            </Descriptions.Item>
            <Descriptions.Item label="Cơ sở">
              <LocationText branch={order.branch ? { ...order.branch, brand: order.brand } : null} brandId={order.brandId} />
            </Descriptions.Item>
            <Descriptions.Item label="Nguồn">
              {order.source === 'POS' ? 'Phần mềm bán hàng (r_keeper)' : 'Nhập thủ công'}
              {order.externalId ? ` · Mã bill r_keeper: ${order.externalId}` : ''}
            </Descriptions.Item>
            <Descriptions.Item label="Thời gian">{datetime(order.createdAt)}</Descriptions.Item>
            {order.createdBy ? <Descriptions.Item label="Nhân viên tạo">{order.createdBy.name}</Descriptions.Item> : null}
            {order.note ? <Descriptions.Item label="Ghi chú">{order.note}</Descriptions.Item> : null}
          </Descriptions>

          {order.items && order.items.length > 0 ? (
            <Table
              style={{ marginTop: 16 }}
              size="small"
              rowKey={(r) => String(r.id)}
              pagination={false}
              dataSource={order.items}
              columns={[
                { title: 'Món', dataIndex: 'name' },
                { title: 'SL', dataIndex: 'quantity', align: 'center' },
                { title: 'Đơn giá', dataIndex: 'price', align: 'right', render: money },
                { title: 'Thành tiền', align: 'right', render: (_, r) => money(r.price * r.quantity) },
              ]}
            />
          ) : (
            <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
              Hoá đơn chỉ nhập tổng tiền (không có chi tiết món).
            </Typography.Paragraph>
          )}

          <Descriptions column={1} size="small" style={{ marginTop: 16 }} styles={{ label: { width: 160 }, content: { justifyContent: "flex-end" } }}>
            <Descriptions.Item label="Tạm tính">{money(order.subtotal)}</Descriptions.Item>
            {order.discount > 0 ? <Descriptions.Item label="Giảm giá">-{money(order.discount)}</Descriptions.Item> : null}
            {order.usedVoucher || order.voucherDiscount > 0 ? (
              <Descriptions.Item label="Voucher">
                {order.usedVoucher ? `${order.usedVoucher.code} – ${order.usedVoucher.voucher?.title ?? ''} ` : ''}-{money(order.voucherDiscount)}
              </Descriptions.Item>
            ) : null}
            <Descriptions.Item label={<b>Khách trả</b>}>
              <b style={{ fontSize: 16 }}>{money(order.total)}</b>
            </Descriptions.Item>
            <Descriptions.Item label="Điểm tích">
              <Typography.Text type={order.status === 'CANCELLED' ? 'secondary' : 'success'} delete={order.status === 'CANCELLED'}>
                +{num(order.pointsEarned)} điểm
              </Typography.Text>
            </Descriptions.Item>
          </Descriptions>
        </>
      )}
    </Drawer>
  );
}
