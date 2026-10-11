// Kiểu dữ liệu trả về từ backend (/api/admin). Ngày giờ là chuỗi ISO (UTC).

export type Role = 'ADMIN' | 'STAFF';

export interface AdminUser {
  id: number;
  username: string;
  name: string;
  role: Role;
  active?: boolean;
  createdAt?: string;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Tier {
  id: number;
  name: string;
  code: string;
  minPoints: number;
  pointMultiplier: number;
  benefits: string | null;
  color: string;
  _count?: { customers: number };
}

export interface Branch {
  id: number;
  name: string;
  address: string;
  phone: string | null;
  openTime: string;
  closeTime: string;
  imageUrl: string | null;
  active: boolean;
}

export interface Promotion {
  id: number;
  title: string;
  summary: string | null;
  content: string | null;
  imageUrl: string | null;
  startDate: string | null;
  endDate: string | null;
  featured: boolean;
  active: boolean;
  createdAt: string;
}

export type DiscountType = 'PERCENT' | 'AMOUNT' | 'GIFT';

export interface Voucher {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  discountType: DiscountType;
  discountValue: number;
  maxDiscount: number | null;
  minOrder: number;
  pointCost: number;
  totalQuantity: number | null;
  issuedCount: number;
  perCustomerLimit: number;
  validDays: number;
  startDate: string | null;
  endDate: string | null;
  minTierId: number | null;
  minTier?: Tier | null;
  active: boolean;
  createdAt?: string;
  usedCount?: number;
}

export type CustomerVoucherStatus = 'AVAILABLE' | 'USED' | 'EXPIRED';

export interface CustomerVoucher {
  id: number;
  code: string;
  customerId: number;
  voucherId: number;
  voucher: Voucher;
  source: 'CLAIM' | 'REDEEM' | 'GIFT';
  pointsSpent: number;
  status: CustomerVoucherStatus;
  expiresAt: string;
  usedAt: string | null;
  orderId: number | null;
  createdAt: string;
  customer?: { id: number; name: string; phone: string | null; tier?: Tier | null };
  order?: { id: number; code: string } | null;
}

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface Customer {
  id: number;
  zaloId: string;
  name: string;
  avatar: string | null;
  phone: string | null;
  birthday: string | null;
  gender: Gender | null;
  memberCode: string;
  points: number;
  lifetimePoints: number;
  totalSpent: number;
  visitCount: number;
  tierId: number | null;
  tier: Tier | null;
  note: string | null;
  followedOA: boolean;
  lastVisitAt: string | null;
  createdAt: string;
}

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface Booking {
  id: number;
  code: string;
  customerId: number;
  branchId: number;
  branch: Branch;
  bookingTime: string;
  partySize: number;
  contactName: string;
  contactPhone: string;
  note: string | null;
  status: BookingStatus;
  adminNote: string | null;
  createdAt: string;
  customer?: { id: number; name: string; phone: string | null; memberCode?: string };
}

export interface OrderItem {
  id?: number;
  name: string;
  quantity: number;
  price: number;
}

export type OrderStatus = 'COMPLETED' | 'CANCELLED';

export interface Order {
  id: number;
  code: string;
  customerId: number;
  branchId: number | null;
  branch: Branch | null;
  bookingId: number | null;
  subtotal: number;
  discount: number;
  voucherDiscount: number;
  total: number;
  pointsEarned: number;
  note: string | null;
  status: OrderStatus;
  createdAt: string;
  cancelledAt?: string | null;
  items?: OrderItem[];
  usedVoucher?: CustomerVoucher | null;
  customer?: { id: number; name: string; phone: string | null; tier?: Tier | null; points?: number; lifetimePoints?: number };
  createdBy?: { id?: number; name: string } | null;
}

export type PointType = 'EARN' | 'REDEEM' | 'ADJUST' | 'REFUND' | 'WELCOME';

export interface PointTransaction {
  id: number;
  type: PointType;
  points: number;
  balanceAfter: number;
  description: string;
  orderId: number | null;
  createdAt: string;
  admin?: { id: number; name: string } | null;
}

export interface CustomerDetail extends Customer {
  orders: Order[];
  bookings: Booking[];
  vouchers: CustomerVoucher[];
  pointTransactions: PointTransaction[];
  nextTier: Tier | null;
  pointsToNextTier: number;
}

export interface CustomerLookup extends Customer {
  vouchers: CustomerVoucher[];
  bookings: Booking[];
}

export interface Dashboard {
  totalCustomers: number;
  newCustomersToday: number;
  bookingsToday: number;
  pendingBookings: number;
  revenueToday: number;
  ordersToday: number;
  revenueMonth: number;
  ordersMonth: number;
  vouchersUsedMonth: number;
  tierDistribution: { id: number; name: string; color: string; count: number }[];
  revenueByDay: { date: string; revenue: number; orders: number }[];
  recentOrders: Order[];
  upcomingBookings: Booking[];
}

export interface Settings {
  restaurantName: string;
  hotline: string;
  about: string;
  pointPerAmount: string;
  welcomePoints: string;
  bookingMinAdvanceMinutes: string;
  bookingMaxDays: string;
  maxPartySize: string;
}

export interface OrdersPage extends Paged<Order> {
  sumTotal: number;
  sumPoints: number;
}

export interface VoucherDetail extends Voucher {
  stats: Partial<Record<CustomerVoucherStatus, number>>;
  recent: CustomerVoucher[];
}

export type VoucherCheck = CustomerVoucher & { valid: boolean; reason: string | null; discount: number | null };
