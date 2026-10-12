import { Tag } from 'antd';
import type { BookingStatus, CustomerVoucherStatus, OrderStatus, PointType } from '../api/types';

export const BOOKING_STATUS: Record<BookingStatus, { label: string; color: string }> = {
  PENDING: { label: 'Chờ xác nhận', color: 'gold' },
  CONFIRMED: { label: 'Đã xác nhận', color: 'blue' },
  ARRIVED: { label: 'Khách đã đến', color: 'cyan' },
  COMPLETED: { label: 'Hoàn thành', color: 'green' },
  CANCELLED: { label: 'Đã huỷ', color: 'default' },
  NO_SHOW: { label: 'Không đến', color: 'red' },
};

export const ORDER_STATUS: Record<OrderStatus, { label: string; color: string }> = {
  COMPLETED: { label: 'Hoàn thành', color: 'green' },
  CANCELLED: { label: 'Đã huỷ', color: 'red' },
};

export const VOUCHER_STATUS: Record<CustomerVoucherStatus, { label: string; color: string }> = {
  AVAILABLE: { label: 'Chưa dùng', color: 'green' },
  USED: { label: 'Đã dùng', color: 'blue' },
  EXPIRED: { label: 'Hết hạn', color: 'default' },
};

export const POINT_TYPE: Record<PointType, { label: string; color: string }> = {
  EARN: { label: 'Tích điểm', color: 'green' },
  REDEEM: { label: 'Đổi ưu đãi', color: 'orange' },
  ADJUST: { label: 'Điều chỉnh', color: 'purple' },
  REFUND: { label: 'Hoàn/huỷ', color: 'red' },
  WELCOME: { label: 'Chào mừng', color: 'cyan' },
};

export const VOUCHER_SOURCE: Record<string, string> = { CLAIM: 'Tự nhận', REDEEM: 'Đổi điểm', GIFT: 'Được tặng' };

type Kind = 'booking' | 'order' | 'voucher' | 'point';

const MAPS: Record<Kind, Record<string, { label: string; color: string }>> = {
  booking: BOOKING_STATUS,
  order: ORDER_STATUS,
  voucher: VOUCHER_STATUS,
  point: POINT_TYPE,
};

export function StatusTag({ kind, status }: { kind: Kind; status: string }) {
  const s = MAPS[kind][status] ?? { label: status, color: 'default' };
  return (
    <Tag color={s.color} style={{ marginInlineEnd: 0 }}>
      {s.label}
    </Tag>
  );
}
