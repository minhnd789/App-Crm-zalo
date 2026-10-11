/** Kiểu dữ liệu trả về từ backend `/api/app` (xem docs/API.md) */

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AppConfig {
  restaurantName: string;
  hotline: string;
  about: string;
  pointPerAmount: number;
  bookingMinAdvanceMinutes: number;
  bookingMaxDays: number;
  maxPartySize: number;
}

export interface Tier {
  id: number;
  name: string;
  code: string;
  minPoints: number;
  pointMultiplier: number;
  /** Nhiều dòng, mỗi dòng một quyền lợi */
  benefits: string | null;
  color: string;
}

export interface Branch {
  id: number;
  name: string;
  address: string;
  phone: string | null;
  /** "HH:mm" */
  openTime: string;
  /** "HH:mm" */
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

export type DiscountType = "PERCENT" | "AMOUNT" | "GIFT";

export interface Voucher {
  id: number;
  title: string;
  description: string | null;
  imageUrl: string | null;
  discountType: DiscountType;
  discountValue: number;
  maxDiscount: number | null;
  minOrder: number;
  /** 0 = nhận miễn phí, > 0 = đổi bằng điểm */
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
}

export interface ClaimableVoucher extends Voucher {
  remaining: number | null;
  ownedCount: number;
  canClaim: boolean;
  reason: string | null;
}

export type CustomerVoucherStatus = "AVAILABLE" | "USED" | "EXPIRED";

export interface CustomerVoucher {
  id: number;
  code: string;
  customerId: number;
  voucherId: number;
  voucher: Voucher;
  source: "CLAIM" | "REDEEM" | "GIFT";
  pointsSpent: number;
  status: CustomerVoucherStatus;
  expiresAt: string;
  usedAt: string | null;
  orderId: number | null;
  createdAt: string;
  order?: { id: number; code: string; createdAt: string } | null;
}

export type Gender = "MALE" | "FEMALE" | "OTHER";

export interface Me {
  id: number;
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
  followedOA: boolean;
  createdAt: string;
  availableVouchers: number;
  tier: Tier | null;
  nextTier: Tier | null;
  pointsToNextTier: number;
}

export interface LoginResponse {
  token: string;
  isNew: boolean;
  customer: Me;
}

export type BookingStatus = "PENDING" | "CONFIRMED" | "ARRIVED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

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
}

export interface OrderItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
}

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
  status: "COMPLETED" | "CANCELLED";
  createdAt: string;
  items?: OrderItem[];
  usedVoucher?: (Omit<CustomerVoucher, "voucher"> & { voucher: Voucher }) | null;
  _count?: { items: number };
}

export type PointTransactionType = "EARN" | "REDEEM" | "ADJUST" | "REFUND" | "WELCOME";

export interface PointTransaction {
  id: number;
  type: PointTransactionType;
  points: number;
  balanceAfter: number;
  description: string | null;
  orderId: number | null;
  createdAt: string;
}

export interface CreateBookingInput {
  branchId: number;
  /** ISO 8601 có offset, ví dụ 2026-10-12T18:30:00+07:00 */
  bookingTime: string;
  partySize: number;
  contactName: string;
  contactPhone: string;
  note?: string;
}

export interface UpdateProfileInput {
  name?: string;
  birthday?: string | null;
  gender?: Gender | null;
  followedOA?: boolean;
  idByOA?: string;
}

export interface LoginInput {
  accessToken?: string;
  name?: string;
  avatar?: string;
  idByOA?: string;
  followedOA?: boolean;
  mockZaloId?: string;
}
