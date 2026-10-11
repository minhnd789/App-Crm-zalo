import { useEffect, useState } from "react";
import { Button, DatePicker, Input, Select, useNavigate } from "zmp-ui";
import { api, type Gender } from "@/api";
import { AppPage } from "@/components/app-page";
import { LinkPhoneButton } from "@/components/link-phone";
import { InfoRow } from "@/components/section";
import { useAuth } from "@/hooks/use-auth";
import { useAppData } from "@/hooks/use-app-data";
import { useNotify } from "@/hooks/use-notify";
import { dayjs, formatDate, GENDER_LABEL } from "@/utils/format";

const { Option } = Select;

/** Ngày sinh từ API (UTC 00:00) → Date địa phương cùng ngày */
function birthdayToDate(b: string | null): Date | undefined {
  if (!b) return undefined;
  const d = dayjs.utc(b);
  return new Date(d.year(), d.month(), d.date());
}

export default function ProfilePage() {
  const { me, setMe } = useAuth();
  const notify = useNotify();
  const navigate = useNavigate();
  const [name, setName] = useState(me?.name ?? "");
  const [birthday, setBirthday] = useState<Date | undefined>(birthdayToDate(me?.birthday ?? null));
  const [gender, setGender] = useState<Gender | undefined>(me?.gender ?? undefined);
  const { branches } = useAppData();
  const [homeBranchId, setHomeBranchId] = useState<number | undefined>(me?.homeBranch?.id);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!me) return;
    setName(me.name);
    setBirthday(birthdayToDate(me.birthday));
    setGender(me.gender ?? undefined);
    setHomeBranchId(me.homeBranch?.id);
    // chỉ đồng bộ khi đổi tài khoản
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  if (!me) return null;

  const save = async () => {
    if (!name.trim()) {
      notify.error("Vui lòng nhập họ tên");
      return;
    }
    setSaving(true);
    try {
      let updated = await api.updateMe({
        name: name.trim(),
        birthday: birthday ? dayjs(birthday).format("YYYY-MM-DD") : null,
        gender: gender ?? null,
      });
      if (me.registered && homeBranchId && homeBranchId !== me.homeBranch?.id) {
        updated = await api.setHomeBranch(homeBranchId);
      }
      setMe(updated);
      notify.success("Đã lưu thông tin cá nhân");
      navigate(-1);
    } catch (e) {
      notify.error(e);
    } finally {
      setSaving(false);
    }
  };

  const today = new Date();

  return (
    <AppPage back title="Thông tin cá nhân">
      <div className="form form--padded">
        <div className="card">
          <div className="form-row">
            <Input label="Họ và tên" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="form-row">
            <DatePicker
              label="Ngày sinh"
              title="Chọn ngày sinh"
              placeholder="Chọn ngày sinh"
              key={`bday-${me.id}`}
              defaultValue={birthday ?? new Date(1995, 0, 1)}
              formatPickedValueDisplay={(d) => (birthday ? dayjs(d).format("DD/MM/YYYY") : "")}
              action={{ text: "Xong", close: true }}
              startDate={new Date(today.getFullYear() - 100, 0, 1)}
              endDate={today}
              columnsFormat="DD-MM-YYYY"
              dateFormat="dd/mm/yyyy"
              onChange={(d) => setBirthday(d)}
            />
            <div className="form-hint">Nhận quà sinh nhật từ nhà hàng trong tháng sinh nhật của bạn.</div>
          </div>
          <div className="form-row">
            <Select
              label="Giới tính"
              placeholder="Chọn giới tính"
              value={gender}
              closeOnSelect
              onChange={(v) => setGender(v as Gender)}
            >
              {(Object.keys(GENDER_LABEL) as Gender[]).map((g) => (
                <Option key={g} value={g} title={GENDER_LABEL[g]} />
              ))}
            </Select>
          </div>
          {me.registered && (
            <div className="form-row">
              <Select
                label="Cơ sở hay đến"
                placeholder="Chọn cơ sở"
                value={homeBranchId}
                closeOnSelect
                onChange={(v) => setHomeBranchId(Number(v))}
              >
                {branches.map((b) => (
                  <Option key={b.id} value={b.id} title={b.name} />
                ))}
              </Select>
              {(() => {
                const b = branches.find((x) => x.id === homeBranchId);
                return b ? <div className="form-hint">{b.address}</div> : null;
              })()}
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="card__title">Tài khoản</h3>
          <InfoRow label="Mã thành viên" value={me.memberCode} />
          <InfoRow label="Số điện thoại" value={me.phone ?? "Chưa liên kết"} />
          <InfoRow label="Ngày tham gia" value={formatDate(me.createdAt)} />
          <InfoRow label="Thành viên" value={me.registered ? `Từ ${formatDate(me.registeredAt)}` : "Chưa đăng ký"} />
          {!me.registered ? (
            <div style={{ marginTop: 12 }}>
              <Button fullWidth variant="secondary" onClick={() => navigate("/register?redirect=/account")}>
                Đăng ký thành viên
              </Button>
            </div>
          ) : (
            !me.phone && (
              <div style={{ marginTop: 12 }}>
                <LinkPhoneButton fullWidth variant="secondary" />
              </div>
            )
          )}
        </div>

        <div className="form-actions">
          <Button fullWidth size="large" loading={saving} onClick={save}>
            Lưu thay đổi
          </Button>
        </div>
      </div>
    </AppPage>
  );
}
