import { Button, Tabs, useNavigate, useSearchParams } from "zmp-ui";
import { api, type CustomerVoucherStatus } from "@/api";
import { AppPage } from "@/components/app-page";
import { AsyncView, Empty, SkeletonList } from "@/components/states";
import { VoucherTicket } from "@/components/voucher-ticket";
import { useRequest } from "@/hooks/use-request";
import { dayjs, formatDate } from "@/utils/format";

const TABS: { key: CustomerVoucherStatus; label: string; empty: string }[] = [
  { key: "AVAILABLE", label: "Còn hiệu lực", empty: "Bạn chưa có voucher nào" },
  { key: "USED", label: "Đã dùng", empty: "Chưa có voucher đã sử dụng" },
  { key: "EXPIRED", label: "Hết hạn", empty: "Không có voucher hết hạn" },
];

function expiryText(expiresAt: string): string {
  const days = dayjs(expiresAt).diff(dayjs(), "day");
  if (days <= 0) return `Hết hạn hôm nay`;
  if (days <= 3) return `Còn ${days} ngày`;
  return `HSD: ${formatDate(expiresAt)}`;
}

function WalletList({ status }: { status: CustomerVoucherStatus }) {
  const navigate = useNavigate();
  const req = useRequest(() => api.getMyVouchers(status), [status]);
  const tab = TABS.find((t) => t.key === status)!;
  return (
    <AsyncView
      {...req}
      onRetry={req.reload}
      skeleton={<SkeletonList count={4} />}
      isEmpty={(d) => d.length === 0}
      empty={
        <Empty
          icon="ticket"
          title={tab.empty}
          description={status === "AVAILABLE" ? "Nhận voucher miễn phí hoặc đổi điểm để nhận ưu đãi nhé!" : undefined}
          action={
            status === "AVAILABLE" ? (
              <Button size="small" onClick={() => navigate("/offers?tab=free")}>
                Săn voucher
              </Button>
            ) : undefined
          }
        />
      }
    >
      {(list) => (
        <div className="list-gap">
          {list.map((cv) => (
            <VoucherTicket
              key={cv.id}
              voucher={cv.voucher}
              muted={status !== "AVAILABLE"}
              stamp={status === "USED" ? "Đã dùng" : status === "EXPIRED" ? "Hết hạn" : undefined}
              onClick={() => navigate(`/my-vouchers/${cv.id}`)}
              meta={
                status === "AVAILABLE" ? (
                  <span className={dayjs(cv.expiresAt).diff(dayjs(), "day") <= 3 ? "text-danger" : undefined}>
                    {expiryText(cv.expiresAt)}
                  </span>
                ) : status === "USED" ? (
                  `Dùng ngày ${formatDate(cv.usedAt)}`
                ) : (
                  `Hết hạn ${formatDate(cv.expiresAt)}`
                )
              }
              action={status === "AVAILABLE" ? <span className="ticket__use">Dùng ngay</span> : undefined}
            />
          ))}
        </div>
      )}
    </AsyncView>
  );
}

export default function WalletPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("status") as CustomerVoucherStatus | null;
  const active: CustomerVoucherStatus = TABS.some((t) => t.key === raw) ? raw! : "AVAILABLE";

  return (
    <AppPage tab title="Ví voucher">
      <Tabs
        id="wallet-tabs"
        className="app-tabs"
        activeKey={active}
        onChange={(key) => setParams({ status: key }, { replace: true })}
      >
        {TABS.map((t) => (
          <Tabs.Tab key={t.key} label={t.label}>
            <div className="tab-body">{active === t.key && <WalletList status={t.key} />}</div>
          </Tabs.Tab>
        ))}
      </Tabs>
    </AppPage>
  );
}
