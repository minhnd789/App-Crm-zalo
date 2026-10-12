import { Sheet } from "zmp-ui";
import { QRCodeSVG } from "qrcode.react";
import type { Me } from "@/api/types";

/** Sheet hiển thị mã QR thành viên để nhân viên quét tích điểm */
export function MemberQRSheet({ me, visible, onClose }: { me: Me; visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} autoHeight mask handler swipeToClose title="Mã thành viên">
      <div className="qr-sheet">
        <div className="qr-sheet__name">{me.name}</div>
        {me.tier && (
          <div className="qr-sheet__tier" style={{ color: me.tier.color }}>
            Hạng {me.tier.name}
          </div>
        )}
        <div className="qr-box">
          <QRCodeSVG value={me.memberCode} size={220} level="M" marginSize={0} fgColor="#1c1917" />
        </div>
        <div className="qr-sheet__code">{me.memberCode}</div>
        <div className="qr-sheet__hint">Đưa mã này cho nhân viên để tích điểm</div>
      </div>
    </Sheet>
  );
}
