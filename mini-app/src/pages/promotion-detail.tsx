import { Button, useNavigate, useParams } from "zmp-ui";
import { api } from "@/api";
import { AppPage } from "@/components/app-page";
import { AppIcon } from "@/components/icons";
import { PromotionImage, promotionPeriod } from "@/components/promotion-card";
import { AsyncView, Loading } from "@/components/states";
import { useRequest } from "@/hooks/use-request";
import { splitLines } from "@/utils/format";

export default function PromotionDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const req = useRequest(() => api.getPromotion(id!), [id]);

  return (
    <AppPage back title="Chi tiết ưu đãi">
      <AsyncView {...req} onRetry={req.reload} skeleton={<Loading />}>
        {(p) => (
          <div className="detail">
            <PromotionImage src={p.imageUrl} alt={p.title} className="detail__cover" />
            <div className="detail__card">
              <h1 className="detail__title">{p.title}</h1>
              <div className="detail__date">
                <AppIcon name="calendar" size={16} />
                {promotionPeriod(p)}
              </div>
              {p.summary && <p className="detail__summary">{p.summary}</p>}
              <div className="detail__content">
                {splitLines(p.content).map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </div>
            <div className="sticky-cta">
              <Button fullWidth onClick={() => navigate("/booking")}>
                Đặt bàn ngay
              </Button>
            </div>
          </div>
        )}
      </AsyncView>
    </AppPage>
  );
}
