import { AppPage } from "@/components/app-page";
import { AppIcon } from "@/components/icons";
import { MemberCard } from "@/components/member-card";
import { Empty, ErrorState, Loading } from "@/components/states";
import { useAppData } from "@/hooks/use-app-data";
import { useAuth } from "@/hooks/use-auth";
import { tierGradient } from "@/utils/color";
import { formatMoney, splitLines } from "@/utils/format";

export default function TiersPage() {
  const { me } = useAuth();
  const { tiers, config, loading, error, reload } = useAppData();

  return (
    <AppPage back title="Hạng thành viên">
      <div className="page-pad">
        {me && <MemberCard me={me} brandName={config?.brand.name} />}

        {config && (
          <div className="card card--note">
            <AppIcon name="sparkle" size={18} />
            <div>
              Hạng thành viên <b>dùng chung</b> cho mọi thương hiệu trong hệ thống và được xét theo <b>tổng chi tiêu</b> tại tất cả
              thương hiệu (hiện tại: <b>{formatMoney(me?.totalSpent ?? 0)}</b>). Điểm được tích <b>riêng cho từng thương hiệu</b>: tại{" "}
              {config.brand.name}, mỗi <b>{formatMoney(config.pointPerAmount)}</b> = 1 điểm (nhân hệ số theo hạng) và chỉ dùng để đổi
              ưu đãi của {config.brand.name}.
            </div>
          </div>
        )}

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message="Không tải được danh sách hạng" onRetry={reload} />
        ) : !tiers.length ? (
          <Empty icon="crown" title="Chưa có hạng thành viên" />
        ) : (
          <div className="list-gap">
            {tiers.map((t) => {
              const current = me?.tier?.id === t.id;
              const reached = (me?.totalSpent ?? 0) >= t.minSpent;
              return (
                <div key={t.id} className={`tier-card ${current ? "tier-card--current" : ""}`} style={{ borderColor: current ? t.color : undefined }}>
                  <div className="tier-card__head" style={{ background: tierGradient(t.color) }}>
                    <div className="tier-card__name">
                      <AppIcon name="crown" size={18} /> {t.name}
                    </div>
                    <div className="tier-card__req">
                      {t.minSpent > 0 ? `Chi tiêu từ ${formatMoney(t.minSpent)}` : "Mặc định khi đăng ký"}
                    </div>
                    {current && <span className="tier-card__current">Hạng của bạn</span>}
                  </div>
                  <div className="tier-card__body">
                    <div className="tier-card__mult">Hệ số tích điểm: x{t.pointMultiplier}</div>
                    {splitLines(t.benefits).length ? (
                      <ul className="benefits">
                        {splitLines(t.benefits).map((b, i) => (
                          <li key={i}>
                            <AppIcon name="check" size={16} strokeWidth={2.4} style={{ color: t.color }} />
                            {b}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="muted">Chưa có mô tả quyền lợi</div>
                    )}
                    {!reached && me && (
                      <div className="tier-card__need">
                        Cần chi tiêu thêm {formatMoney(t.minSpent - me.totalSpent)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppPage>
  );
}
