import { useCallback } from "react";
import { useNavigate } from "zmp-ui";
import { useAuth } from "./use-auth";
import { useNotify } from "./use-notify";

/** Đường dẫn trang đăng ký, kèm trang quay lại sau khi đăng ký xong */
export function registerPath(redirect?: string) {
  return redirect ? `/register?redirect=${encodeURIComponent(redirect)}` : "/register";
}

/**
 * Chặn tính năng chỉ dành cho thành viên (đặt bàn, nhận/đổi voucher).
 * Trả về true nếu đã đăng ký; nếu chưa → mở trang đăng ký và trả về false.
 */
export function useRequireMember() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const notify = useNotify();
  return useCallback(
    (redirect?: string, options?: { replace?: boolean; silent?: boolean }) => {
      if (me?.registered) return true;
      if (!options?.silent) notify.info("Vui lòng đăng ký thành viên để sử dụng tính năng này");
      navigate(registerPath(redirect), { replace: options?.replace });
      return false;
    },
    [me?.registered, navigate, notify],
  );
}
