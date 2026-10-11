import type { Me } from "@/api/types";
import { formatNumber } from "@/utils/format";
import { tierGradient } from "@/utils/color";
import { AppIcon } from "./icons";

/** Thẻ thành viên: tên, hạng, điểm, tiến độ lên hạng */
export function MemberCard({ me, onShowQR }: { me: Me; onShowQR?: () => void }) {
  const tierColor = me.tier?.color;
  const next = me.nextTier;
  const percent = next && next.minPoints > 0 ? Math.min(100, Math.round((me.lifetimePoints / next.minPoints) * 100)) : 100;

  return (
    <div className="member-card" style={{ background: tierGradient(tierColor) }}>
      <div className="member-card__shine" />
      <div className="member-card__top">
        <div>
          <div className="member-card__label">Thẻ thành viên</div>
          <div className="member-card__name">{me.name}</div>
        </div>
        <div className="member-card__tier">
          <AppIcon name="crown" size={14} strokeWidth={2.2} />
          {me.tier?.name ?? "Thành viên"}
        </div>
      </div>

      <div className="member-card__points">
        <div>
          <div className="member-card__label">Điểm hiện có</div>
          <div className="member-card__value">
            {formatNumber(me.points)} <span>điểm</span>
          </div>
        </div>
        {onShowQR && (
          <button className="member-card__qr" onClick={onShowQR}>
            <AppIcon name="qr" size={20} />
            <span>Mã QR</span>
          </button>
        )}
      </div>

      <div className="member-card__progress">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="member-card__hint">
          {next ? (
            <>
              Còn <b>{formatNumber(me.pointsToNextTier)}</b> điểm để lên hạng <b>{next.name}</b>
            </>
          ) : (
            <>Bạn đang ở hạng cao nhất</>
          )}
        </div>
      </div>
      <div className="member-card__code">Mã thành viên: {me.memberCode}</div>
    </div>
  );
}
