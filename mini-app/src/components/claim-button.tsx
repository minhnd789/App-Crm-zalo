import { useState } from "react";
import { Button, Modal } from "zmp-ui";
import { api, type ClaimableVoucher, type CustomerVoucher } from "@/api";
import { useAuth } from "@/hooks/use-auth";
import { useNotify } from "@/hooks/use-notify";
import { formatNumber } from "@/utils/format";

/**
 * Nút "Nhận" (voucher miễn phí) hoặc "Đổi điểm" (có hộp thoại xác nhận).
 * Khi không đủ điều kiện, nút bị vô hiệu và hiển thị lý do từ backend.
 */
export function ClaimButton({
  voucher,
  onClaimed,
  size = "small",
  fullWidth,
}: {
  voucher: ClaimableVoucher;
  onClaimed?: (cv: CustomerVoucher) => void;
  size?: "small" | "medium" | "large";
  fullWidth?: boolean;
}) {
  const { me, refreshMe } = useAuth();
  const notify = useNotify();
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const isPoints = voucher.pointCost > 0;

  const claim = async () => {
    setConfirm(false);
    setLoading(true);
    try {
      const cv = await api.claimVoucher(voucher.id);
      notify.success(isPoints ? "Đổi điểm thành công! Voucher đã vào ví của bạn" : "Nhận voucher thành công!");
      await refreshMe();
      onClaimed?.(cv);
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (!voucher.canClaim) {
    return (
      <Button size={size} fullWidth={fullWidth} disabled variant="secondary" className="claim-btn claim-btn--disabled">
        {voucher.reason ?? "Không khả dụng"}
      </Button>
    );
  }

  return (
    <>
      <Button
        size={size}
        fullWidth={fullWidth}
        loading={loading}
        className="claim-btn"
        onClick={() => (isPoints ? setConfirm(true) : claim())}
      >
        {isPoints ? `Đổi ${formatNumber(voucher.pointCost)} điểm` : "Nhận ngay"}
      </Button>
      {isPoints && (
        <Modal
          visible={confirm}
          title="Xác nhận đổi điểm"
          onClose={() => setConfirm(false)}
          actions={[
            { text: "Huỷ", close: true },
            { text: "Đổi ngay", highLight: true, onClick: claim },
          ]}
        >
          <div className="modal-text">
            Dùng <b>{formatNumber(voucher.pointCost)} điểm</b> để đổi <b>{voucher.title}</b>?
            <br />
            Điểm hiện có: <b>{formatNumber(me?.points ?? 0)}</b> → còn lại{" "}
            <b>{formatNumber((me?.points ?? 0) - voucher.pointCost)}</b> điểm.
          </div>
        </Modal>
      )}
    </>
  );
}
