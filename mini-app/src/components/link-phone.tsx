import { useState } from "react";
import { Button, Input, Modal } from "zmp-ui";
import { api } from "@/api";
import { useAuth } from "@/hooks/use-auth";
import { useNotify } from "@/hooks/use-notify";
import { requestPhonePayload } from "@/utils/zalo";

/** Nút "Liên kết số điện thoại": zmp-sdk getPhoneNumber() hoặc nhập tay khi giả lập */
export function LinkPhoneButton({
  size = "small",
  fullWidth,
  variant = "primary",
}: {
  size?: "small" | "medium" | "large";
  fullWidth?: boolean;
  variant?: "primary" | "secondary" | "tertiary";
}) {
  const { mock, applyMemberResponse } = useAuth();
  const notify = useNotify();
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [phone, setPhone] = useState("");

  const submit = async (body: Parameters<typeof api.linkPhone>[0]) => {
    setLoading(true);
    try {
      const merged = await applyMemberResponse(await api.linkPhone(body));
      setModal(false);
      notify.success(
        merged ? "Đã liên kết với tài khoản thành viên hiện có – điểm và hạng đã được gộp" : "Đã liên kết số điện thoại",
      );
    } catch (e) {
      notify.error(e);
    } finally {
      setLoading(false);
    }
  };

  const onClick = async () => {
    if (mock) {
      setModal(true);
      return;
    }
    setLoading(true);
    try {
      const payload = await requestPhonePayload();
      await submit(payload);
    } catch (e) {
      notify.error(e instanceof Error && e.message ? e : "Bạn chưa cho phép chia sẻ số điện thoại");
      setLoading(false);
    }
  };

  return (
    <>
      <Button size={size} fullWidth={fullWidth} variant={variant} loading={loading && !modal} onClick={onClick}>
        Liên kết số điện thoại
      </Button>
      <Modal
        visible={modal}
        title="Nhập số điện thoại"
        onClose={() => setModal(false)}
        actions={[
          { text: "Huỷ", close: true },
          {
            text: loading ? "Đang lưu..." : "Liên kết",
            highLight: true,
            disabled: loading || !phone.trim(),
            onClick: () => submit({ phone: phone.trim() }),
          },
        ]}
      >
        <div className="modal-text" style={{ marginBottom: 12 }}>
          Chế độ thử nghiệm: nhập số điện thoại thay cho quyền truy cập số điện thoại của Zalo.
        </div>
        <Input
          type="text"
          inputMode="tel"
          placeholder="VD: 0901234567"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </Modal>
    </>
  );
}
