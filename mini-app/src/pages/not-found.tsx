import { Button, useNavigate } from "zmp-ui";
import { AppPage } from "@/components/app-page";
import { Empty } from "@/components/states";

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <AppPage back title="Không tìm thấy">
      <Empty
        icon="info"
        title="Trang không tồn tại"
        description="Đường dẫn có thể đã thay đổi hoặc nội dung đã bị gỡ."
        action={
          <Button size="small" onClick={() => navigate("/", { replace: true })}>
            Về trang chủ
          </Button>
        }
      />
    </AppPage>
  );
}
