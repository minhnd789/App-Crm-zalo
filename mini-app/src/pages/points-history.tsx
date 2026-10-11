import { Button } from "zmp-ui";
import { api } from "@/api";
import { AppPage } from "@/components/app-page";
import { AppIcon } from "@/components/icons";
import { Empty, ErrorState, SkeletonList } from "@/components/states";
import { useAuth } from "@/hooks/use-auth";
import { usePaginated } from "@/hooks/use-paginated";
import { formatDateTime, formatNumber, formatPointsDelta, POINT_TYPE_LABEL } from "@/utils/format";

export default function PointsHistoryPage() {
  const { me } = useAuth();
  const list = usePaginated((page) => api.getPoints(page));

  return (
    <AppPage back title="Lịch sử tích điểm">
      <div className="page-pad">
        {me && (
          <div className="points-summary">
            <div>
              <div className="points-summary__label">Điểm hiện có</div>
              <div className="points-summary__value">{formatNumber(me.points)}</div>
            </div>
            <div>
              <div className="points-summary__label">Tổng điểm tích luỹ</div>
              <div className="points-summary__value points-summary__value--sm">{formatNumber(me.lifetimePoints)}</div>
            </div>
          </div>
        )}

        {list.initialLoading ? (
          <SkeletonList count={5} height={64} />
        ) : list.error && !list.items.length ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : !list.items.length ? (
          <Empty icon="chart" title="Chưa có giao dịch điểm" description="Tích điểm mỗi lần dùng bữa tại nhà hàng nhé!" />
        ) : (
          <div className="card card--list">
            {list.items.map((t) => {
              const positive = t.points > 0;
              return (
                <div key={t.id} className="tx-row">
                  <div className={`tx-row__icon ${positive ? "tx-row__icon--plus" : "tx-row__icon--minus"}`}>
                    <AppIcon name={positive ? "plus" : "minus"} size={18} strokeWidth={2.4} />
                  </div>
                  <div className="tx-row__main">
                    <div className="tx-row__title">{t.description || POINT_TYPE_LABEL[t.type]}</div>
                    <div className="tx-row__sub">
                      {POINT_TYPE_LABEL[t.type]} · {formatDateTime(t.createdAt)}
                    </div>
                  </div>
                  <div className="tx-row__right">
                    <div className={`tx-row__points ${positive ? "text-success" : "text-danger"}`}>
                      {formatPointsDelta(t.points)}
                    </div>
                    <div className="tx-row__sub">Số dư {formatNumber(t.balanceAfter)}</div>
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
