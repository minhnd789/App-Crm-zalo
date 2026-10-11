import React from "react";
import { AnimationRoutes, App, Button, Route, SnackbarProvider, Spinner, ZMPRouter } from "zmp-ui";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { AppDataProvider } from "@/hooks/use-app-data";
import { BottomNav } from "./bottom-nav";
import { AppIcon } from "./icons";
import HomePage from "@/pages/home";
import OffersPage from "@/pages/offers";
import PromotionDetailPage from "@/pages/promotion-detail";
import VoucherDetailPage from "@/pages/voucher-detail";
import BookingPage from "@/pages/booking";
import WalletPage from "@/pages/wallet";
import MyVoucherDetailPage from "@/pages/my-voucher-detail";
import AccountPage from "@/pages/account";
import ProfilePage from "@/pages/profile";
import PointsHistoryPage from "@/pages/points-history";
import OrdersPage from "@/pages/orders";
import OrderDetailPage from "@/pages/order-detail";
import TiersPage from "@/pages/tiers";
import RestaurantPage from "@/pages/restaurant";
import NotFoundPage from "@/pages/not-found";

/** Màn hình chờ trong lúc đăng nhập Zalo */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { me, loading, error, retry } = useAuth();
  if (loading && !me) {
    return (
      <div className="splash">
        <div className="splash__logo">
          <AppIcon name="utensils" size={40} />
        </div>
        <Spinner visible />
        <div className="splash__text">Đang đăng nhập...</div>
      </div>
    );
  }
  if (!me) {
    return (
      <div className="splash">
        <div className="splash__logo splash__logo--error">
          <AppIcon name="info" size={40} />
        </div>
        <div className="splash__title">Không thể đăng nhập</div>
        <div className="splash__text">{error ?? "Vui lòng thử lại"}</div>
        <Button onClick={retry}>Thử lại</Button>
      </div>
    );
  }
  return <>{children}</>;
}

const Layout = () => {
  return (
    <App theme="light">
      <SnackbarProvider>
        <AuthProvider>
          <AppDataProvider>
            <ZMPRouter>
              <AuthGate>
                <AnimationRoutes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/offers" element={<OffersPage />} />
                  <Route path="/promotions/:id" element={<PromotionDetailPage />} />
                  <Route path="/vouchers/:id" element={<VoucherDetailPage />} />
                  <Route path="/booking" element={<BookingPage />} />
                  <Route path="/wallet" element={<WalletPage />} />
                  <Route path="/my-vouchers/:id" element={<MyVoucherDetailPage />} />
                  <Route path="/account" element={<AccountPage />} />
                  <Route path="/account/profile" element={<ProfilePage />} />
                  <Route path="/account/points" element={<PointsHistoryPage />} />
                  <Route path="/orders" element={<OrdersPage />} />
                  <Route path="/orders/:id" element={<OrderDetailPage />} />
                  <Route path="/tiers" element={<TiersPage />} />
                  <Route path="/restaurant" element={<RestaurantPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </AnimationRoutes>
                <BottomNav />
              </AuthGate>
            </ZMPRouter>
          </AppDataProvider>
        </AuthProvider>
      </SnackbarProvider>
    </App>
  );
};

export default Layout;
