import { useNavigate, useParams } from "zmp-ui";
import { api } from "@/api";
import { AppPage } from "@/components/app-page";
import { ClaimButton } from "@/components/claim-button";
import { InfoRow } from "@/components/section";
import { AsyncView, Loading } from "@/components/states";
import { VoucherTicket } from "@/components/voucher-ticket";
import { useAuth } from "@/hooks/use-auth";
import { useRequest } from "@/hooks/use-request";
import { DISCOUNT_TYPE_LABEL, formatDate, formatMoney, formatNumber, voucherValueLabel } from "@/utils/format";

export default function VoucherDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const req = useRequest(() => api.getVoucher(id!), [id]);

  return (
    <AppPage back title="Chi tiết voucher">
      <AsyncView {...req} onRetry={req.reload} skeleton={<Loading />}>
        {(v) => (
          <div className="detail detail--padded">
            <VoucherTicket voucher={v} />

            <div className="card">
              <h3 className="card__title">Điều kiện áp dụng</h3>
              <InfoRow label="Loại ưu đãi" value={DISCOUNT_TYPE_LABEL[v.discountType]} />
              <InfoRow label="Giá trị" value={voucherValueLabel(v)} />
              {v.discountType === "PERCENT" && v.maxDiscount ? (
                <InfoRow label="Giảm tối đa" value={formatMoney(v.maxDiscount)} />
              ) : null}
              <InfoRow label="Đơn tối thiểu" value={v.minOrder > 0 ? formatMoney(v.minOrder) : "Không yêu cầu"} />
              <InfoRow label="Hạn sử dụng" value={`${v.validDays} ngày kể từ khi nhận`} />
              {v.endDate && <InfoRow label="Chương trình kết thúc" value={formatDate(v.endDate)} />}
              <InfoRow
                label="Số lượng còn lại"
                value={v.remaining === null ? "Không giới hạn" : `${formatNumber(v.remaining)} lượt`}
              />
              <InfoRow label="Mỗi khách được nhận" value={`${v.perCustomerLimit} lần (đã nhận ${v.ownedCount})`} />
              <InfoRow label="Hạng tối thiểu" value={v.minTier ? v.minTier.name : "Mọi hạng"} />
              {v.pointCost > 0 && (
                <>
                  <InfoRow label="Điểm cần đổi" value={<b className="text-primary">{formatNumber(v.pointCost)} điểm</b>} />
                  <InfoRow label="Điểm hiện có" value={`${formatNumber(me?.points ?? 0)} điểm`} />
                </>
              )}
            </div>

            {v.description && (
              <div className="card">
                <h3 className="card__title">Mô tả</h3>
                <p className="card__text">{v.description}</p>
              </div>
            )}

            <div className="sticky-cta">
              <ClaimButton
                voucher={v}
                size="large"
                fullWidth
                onClaimed={(cv) => navigate(`/my-vouchers/${cv.id}`, { replace: true })}
              />
            </div>
          </div>
        )}
      </AsyncView>
    </AppPage>
  );
}
