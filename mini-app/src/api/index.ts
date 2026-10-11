import { request } from "./client";
import type {
  AppConfig,
  Booking,
  Branch,
  ClaimableVoucher,
  CreateBookingInput,
  CustomerVoucher,
  CustomerVoucherStatus,
  LoginInput,
  LinkPhoneResponse,
  LoginResponse,
  Me,
  Order,
  Paginated,
  PointTransaction,
  Promotion,
  Tier,
  UpdateProfileInput,
} from "./types";

export * from "./types";
export { ApiError, errorMessage } from "./client";

/** Các endpoint `/api/app` dùng trong Mini App */
export const api = {
  // ----- Công khai -----
  getConfig: () => request<AppConfig>("/config", { public: true }),
  getBranches: () => request<Branch[]>("/branches", { public: true }),
  getTiers: () => request<Tier[]>("/tiers", { public: true }),
  getPromotions: (featured?: boolean) =>
    request<Promotion[]>("/promotions", { public: true, query: { featured: featured ? "true" : undefined } }),
  getPromotion: (id: number | string) => request<Promotion>(`/promotions/${id}`, { public: true }),
  login: (body: LoginInput) => request<LoginResponse>("/auth/login", { method: "POST", body, public: true }),

  // ----- Thành viên -----
  getMe: () => request<Me>("/me"),
  updateMe: (body: UpdateProfileInput) => request<Me>("/me", { method: "PUT", body }),
  linkPhone: (body: { token?: string; accessToken?: string; phone?: string }) =>
    request<LinkPhoneResponse>("/me/phone", { method: "POST", body }),
  getPoints: (page = 1, pageSize = 20) =>
    request<Paginated<PointTransaction>>("/me/points", { query: { page, pageSize } }),

  // ----- Voucher -----
  getVouchers: (type?: "free" | "points") => request<ClaimableVoucher[]>("/vouchers", { query: { type } }),
  getVoucher: (id: number | string) => request<ClaimableVoucher>(`/vouchers/${id}`),
  claimVoucher: (id: number | string) => request<CustomerVoucher>(`/vouchers/${id}/claim`, { method: "POST" }),
  getMyVouchers: (status?: CustomerVoucherStatus) =>
    request<CustomerVoucher[]>("/my-vouchers", { query: { status } }),
  getMyVoucher: (id: number | string) => request<CustomerVoucher>(`/my-vouchers/${id}`),

  // ----- Đặt bàn -----
  getBookings: (scope?: "upcoming" | "past") => request<Booking[]>("/bookings", { query: { scope } }),
  getBooking: (id: number | string) => request<Booking>(`/bookings/${id}`),
  createBooking: (body: CreateBookingInput) => request<Booking>("/bookings", { method: "POST", body }),
  cancelBooking: (id: number | string) => request<Booking>(`/bookings/${id}/cancel`, { method: "POST" }),

  // ----- Hoá đơn -----
  getOrders: (page = 1, pageSize = 20) => request<Paginated<Order>>("/orders", { query: { page, pageSize } }),
  getOrder: (id: number | string) => request<Order>(`/orders/${id}`),
};
