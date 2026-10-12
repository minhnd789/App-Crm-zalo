import { Button } from "zmp-ui";
import { AppPage } from "@/components/app-page";
import { AppIcon } from "@/components/icons";
import { ErrorState, Loading } from "@/components/states";
import { useAppData } from "@/hooks/use-app-data";
import { useNotify } from "@/hooks/use-notify";
import { splitLines } from "@/utils/format";
import { callPhone, openOAChat, resolveOaId } from "@/utils/zalo";

export default function RestaurantPage() {
  const { config, branches, loading, error, reload } = useAppData();
  const notify = useNotify();
  const brand = config?.brand;
  const oaId = resolveOaId(brand?.zaloOaId);

  return (
    <AppPage back title={brand?.name ?? "Thông tin nhà hàng"}>
      {loading ? (
        <Loading />
      ) : error || !config || !brand ? (
        <ErrorState message="Không tải được thông tin nhà hàng" onRetry={reload} />
      ) : (
        <div className="page-pad">
          <div className="restaurant-hero">
            <div className="restaurant-hero__logo">
              {brand.logoUrl ? <img src={brand.logoUrl} alt={brand.name} /> : <AppIcon name="utensils" size={30} />}
            </div>
            <div className="restaurant-hero__name">{brand.name}</div>
          </div>

          <div className="card">
            <h3 className="card__title">Giới thiệu</h3>
            {splitLines(brand.about).length ? (
              splitLines(brand.about).map((l, i) => (
                <p key={i} className="card__text">
                  {l}
                </p>
              ))
            ) : (
              <p className="card__text muted">Nhà hàng chưa cập nhật phần giới thiệu.</p>
            )}
          </div>

          <div className="card">
            <h3 className="card__title">Liên hệ</h3>
            {brand.hotline ? (
              <Button
                fullWidth
                prefixIcon={<AppIcon name="phone" size={18} />}
                onClick={() => callPhone(brand.hotline!)}
              >
                Gọi hotline {brand.hotline}
              </Button>
            ) : (
              <p className="card__text muted">Chưa có số hotline.</p>
            )}
            {oaId && (
              <div style={{ marginTop: 8 }}>
                <Button
                  fullWidth
                  variant="secondary"
                  prefixIcon={<AppIcon name="chat" size={18} />}
                  onClick={() => openOAChat(oaId).catch((e) => notify.error(e))}
                >
                  Chat với nhà hàng
                </Button>
              </div>
            )}
          </div>

          <h3 className="list-title">Các cơ sở</h3>
          <div className="list-gap">
            {branches.map((b) => (
              <div key={b.id} className="branch-card">
                {b.imageUrl && <img className="branch-card__img" src={b.imageUrl} alt={b.name} loading="lazy" />}
                <div className="branch-card__body">
                  <div className="branch-card__name">{b.name}</div>
                  <div className="branch-card__row">
                    <AppIcon name="pin" size={16} /> {b.address}
                  </div>
                  <div className="branch-card__row">
                    <AppIcon name="clock" size={16} /> {b.openTime} – {b.closeTime}
                  </div>
                  {b.phone && (
                    <button className="branch-card__phone" onClick={() => callPhone(b.phone!)}>
                      <AppIcon name="phone" size={16} /> {b.phone}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppPage>
  );
}
