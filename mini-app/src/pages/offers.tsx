import { Tabs, useNavigate, useSearchParams } from "zmp-ui";
import { api, type ClaimableVoucher } from "@/api";
import { AppPage } from "@/components/app-page";
import { ClaimButton } from "@/components/claim-button";
import { AppIcon } from "@/components/icons";
import { PromotionCard } from "@/components/promotion-card";
import { AsyncView, Empty, SkeletonList } from "@/components/states";
import { VoucherTicket } from "@/components/voucher-ticket";
import { useAuth } from "@/hooks/use-auth";
import { useRequest } from "@/hooks/use-request";
import { formatMoney, formatNumber } from "@/utils/format";

const TAB_KEYS = ["promotions", "free", "points"] as const;
type TabKey = (typeof TAB_KEYS)[number];

function PromotionsTab() {
  const navigate = useNavigate();
  const req = useRequest(() => api.getPromotions(), []);
  return (
    <AsyncView
      {...req}
      onRetry={req.reload}
      skeleton={<SkeletonList count={3} height={220} />}
      isEmpty={(d) => d.length === 0}
      empty={<Empty icon="gift" title="Chưa có chương trình ưu đãi" description="Các chương trình mới sẽ được cập nhật tại đây." />}
    >
      {(list) => (
        <div className="list-gap">
          {list.map((p) => (
            <PromotionCard key={p.id} promotion={p} onClick={() => navigate(`/promotions/${p.id}`)} />
          ))}
        </div>
      )}
    </AsyncView>
  );
}

export function voucherMeta(v: ClaimableVoucher): string {
  const parts: string[] = [];
  if (v.minOrder > 0) parts.push(`Đơn từ ${formatMoney(v.minOrder)}`);
  if (v.minTier) parts.push(`Hạng ${v.minTier.name}+`);
  if (v.remaining !== null) parts.push(`Còn ${formatNumber(v.remaining)} lượt`);
  if (!parts.length) parts.push(`HSD ${v.validDays} ngày`);
  return parts.join(" · ");
}

function VoucherListTab({ type }: { type: "free" | "points" }) {
  const navigate = useNavigate();
  const { me } = useAuth();
  const req = useRequest(() => api.getVouchers(type), [type]);
  return (
    <>
      {type === "points" && me && (
        <div className="points-banner">
          <AppIcon name="coin" size={26} />
          <div>
            <div className="points-banner__label">Điểm hiện có</div>
            <div className="points-banner__value">{formatNumber(me.points)} điểm</div>
          </div>
          <button className="points-banner__link" onClick={() => navigate("/account/points")}>
            Lịch sử
          </button>
        </div>
      )}
      <AsyncView
        {...req}
        onRetry={req.reload}
        skeleton={<SkeletonList count={4} />}
        isEmpty={(d) => d.length === 0}
        empty={
          <Empty
            icon="ticket"
            title={type === "free" ? "Chưa có voucher để nhận" : "Chưa có quà đổi điểm"}
            description="Hãy quay lại sau nhé!"
          />
        }
      >
        {(list) => (
          <div className="list-gap">
            {list.map((v) => (
              <VoucherTicket
                key={v.id}
                voucher={v}
                onClick={() => navigate(`/vouchers/${v.id}`)}
                meta={
                  type === "points" ? (
                    <span className="ticket__cost">{formatNumber(v.pointCost)} điểm</span>
                  ) : (
                    voucherMeta(v)
                  )
                }
                action={<ClaimButton voucher={v} onClaimed={() => req.reload()} />}
              />
            ))}
          </div>
        )}
      </AsyncView>
    </>
  );
}

export default function OffersPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const active: TabKey = TAB_KEYS.includes(raw as TabKey) ? (raw as TabKey) : "promotions";

  return (
    <AppPage tab title="Ưu đãi">
      <Tabs
        id="offers-tabs"
        className="app-tabs"
        activeKey={active}
        onChange={(key) => setParams({ tab: key }, { replace: true })}
      >
        <Tabs.Tab key="promotions" label="Chương trình">
          <div className="tab-body">{active === "promotions" && <PromotionsTab />}</div>
        </Tabs.Tab>
        <Tabs.Tab key="free" label="Nhận voucher">
          <div className="tab-body">{active === "free" && <VoucherListTab type="free" />}</div>
        </Tabs.Tab>
        <Tabs.Tab key="points" label="Đổi điểm">
          <div className="tab-body">{active === "points" && <VoucherListTab type="points" />}</div>
        </Tabs.Tab>
      </Tabs>
    </AppPage>
  );
}
