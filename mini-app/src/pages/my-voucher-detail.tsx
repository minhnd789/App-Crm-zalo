import { useParams } from "zmp-ui";
import { QRCodeSVG } from "qrcode.react";
import { api } from "@/api";
import { AppPage } from "@/components/app-page";
import { Badge } from "@/components/badge";
import { AppIcon } from "@/components/icons";
import { InfoRow } from "@/components/section";
import { AsyncView, Loading } from "@/components/states";
import { useNotify } from "@/hooks/use-notify";
import { useRequest } from "@/hooks/use-request";
import { formatDate, formatDateTime, formatMoney, formatNumber, voucherValueLabel } from "@/utils/format";

const SOURCE_LABEL = { CLAIM: "Nhận miễn phí", REDEEM: "Đổi điểm", GIFT: "Nhà hàng tặng" } as const;

export default function MyVoucherDetailPage() {
  const { id } = useParams();
  const notify = useNotify();
  const req = useRequest(() => api.getMyVoucher(id!), [id]);

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      notify.success("Đã sao chép mã voucher");
    } catch {
      notify.info(`Mã voucher: ${code}`);
    }
  };

  return (
    <AppPage back title="Voucher của tôi">
      <AsyncView {...req} onRetry={req.reload} skeleton={<Loading />}>
        {(cv) => {
          const v = cv.voucher;
          const available = cv.status === "AVAILABLE";
          return (
            <div className="detail detail--padded">
              <div className={`code-card ${available ? "" : "code-card--muted"}`}>
                <div className="code-card__value">{voucherValueLabel(v)}</div>
                <div className="code-card__title">{v.title}</div>
                <div className="code-card__divider" />
                <div className="qr-box qr-box--small">
                  <QRCodeSVG value={cv.code} size={170} level="M" marginSize={0} fgColor={available ? "#1c1917" : "#a8a29e"} />
                </div>
                <button className="code-card__code" onClick={() => copy(cv.code)}>
                  {cv.code}
                  <AppIcon name="copy" size={16} />
                </button>
                {available ? (
                  <div className="code-card__hint">Đưa mã cho nhân viên khi thanh toán</div>
                ) : (
                  <Badge tone={cv.status === "USED" ? "success" : "neutral"}>
                    {cv.status === "USED" ? "Đã sử dụng" : "Đã hết hạn"}
                  </Badge>
                )}
                <div className="code-card__expiry">
                  {available ? `Hạn sử dụng: ${formatDateTime(cv.expiresAt)}` : `Hết hạn: ${formatDateTime(cv.expiresAt)}`}
                </div>
              </div>

              <div className="card">
                <h3 className="card__title">Thông tin voucher</h3>
                {v.description && <InfoRow label="Mô tả" value={v.description} />}
                <InfoRow label="Đơn tối thiểu" value={v.minOrder > 0 ? formatMoney(v.minOrder) : "Không yêu cầu"} />
                {v.discountType === "PERCENT" && v.maxDiscount ? (
                  <InfoRow label="Giảm tối đa" value={formatMoney(v.maxDiscount)} />
                ) : null}
                <InfoRow label="Nguồn" value={SOURCE_LABEL[cv.source]} />
                {cv.pointsSpent > 0 && <InfoRow label="Điểm đã dùng" value={`${formatNumber(cv.pointsSpent)} điểm`} />}
                <InfoRow label="Ngày nhận" value={formatDate(cv.createdAt)} />
                {cv.usedAt && <InfoRow label="Ngày sử dụng" value={formatDateTime(cv.usedAt)} />}
                {cv.order && <InfoRow label="Hoá đơn" value={`#${cv.order.code}`} />}
              </div>
            </div>
          );
        }}
      </AsyncView>
    </AppPage>
  );
}
