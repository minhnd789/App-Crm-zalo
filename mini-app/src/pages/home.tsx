import { useState } from "react";
import { Avatar, useNavigate } from "zmp-ui";
import { api } from "@/api";
import { AppPage } from "@/components/app-page";
import { AppIcon, type IconName } from "@/components/icons";
import { MemberCard } from "@/components/member-card";
import { MemberQRSheet } from "@/components/member-qr-sheet";
import { PromotionCard } from "@/components/promotion-card";
import { Section } from "@/components/section";
import { AsyncView, Empty, SkeletonList } from "@/components/states";
import { VoucherTicket } from "@/components/voucher-ticket";
import { ClaimButton } from "@/components/claim-button";
import { useAuth } from "@/hooks/use-auth";
import { useAppData } from "@/hooks/use-app-data";
import { useRequest } from "@/hooks/use-request";
import { dayjs, formatMoney, initials } from "@/utils/format";

function greeting() {
  const h = dayjs().hour();
  if (h < 11) return "Chào buổi sáng";
  if (h < 14) return "Chào buổi trưa";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

/** color = null → dùng màu thương hiệu */
const QUICK_ACTIONS: { label: string; icon: IconName; to: string; color: string | null }[] = [
  { label: "Đặt bàn", icon: "calendar", to: "/booking", color: null },
  { label: "Đổi điểm", icon: "coin", to: "/offers?tab=points", color: "#B45309" },
  { label: "Voucher của tôi", icon: "ticket", to: "/wallet", color: "#BE123C" },
  { label: "Lịch sử ăn uống", icon: "receipt", to: "/orders", color: "#0F766E" },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const { config } = useAppData();
  const [showQR, setShowQR] = useState(false);

  const promotions = useRequest(() => api.getPromotions(true), []);
  const freeVouchers = useRequest(() => api.getVouchers("free"), []);

  if (!me) return null;

  return (
    <AppPage tab noHeader className="home">
      <div className="home-hero">
        <div className="home-hero__row">
          <Avatar size={44} src={me.avatar ?? undefined} className="home-hero__avatar">
            {initials(me.name)}
          </Avatar>
          <div className="home-hero__text">
            <div className="home-hero__greet">{greeting()},</div>
            <div className="home-hero__name">{me.name}</div>
          </div>
          {config && (
            <div className="home-hero__brand">
              {config.brand.logoUrl && <img src={config.brand.logoUrl} alt="" className="home-hero__logo" />}
              <span>{config.brand.name}</span>
            </div>
          )}
        </div>
      </div>

      <div className="home-card-wrap">
        <MemberCard
          me={me}
          brandName={config?.brand.name}
          onShowQR={() => setShowQR(true)}
          onRegister={() => navigate("/register")}
        />
      </div>
      <button className="tier-note" onClick={() => navigate("/tiers")}>
        <AppIcon name="info" size={14} />
        <span>Hạng tính theo tổng chi tiêu tại mọi thương hiệu trong hệ thống · điểm tích riêng từng thương hiệu</span>
      </button>

      <div className="stats-row">
        <div className="stat">
          <div className="stat__value">{me.availableVouchers}</div>
          <div className="stat__label">Voucher khả dụng</div>
        </div>
        <div className="stat">
          <div className="stat__value">{me.brandVisitCount}</div>
          <div className="stat__label">Lần ghé thăm</div>
        </div>
        <div className="stat">
          <div className="stat__value stat__value--sm">{formatMoney(me.totalSpent)}</div>
          <div className="stat__label">Chi tiêu xét hạng</div>
        </div>
      </div>

      <div className="quick-grid">
        {QUICK_ACTIONS.map((a) => (
          <button key={a.label} className="quick-item" onClick={() => navigate(a.to)}>
            <span
              className={`quick-item__icon ${a.color ? "" : "quick-item__icon--brand"}`}
              style={a.color ? { color: a.color, background: `${a.color}14` } : undefined}
            >
              <AppIcon name={a.icon} size={24} />
            </span>
            <span className="quick-item__label">{a.label}</span>
          </button>
        ))}
      </div>

      <Section title="Ưu đãi nổi bật" onMore={() => navigate("/offers?tab=promotions")}>
        <AsyncView
          {...promotions}
          onRetry={promotions.reload}
          skeleton={<SkeletonList count={1} height={200} />}
          isEmpty={(d) => d.length === 0}
          empty={<Empty icon="gift" title="Chưa có chương trình nổi bật" description="Quay lại sau để không bỏ lỡ ưu đãi nhé!" />}
        >
          {(list) => (
            <div className="h-scroll">
              {list.map((p) => (
                <PromotionCard key={p.id} promotion={p} compact onClick={() => navigate(`/promotions/${p.id}`)} />
              ))}
            </div>
          )}
        </AsyncView>
      </Section>

      <Section title="Voucher miễn phí" onMore={() => navigate("/offers?tab=free")}>
        <AsyncView
          {...freeVouchers}
          onRetry={freeVouchers.reload}
          skeleton={<SkeletonList count={2} />}
          isEmpty={(d) => d.length === 0}
          empty={<Empty icon="ticket" title="Chưa có voucher miễn phí" />}
        >
          {(list) => (
            <div className="list-gap">
              {list.slice(0, 3).map((v) => (
                <VoucherTicket
                  key={v.id}
                  voucher={v}
                  onClick={() => navigate(`/vouchers/${v.id}`)}
                  meta={v.validDays ? `HSD ${v.validDays} ngày sau khi nhận` : undefined}
                  action={<ClaimButton voucher={v} onClaimed={() => freeVouchers.reload()} />}
                />
              ))}
            </div>
          )}
        </AsyncView>
      </Section>

      {me.registered && !me.phone && (
        <div className="callout">
          <AppIcon name="phone" size={22} />
          <div>
            <b>Liên kết số điện thoại</b>
            <div>Để nhà hàng nhận diện bạn khi tích điểm & đặt bàn.</div>
          </div>
          <button className="callout__btn" onClick={() => navigate("/account")}>
            Liên kết
          </button>
        </div>
      )}

      <MemberQRSheet me={me} visible={showQR} onClose={() => setShowQR(false)} />
    </AppPage>
  );
}
