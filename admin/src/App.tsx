import { Route, Routes } from 'react-router-dom';
import { Result, Button } from 'antd';
import { Link } from 'react-router-dom';
import AdminLayout from './layouts/AdminLayout';
import { RequireAuth, RequireManager, RequireSuperAdmin } from './auth/RequireAuth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/customers/CustomersPage';
import CustomerDetailPage from './pages/customers/CustomerDetailPage';
import BookingsPage from './pages/bookings/BookingsPage';
import OrdersPage from './pages/orders/OrdersPage';
import VouchersPage from './pages/vouchers/VouchersPage';
import VoucherDetailPage from './pages/vouchers/VoucherDetailPage';
import PromotionsPage from './pages/PromotionsPage';
import TiersPage from './pages/TiersPage';
import BranchesPage from './pages/BranchesPage';
import SettingsPage from './pages/SettingsPage';
import AdminsPage from './pages/AdminsPage';
import BrandsPage from './pages/BrandsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="bookings" element={<BookingsPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="vouchers" element={<VouchersPage />} />
        <Route path="vouchers/:id" element={<VoucherDetailPage />} />
        <Route path="promotions" element={<PromotionsPage />} />
        <Route path="tiers" element={<TiersPage />} />
        <Route path="branches" element={<BranchesPage />} />
        <Route
          path="brands"
          element={
            <RequireSuperAdmin>
              <BrandsPage />
            </RequireSuperAdmin>
          }
        />
        <Route
          path="settings"
          element={
            <RequireManager>
              <SettingsPage />
            </RequireManager>
          }
        />
        <Route
          path="admins"
          element={
            <RequireManager>
              <AdminsPage />
            </RequireManager>
          }
        />
        <Route
          path="*"
          element={
            <Result
              status="404"
              title="Không tìm thấy trang"
              extra={
                <Link to="/">
                  <Button type="primary">Về trang tổng quan</Button>
                </Link>
              }
            />
          }
        />
      </Route>
    </Routes>
  );
}
