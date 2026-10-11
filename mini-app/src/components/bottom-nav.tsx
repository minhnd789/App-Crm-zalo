import { useMemo } from "react";
import { BottomNavigation, useLocation, useNavigate } from "zmp-ui";
import { AppIcon, type IconName } from "./icons";

const TABS: { path: string; label: string; icon: IconName }[] = [
  { path: "/", label: "Trang chủ", icon: "home" },
  { path: "/offers", label: "Ưu đãi", icon: "gift" },
  { path: "/booking", label: "Đặt bàn", icon: "calendar" },
  { path: "/wallet", label: "Ví voucher", icon: "ticket" },
  { path: "/account", label: "Tài khoản", icon: "user" },
];

export const TAB_PATHS = TABS.map((t) => t.path);

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const active = useMemo(() => TABS.find((t) => t.path === location.pathname)?.path, [location.pathname]);

  if (!active) return null;

  return (
    <BottomNavigation
      id="bottom-nav"
      className="bottom-nav"
      activeKey={active}
      onChange={(key) => {
        if (key !== location.pathname) navigate(key, { animate: false });
      }}
      fixed
    >
      {TABS.map((t) => (
        <BottomNavigation.Item
          key={t.path}
          itemKey={t.path}
          label={t.label}
          icon={<AppIcon name={t.icon} size={22} />}
          activeIcon={<AppIcon name={t.icon} size={22} strokeWidth={2.4} />}
        />
      ))}
    </BottomNavigation>
  );
}
