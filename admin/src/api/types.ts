// Kiểu dữ liệu trả về từ backend (/api/admin). Ngày giờ là chuỗi ISO (UTC).

export type Role = 'ADMIN' | 'STAFF';

export interface Brand {
  id: number;
  code: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  hotline: string | null;
  about: string | null;
  zaloAppId: string | null;
  zaloOaId: string | null;
  active: boolean;
  /** Secret không bao giờ trả về – chỉ biết đã cấu hình hay chưa */
  hasZaloAppSecretKey: boolean;
  hasZaloOaAccessToken: boolean;
  /** Kết nối phần mềm bán hàng r_keeper (qua DCorp) */
  posEnabled: boolean;
  /** WEBHOOK = connector tự viết; DCORP = API đăng ký thành viên RK7 CRM của DCorp */
  posProvider: 'WEBHOOK' | 'DCORP';
  posWebhookUrl: string | null;
  hasPosApiKey: boolean;
  hasPosWebhookSecret: boolean;
  dcorpBaseUrl: string | null;
  dcorpClientId: string | null;
  dcorpOrganization: number | null;
  hasDcorpClientSecret: boolean;
  createdAt?: string;
  _count?: { branches: number; wallets: number };
}

export type BrandRef = Pick<Brand, 'id' | 'name'> & { code?: string; primaryColor?: string };

export interface AdminUser {
  id: number;
  username: string;
  name: string;
  role: Role;
  /** null = quản trị toàn hệ thống */
  brandId: number | null;
  brand?: BrandRef | null;
  active?: boolean;
  createdAt?: string;
}

/** GET /auth/me */
export interface AdminMe extends AdminUser {
  brands: Brand[];
}

/** Ví điểm của khách tại 1 thương hiệu */
export interface Wallet {
  id: number;
  customerId: number;
  brandId: number;
  points: number;
  lifetimePoints: number;
  totalSpent: number;
  visitCount: number;
  lastVisitAt: string | null;
  brand?: BrandRef;
  /** Cơ sở khách chọn khi đăng ký thành viên */
  homeBranchId?: number | null;
  homeBranch?: { id: number; name: string } | null;
  /** null = chưa hoàn tất đăng ký trên Mini App */
  registeredAt?: string | null;
  /** Mã khách bên r_keeper sau khi đồng bộ */
  posCustomerId?: string | null;
  posSyncedAt?: string | null;
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
  /** Tổng chi tiêu (VND, mọi thương hiệu) tối thiểu */
  minSpent: number;
  pointMultiplier: number;
  benefits: string | null;
  color: string;
  _count?: { customers: number };
}

export interface Branch {
  id: number;
  brandId: number;
  /** Mã nhà hàng / điểm bán bên r_keeper */
  posCode?: string | null;
  brand?: BrandRef;
  _count?: { members: number };
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
  brandId: number;
  brand?: BrandRef;
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
  brandId: number;
  brand?: BrandRef;
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
  brandId: number;
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
  name: string;
  avatar: string | null;
  phone: string | null;
  birthday: string | null;
  gender: Gender | null;
  memberCode: string;
  /** Tổng chi tiêu ở mọi thương hiệu – dùng xét hạng */
  totalSpent: number;
  visitCount: number;
  tierId: number | null;
  tier: Tier | null;
  note: string | null;
  lastVisitAt: string | null;
  createdAt: string;
  /** Ví của thương hiệu đang chọn (null nếu khách chưa có ví ở đây) */
  wallet?: Wallet | null;
  /** Ví ở các thương hiệu (danh sách khách) */
  wallets?: (Wallet & { brand: BrandRef })[];
}

export interface ZaloAccount {
  id: number;
  brandId: number;
  brand: BrandRef;
  zaloId: string;
  zaloOAId: string | null;
  followedOA: boolean;
  createdAt: string;
  lastLoginAt: string;
}

export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'ARRIVED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface Booking {
  id: number;
  brandId: number;
  brand?: BrandRef;
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
  brandId: number;
  brand?: BrandRef;
  source?: 'ADMIN' | 'POS';
  externalId?: string | null;
  customer?: { id: number; name: string; phone: string | null; tier?: Tier | null; totalSpent?: number };
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

type WithBrand<T> = T & { brand?: BrandRef };

export interface CustomerDetail extends Customer {
  orders: WithBrand<Order>[];
  bookings: WithBrand<Booking>[];
  vouchers: WithBrand<CustomerVoucher>[];
  pointTransactions: WithBrand<PointTransaction>[];
  wallets: (Wallet & { brand: BrandRef })[];
  zaloAccounts: ZaloAccount[];
  wallet: Wallet | null;
  nextTier: Tier | null;
  /** VND còn thiếu để lên hạng kế tiếp */
  amountToNextTier: number;
}

export interface CustomerLookup extends Customer {
  wallet: Wallet | null;
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
  /** Doanh thu tháng này theo thương hiệu */
  revenueByBrand: { id: number; name: string; primaryColor: string; revenue: number; orders: number }[];
  /** Doanh thu tháng này theo cơ sở */
  revenueByBranch: { id: number; name: string; brandId: number; brandName: string; revenue: number; orders: number }[];
  revenueByDay: { date: string; revenue: number; orders: number }[];
  recentOrders: Order[];
  upcomingBookings: Booking[];
}

/** Cài đặt theo thương hiệu (tên/hotline/giới thiệu nằm ở Brand) */
export interface Settings {
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

/** POST /orders */
export interface CreateOrderResult {
  order: Order;
  tierUp: boolean;
  tier: Tier | null;
  balance?: number;
}

export type PosDirection = 'IN' | 'OUT';
export type PosLogStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'UNMATCHED' | 'IGNORED';
export type PosLogType = 'CUSTOMER_UPSERT' | 'BILL_PAID' | 'BILL_VOID';

/** Nhật ký đồng bộ r_keeper */
export interface PosSyncLog {
  id: number;
  brandId: number;
  brand?: BrandRef;
  direction: PosDirection;
  type: PosLogType;
  /** mã bill (IN) hoặc id khách CRM (OUT) */
  externalId: string | null;
  customerId: number | null;
  orderId: number | null;
  payload: string;
  response: string | null;
  status: PosLogStatus;
  error: string | null;
  attempts: number;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer?: { id: number; name: string; phone: string | null } | null;
  order?: { id: number; code: string; total: number; pointsEarned: number; status: OrderStatus } | null;
}

export interface PosLogsPage extends Paged<PosSyncLog> {
  statusCounts: Partial<Record<PosLogStatus, number>>;
}
