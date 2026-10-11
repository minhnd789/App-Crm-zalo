import { useParams } from "zmp-ui";
import { api } from "@/api";
import { AppPage } from "@/components/app-page";
import { Badge } from "@/components/badge";
import { InfoRow } from "@/components/section";
import { AsyncView, Loading } from "@/components/states";
import { useRequest } from "@/hooks/use-request";
import { formatDateTime, formatMoney, formatNumber } from "@/utils/format";

export default function OrderDetailPage() {
  const { id } = useParams();
  const req = useRequest(() => api.getOrder(id!), [id]);

  return (
    <AppPage back title="Chi tiết hoá đơn">
      <AsyncView {...req} onRetry={req.reload} skeleton={<Loading />}>
        {(o) => {
          const cancelled = o.status === "CANCELLED";
          const items = o.items ?? [];
          return (
            <div className="detail detail--padded">
              <div className="card receipt">
                <div className="receipt__head">
                  <div>
                    <div className="receipt__code">Hoá đơn #{o.code}</div>
                    <div className="muted">{formatDateTime(o.createdAt)}</div>
                  </div>
                  {cancelled ? <Badge tone="danger">Đã huỷ</Badge> : <Badge tone="success">Hoàn thành</Badge>}
                </div>
                {o.branch && (
                  <div className="receipt__branch">
                    <b>{o.branch.name}</b>
                    <div className="muted">{o.branch.address}</div>
                  </div>
                )}

                {items.length > 0 ? (
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th>Món</th>
                        <th className="num">SL</th>
                        <th className="num">Đơn giá</th>
                        <th className="num">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.id}>
                          <td>{it.name}</td>
                          <td className="num">{it.quantity}</td>
                          <td className="num">{formatMoney(it.price)}</td>
                          <td className="num">{formatMoney(it.price * it.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="muted receipt__noitems">Hoá đơn không có chi tiết món</div>
                )}

                <div className="receipt__totals">
                  <InfoRow label="Tạm tính" value={formatMoney(o.subtotal)} />
                  {o.discount > 0 && <InfoRow label="Giảm giá" value={`-${formatMoney(o.discount)}`} />}
                  {o.voucherDiscount > 0 && (
                    <InfoRow
                      label={o.usedVoucher ? `Voucher ${o.usedVoucher.code}` : "Voucher"}
                      value={`-${formatMoney(o.voucherDiscount)}`}
                    />
                  )}
                  <InfoRow label="Tổng thanh toán" value={formatMoney(o.total)} strong />
                  <InfoRow
                    label="Điểm tích luỹ"
                    value={
                      cancelled ? (
                        <s className="muted">+{formatNumber(o.pointsEarned)} điểm</s>
                      ) : (
                        <span className="text-success">+{formatNumber(o.pointsEarned)} điểm</span>
                      )
                    }
                  />
                </div>
                {o.usedVoucher && <div className="muted receipt__note">Đã áp dụng: {o.usedVoucher.voucher.title}</div>}
                {o.note && <div className="muted receipt__note">Ghi chú: {o.note}</div>}
                {cancelled && (
                  <div className="receipt__cancel">Hoá đơn đã huỷ – điểm tích luỹ đã được thu hồi và voucher (nếu có) đã được hoàn lại.</div>
                )}
              </div>
            </div>
          );
        }}
      </AsyncView>
    </AppPage>
  );
}
