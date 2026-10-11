import { useEffect, useState } from "react";
import { Button, DatePicker, Input, useNavigate, useSearchParams } from "zmp-ui";
import { api, type RegisterInput } from "@/api";
import { AppPage } from "@/components/app-page";
import { AppIcon } from "@/components/icons";
import { ErrorState, Loading } from "@/components/states";
import { useAppData } from "@/hooks/use-app-data";
import { useAuth } from "@/hooks/use-auth";
import { useNotify } from "@/hooks/use-notify";
import { isValidPhone, normalizePhone } from "@/utils/booking";
import { dayjs, formatNumber } from "@/utils/format";
import { requestPhonePayload } from "@/utils/zalo";

/** Vị trí bắt đầu của bộ chọn ngày sinh */
const BIRTHDAY_START = new Date(1995, 0, 1);

const BENEFITS = [
  { icon: "gift" as const, text: "Nhận quà điểm chào mừng ngay khi đăng ký" },
  { icon: "coin" as const, text: "Tích điểm mỗi lần dùng bữa, đổi voucher hấp dẫn" },
  { icon: "cake" as const, text: "Ưu đãi riêng trong tháng sinh nhật" },
  { icon: "calendar" as const, text: "Đặt bàn nhanh, nhận xác nhận qua Zalo" },
];

