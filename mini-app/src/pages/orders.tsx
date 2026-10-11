import { Button, useNavigate } from "zmp-ui";
import { api } from "@/api";
import { AppPage } from "@/components/app-page";
import { Badge } from "@/components/badge";
import { AppIcon } from "@/components/icons";
import { Empty, ErrorState, SkeletonList } from "@/components/states";
import { usePaginated } from "@/hooks/use-paginated";
import { formatDateTime, formatMoney, formatNumber } from "@/utils/format";

export default function OrdersPage() {
  const navigate = useNavigate();
  const list = usePaginated((page) => api.getOrders(page));

  return (
    <AppPage back title="Lịch sử ăn uống">
      <div className="page-pad">
        {list.initialLoading ? (
          <SkeletonList count={4} height={96} />
        ) : list.error && !list.items.length ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : !list.items.length ? (
          <Empty
            icon="utensils"
            title="Chưa có hoá đơn nào"
            description="Đưa mã thành viên cho nhân viên khi thanh toán để lưu lịch sử và tích điểm."
            action={
              <Button size="small" onClick={() => navigate("/booking")}>
                Đặt bàn ngay
              </Button>
            }
          />
        ) : (
          <div className="list-gap">
            {list.items.map((o) => {
              const cancelled = o.status === "CANCELLED";
              return (
                <div
                  key={o.id}
                  className={`order-card ${cancelled ? "order-card--cancelled" : ""}`}
                  role="button"
                  onClick={() => navigate(`/orders/${o.id}`)}
                >
                  <div className="order-card__icon">
                    <AppIcon name="receipt" size={22} />
                  </div>
                  <div className="order-card__main">
                    <div className="order-card__title">
                      {o.branch?.name ?? "Nhà hàng"}
                      {cancelled && <Badge tone="danger">Đã huỷ</Badge>}
                    </div>
                    <div className="order-card__sub">
                      #{o.code} · {formatDateTime(o.createdAt)}
                    </div>
                    {o._count && <div className="order-card__sub">{o._count.items} món</div>}
                  </div>
                  <div className="order-card__right">
                    <div className="order-card__total">{formatMoney(o.total)}</div>
                    {o.pointsEarned > 0 && !cancelled && (
                      <div className="order-card__points">+{formatNumber(o.pointsEarned)} điểm</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {list.hasMore && (
          <div className="load-more">
            <Button variant="secondary" size="small" loading={list.loading} onClick={list.loadMore}>
              Xem thêm
            </Button>
          </div>
        )}
      </div>
    </AppPage>
  );
}
