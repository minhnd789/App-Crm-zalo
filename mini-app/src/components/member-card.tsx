import type { Me } from "@/api/types";
import { formatMoney, formatNumber } from "@/utils/format";
import { tierGradient } from "@/utils/color";
import { AppIcon } from "./icons";

/** Thẻ thành viên: tên, hạng, điểm, tiến độ lên hạng */
export function MemberCard({
  me,
  onShowQR,
  onRegister,
  brandName,
}: {
  me: Me;
  onShowQR?: () => void;
  /** Khi chưa đăng ký: hiển thị lời mời đăng ký thay cho điểm & tiến độ */
  onRegister?: () => void;
  brandName?: string;
}) {
  const tierColor = me.tier?.color;
  const next = me.nextTier;
  // Hạng dùng chung cho cả hệ thống, xét theo tổng chi tiêu ở mọi thương hiệu
  const percent = next && next.minSpent > 0 ? Math.min(100, Math.round((me.totalSpent / next.minSpent) * 100)) : 100;

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

      {!me.registered && onRegister ? (
        <div className="member-card__register">
          <div className="member-card__register-text">
            <b>Bạn chưa là thành viên {brandName ?? ""}</b>
            Đăng ký để nhận điểm chào mừng, tích điểm và đổi ưu đãi.
          </div>
          <button className="member-card__register-btn" onClick={onRegister}>
            Đăng ký thành viên
          </button>
        </div>
      ) : (
        <>
          <div className="member-card__points">
            <div>
              <div className="member-card__label">Điểm tại {brandName ?? "thương hiệu này"}</div>
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
                  Chi tiêu thêm <b>{formatMoney(me.amountToNextTier)}</b> để lên hạng <b>{next.name}</b>
                </>
              ) : (
                <>Bạn đang ở hạng cao nhất</>
              )}
            </div>
          </div>
          <div className="member-card__code">Mã thành viên: {me.memberCode}</div>
        </>
      )}
    </div>
  );
}