/** Đăng ký thành viên: tên & SĐT theo Zalo, khách nhập thêm ngày sinh và chọn cơ sở hay đến */
export default function RegisterPage() {
  const { me, mock, applyMemberResponse } = useAuth();
  const { config, branches, loading, error, reload } = useAppData();
  const notify = useNotify();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const redirect = params.get("redirect") || "/";

  const [name, setName] = useState(me?.name ?? "");
  const [birthday, setBirthday] = useState<Date | undefined>(undefined);
  const [branchId, setBranchId] = useState<number | undefined>(me?.homeBranch?.id);
  const [mockPhone, setMockPhone] = useState(me?.phone ?? "");
  const [phoneToken, setPhoneToken] = useState<{ token: string; accessToken: string } | null>(null);
  const [gettingPhone, setGettingPhone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  // Đã đăng ký rồi (vd mở lại từ lịch sử) → về trang trước
  useEffect(() => {
    if (me?.registered) navigate(redirect, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Chọn sẵn cơ sở nếu thương hiệu chỉ có 1 cơ sở
  useEffect(() => {
    if (branchId === undefined && branches.length === 1) setBranchId(branches[0].id);
  }, [branches, branchId]);

  if (!me) return null;
  const brandName = config?.brand.name ?? "nhà hàng";
  const hasPhone = !!me.phone;

  const getZaloPhone = async () => {
    setGettingPhone(true);
    try {
      setPhoneToken(await requestPhonePayload());
    } catch {
      notify.error("Bạn cần cho phép chia sẻ số điện thoại Zalo để đăng ký thành viên");
    } finally {
      setGettingPhone(false);
    }
  };

  const phoneReady = hasPhone || (mock ? isValidPhone(mockPhone) : !!phoneToken);
  const errors = {
    name: !name.trim() ? "Vui lòng nhập họ tên" : undefined,
    phone: !phoneReady ? (mock ? "Số điện thoại không hợp lệ" : "Vui lòng lấy số điện thoại từ Zalo") : undefined,
    birthday: !birthday ? "Vui lòng chọn ngày sinh" : undefined,
    branch: !branchId ? "Vui lòng chọn cơ sở bạn hay đến" : undefined,
  };

  const submit = async () => {
    setTouched(true);
    if (errors.name || errors.phone || errors.birthday || errors.branch) {
      notify.error(errors.name || errors.phone || errors.birthday || errors.branch || "");
      return;
    }
    const body: RegisterInput = {
      name: name.trim(),
      birthday: dayjs(birthday).format("YYYY-MM-DD"),
      branchId: branchId!,
    };
    if (mock) {
      if (!hasPhone || normalizePhone(mockPhone) !== me.phone) body.phone = normalizePhone(mockPhone);
    } else if (phoneToken) {
      body.token = phoneToken.token;
      body.accessToken = phoneToken.accessToken;
    }
    const before = me.points;
    setSubmitting(true);
    try {
      const res = await api.register(body);
      const merged = await applyMemberResponse(res);
      const gained = res.points - before;
      const bonus = gained > 0 ? `, bạn được tặng ${formatNumber(gained)} điểm` : "";
      notify.success(
        merged
          ? `Đã liên kết với tài khoản thành viên hiện có – điểm và hạng đã được gộp${bonus ? ` (tặng ${formatNumber(gained)} điểm)` : ""}`
          : `Đăng ký thành công${bonus}`,
      );
      navigate(redirect, { replace: true });
    } catch (e) {
      notify.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const yesterday = dayjs().subtract(1, "day").toDate();

  return (
    <AppPage back title="Đăng ký thành viên">
      <div className="register">
        <div className="register-hero">
          <div className="register-hero__logo">
            {config?.brand.logoUrl ? <img src={config.brand.logoUrl} alt="" /> : <AppIcon name="crown" size={28} />}
          </div>
          <h1 className="register-hero__title">Đăng ký thành viên {brandName}</h1>
          <ul className="register-hero__benefits">
            {BENEFITS.map((b, i) =>
              i === 0 && config?.welcomePoints ? { ...b, text: `Tặng ${formatNumber(config.welcomePoints)} điểm chào mừng ngay khi đăng ký` } : b,
            ).map((b) => (
              <li key={b.text}>
                <AppIcon name={b.icon} size={18} />
                {b.text}
              </li>
            ))}
          </ul>
        </div>

        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message="Không tải được danh sách cơ sở" onRetry={reload} />
        ) : (
          <div className="form form--padded">
            <div className="card">
              <div className="form-row">
                <Input
                  label="Họ và tên"
                  placeholder="Nhập họ tên"
                  value={name}
                  maxLength={100}
                  status={touched && errors.name ? "error" : undefined}
                  errorText={touched ? errors.name : undefined}
                  onChange={(e) => setName(e.target.value)}
                />
                <div className="form-hint">Lấy theo tên Zalo, bạn có thể sửa lại.</div>
              </div>

              <div className="form-row">
                <div className="form-label">Số điện thoại</div>
                {hasPhone ? (
                  <div className="phone-box phone-box--ok">
                    <AppIcon name="check" size={18} strokeWidth={2.4} />
                    <span>{me.phone}</span>
                  </div>
                ) : mock ? (
                  <>
                    <Input
                      placeholder="VD: 0901234567"
                      inputMode="tel"
                      value={mockPhone}
                      status={touched && errors.phone ? "error" : undefined}
                      errorText={touched ? errors.phone : undefined}
                      onChange={(e) => setMockPhone(e.target.value)}
                    />
                    <div className="form-hint">Chế độ thử nghiệm: nhập số thay cho quyền số điện thoại Zalo.</div>
                  </>
                ) : phoneToken ? (
                  <div className="phone-box phone-box--ok">
                    <AppIcon name="check" size={18} strokeWidth={2.4} />
                    <span>Đã lấy số điện thoại từ Zalo</span>
                  </div>
                ) : (
                  <>
                    <Button
                      fullWidth
                      variant="secondary"
                      loading={gettingPhone}
                      prefixIcon={<AppIcon name="phone" size={18} />}
                      onClick={getZaloPhone}
                    >
                      Lấy số điện thoại từ Zalo
                    </Button>
                    {touched && errors.phone && <div className="form-hint form-hint--warn">{errors.phone}</div>}
                  </>
                )}
              </div>

              <div className="form-row">
                <DatePicker
                  label="Ngày sinh"
                  title="Chọn ngày sinh"
                  placeholder="Chọn ngày sinh"
                  // zmp-ui Picker chỉ ghi nhận thay đổi khi cả 3 cột đều có giá trị, nên luôn đặt sẵn vị trí cuộn
                  // (01/01/1995) nhưng chỉ hiển thị khi khách đã thực sự chọn ngày.
                  defaultValue={birthday ?? BIRTHDAY_START}
                  formatPickedValueDisplay={(d) => (birthday ? dayjs(d).format("DD/MM/YYYY") : "")}
                  startDate={new Date(new Date().getFullYear() - 100, 0, 1)}
                  endDate={yesterday}
                  columnsFormat="DD-MM-YYYY"
                  dateFormat="dd/mm/yyyy"
                  action={{ text: "Xong", close: true }}
                  status={touched && errors.birthday ? "error" : undefined}
                  errorText={touched ? errors.birthday : undefined}
                  onChange={(d) => setBirthday(d)}
                />
              </div>
            </div>

            <div className="card">
              <h3 className="card__title">Cơ sở bạn hay đến</h3>
              <div className="branch-options" role="radiogroup">
                {branches.map((b) => {
                  const active = b.id === branchId;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      className={`branch-option ${active ? "branch-option--active" : ""}`}
                      onClick={() => setBranchId(b.id)}
                    >
                      <span className="branch-option__radio">{active && <AppIcon name="check" size={14} strokeWidth={3} />}</span>
                      <span className="branch-option__text">
                        <span className="branch-option__name">{b.name}</span>
                        <span className="branch-option__addr">{b.address}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {touched && errors.branch && <div className="form-hint form-hint--warn">{errors.branch}</div>}
            </div>

            <div className="form-actions">
              <Button fullWidth size="large" loading={submitting} onClick={submit}>
                Đăng ký thành viên
              </Button>
              <div className="form-hint form-hint--center">
                Bằng việc đăng ký, bạn đồng ý để {brandName} lưu họ tên, số điện thoại, ngày sinh và cơ sở bạn chọn nhằm tích
                điểm, chăm sóc khách hàng và gửi ưu đãi qua Zalo.
              </div>
              <button className="link-btn" onClick={() => navigate("/", { replace: true })}>
                Để sau
              </button>
            </div>
          </div>
        )}
      </div>
    </AppPage>
  );
}
