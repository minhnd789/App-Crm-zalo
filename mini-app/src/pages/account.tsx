import { useState } from "react";
import { Avatar, Button, useNavigate } from "zmp-ui";
import { api } from "@/api";
import { AppPage } from "@/components/app-page";
import { Badge } from "@/components/badge";
import { AppIcon } from "@/components/icons";
import { LinkPhoneButton } from "@/components/link-phone";
import { MemberQRSheet } from "@/components/member-qr-sheet";
import { MenuItem } from "@/components/section";
import { useAuth } from "@/hooks/use-auth";
import { useNotify } from "@/hooks/use-notify";
import { tierGradient } from "@/utils/color";
import { OA_ID } from "@/utils/env";
import { formatNumber, initials } from "@/utils/format";
import { followOA, openOAChat } from "@/utils/zalo";

export default function AccountPage() {
  const navigate = useNavigate();
  const { me, setMe, mock } = useAuth();
  const notify = useNotify();
  const [following, setFollowing] = useState(false);
  const [showQR, setShowQR] = useState(false);

  if (!me) return null;

  const onFollow = async () => {
    setFollowing(true);
    try {
      await followOA();
      const updated = await api.updateMe({ followedOA: true });
      setMe(updated);
      notify.success("Cảm ơn bạn đã quan tâm nhà hàng!");
    } catch (e) {
      notify.error(e instanceof Error && e.message ? e : "Chưa quan tâm được Official Account");
    } finally {
      setFollowing(false);
    }
  };

  const onChat = async () => {
    try {
      await openOAChat();
    } catch (e) {
      notify.error(e);
    }
  };

  return (
    <AppPage tab title="Tài khoản">
      <div className="profile-head" style={{ background: tierGradient(me.tier?.color) }}>
        <Avatar size={64} src={me.avatar ?? undefined} className="profile-head__avatar">
          {initials(me.name)}
        </Avatar>
        <div className="profile-head__info">
          <div className="profile-head__name">{me.name}</div>
          <div className="profile-head__phone">
            {me.phone ? (
              <>
                <AppIcon name="phone" size={14} /> {me.phone}
              </>
            ) : (
              "Chưa liên kết số điện thoại"
            )}
          </div>
          <div className="profile-head__tier">
            <AppIcon name="crown" size={14} /> Hạng {me.tier?.name ?? "Thành viên"} · {formatNumber(me.points)} điểm
          </div>
        </div>
        <button className="profile-head__qr" onClick={() => setShowQR(true)} aria-label="Mã QR thành viên">
          <AppIcon name="qr" size={26} />
        </button>
      </div>

      {!me.phone && (
        <div className="card card--inline">
          <div className="card__text">Liên kết số điện thoại để tích điểm tại quầy và nhận thông báo đặt bàn.</div>
          <LinkPhoneButton fullWidth />
        </div>
      )}

      <div className="menu">
        <MenuItem
          icon={<AppIcon name="user" />}
          label="Thông tin cá nhân"
          description="Tên, ngày sinh, giới tính"
          onClick={() => navigate("/account/profile")}
        />
        <MenuItem
          icon={<AppIcon name="chart" />}
          iconColor="#15803D"
          label="Lịch sử tích điểm"
          description={`${formatNumber(me.points)} điểm hiện có`}
          onClick={() => navigate("/account/points")}
        />
        <MenuItem
          icon={<AppIcon name="receipt" />}
          iconColor="#0F766E"
          label="Lịch sử ăn uống"
          description={`${me.visitCount} lần ghé thăm`}
          onClick={() => navigate("/orders")}
        />
        <MenuItem
          icon={<AppIcon name="crown" />}
          iconColor="#B45309"
          label="Hạng thành viên"
          description={me.nextTier ? `Còn ${formatNumber(me.pointsToNextTier)} điểm lên ${me.nextTier.name}` : "Hạng cao nhất"}
          onClick={() => navigate("/tiers")}
        />
      </div>

      <div className="menu">
        <MenuItem
          icon={<AppIcon name="heart" />}
          iconColor="#BE123C"
          label="Quan tâm Official Account"
          description="Nhận thông báo ưu đãi & xác nhận đặt bàn qua Zalo"
          right={
            me.followedOA ? (
              <Badge tone="success">Đã quan tâm</Badge>
            ) : (
              <Button size="small" loading={following} onClick={onFollow}>
                Quan tâm
              </Button>
            )
          }
        />
        {(OA_ID || !mock) && (
          <MenuItem
            icon={<AppIcon name="chat" />}
            iconColor="#2563EB"
            label="Chat với nhà hàng"
            onClick={onChat}
          />
        )}
        <MenuItem
          icon={<AppIcon name="info" />}
          iconColor="#57534E"
          label="Thông tin nhà hàng"
          description="Hotline, giới thiệu, chi nhánh"
          onClick={() => navigate("/restaurant")}
        />
      </div>

      {mock && <div className="dev-note">Chế độ thử nghiệm (giả lập Zalo)</div>}

      <MemberQRSheet me={me} visible={showQR} onClose={() => setShowQR(false)} />
    </AppPage>
  );
}
