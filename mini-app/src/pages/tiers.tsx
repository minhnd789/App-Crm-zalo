import { AppPage } from "@/components/app-page";
import { AppIcon } from "@/components/icons";
import { MemberCard } from "@/components/member-card";
import { Empty, ErrorState, Loading } from "@/components/states";
import { useAppData } from "@/hooks/use-app-data";
import { useAuth } from "@/hooks/use-auth";
import { tierGradient } from "@/utils/color";
import { formatMoney, formatNumber, splitLines } from "@/utils/format";

export default function TiersPage() {
  const { me } = useAuth();
  const { tiers, config, loading, error, reload } = useAppData();

  return (
    <AppPage back title="Hạng thành viên">
      <div className="page-pad">
        {me && <MemberCard me={me} />}

        {config && (
          <div className="card card--note">
            <AppIcon name="sparkle" size={18} />
            <div>
              Cứ mỗi <b>{formatMoney(config.pointPerAmount)}</b> chi tiêu bạn nhận 1 điểm (nhân hệ số theo hạng). Hạng được xét theo
              tổng điểm tích luỹ – đổi quà không làm giảm hạng.
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
              const reached = (me?.lifetimePoints ?? 0) >= t.minPoints;
              return (
                <div key={t.id} className={`tier-card ${current ? "tier-card--current" : ""}`} style={{ borderColor: current ? t.color : undefined }}>
                  <div className="tier-card__head" style={{ background: tierGradient(t.color) }}>
                    <div className="tier-card__name">
                      <AppIcon name="crown" size={18} /> {t.name}
                    </div>
                    <div className="tier-card__req">
                      {t.minPoints > 0 ? `Từ ${formatNumber(t.minPoints)} điểm` : "Mặc định khi đăng ký"}
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
                        Cần thêm {formatNumber(t.minPoints - me.lifetimePoints)} điểm tích luỹ
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
