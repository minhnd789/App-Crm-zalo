import { useEffect, useMemo, useState } from "react";
import { Button, DatePicker, Input, Modal, Select, Tabs, useSearchParams } from "zmp-ui";
import { api, type Booking } from "@/api";
import { AppPage } from "@/components/app-page";
import { BookingStatusBadge } from "@/components/badge";
import { AppIcon } from "@/components/icons";
import { AsyncView, Empty, ErrorState, Loading, SkeletonList } from "@/components/states";
import { useAppData } from "@/hooks/use-app-data";
import { useAuth } from "@/hooks/use-auth";
import { useNotify } from "@/hooks/use-notify";
import { useRequest } from "@/hooks/use-request";
import { buildTimeSlots, isValidPhone, normalizePhone } from "@/utils/booking";
import { dayjs, formatBookingTime, formatDateTime } from "@/utils/format";

const { Option } = Select;

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="stepper">
      <button type="button" className="stepper__btn" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label="Bớt">
        <AppIcon name="minus" size={18} strokeWidth={2.4} />
      </button>
      <div className="stepper__value">
        {value} <span>khách</span>
      </div>
      <button type="button" className="stepper__btn" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label="Thêm">
        <AppIcon name="plus" size={18} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function BookingForm({ onBooked }: { onBooked: (b: Booking) => void }) {
  const { config, branches, loading, error, reload } = useAppData();
  const { me } = useAuth();
  const notify = useNotify();

  const [branchId, setBranchId] = useState<number | undefined>(undefined);
  const [date, setDate] = useState<Date>(() => dayjs().startOf("day").toDate());
  const [slot, setSlot] = useState<string | undefined>(undefined);
  const [partySize, setPartySize] = useState(2);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // Chọn sẵn chi nhánh đầu tiên
  useEffect(() => {
    if (branchId === undefined && branches.length) setBranchId(branches[0].id);
  }, [branches, branchId]);

  // Điền sẵn tên & SĐT từ hồ sơ thành viên
  useEffect(() => {
    if (!me) return;
    setName((n) => n || me.name || "");
    setPhone((p) => p || me.phone || "");
  }, [me]);

  // Cập nhật mốc thời gian mỗi phút để ẩn khung giờ đã qua
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const branch = branches.find((b) => b.id === branchId);
  const minAdvance = config?.bookingMinAdvanceMinutes ?? 30;
  const maxDays = config?.bookingMaxDays ?? 30;
  const maxParty = config?.maxPartySize ?? 20;

  const slots = useMemo(
    () => (branch ? buildTimeSlots(date, branch, minAdvance, maxDays, now) : []),
    [branch, date, minAdvance, maxDays, now],
  );

  // Bỏ chọn giờ nếu không còn hợp lệ
  useEffect(() => {
    if (slot && !slots.some((s) => s.value === slot)) setSlot(undefined);
  }, [slots, slot]);

  if (loading) return <Loading />;
  if (error || !config) return <ErrorState message="Không tải được thông tin chi nhánh" onRetry={reload} />;
  if (!branches.length) return <Empty icon="pin" title="Chưa có chi nhánh nhận đặt bàn" />;

  const phoneError = touched && !isValidPhone(phone) ? "Số điện thoại không hợp lệ" : undefined;
  const nameError = touched && !name.trim() ? "Vui lòng nhập tên người đặt" : undefined;
  const slotError = touched && !slot ? "Vui lòng chọn giờ" : undefined;

  const submit = async () => {
    setTouched(true);
    if (!branch || !slot || !name.trim() || !isValidPhone(phone)) {
      notify.error("Vui lòng điền đầy đủ thông tin đặt bàn");
      return;
    }
    setSubmitting(true);
    try {
      const booking = await api.createBooking({
        branchId: branch.id,
        bookingTime: slot,
        partySize,
        contactName: name.trim(),
        contactPhone: normalizePhone(phone),
        note: note.trim() || undefined,
      });
      notify.success(`Đặt bàn thành công! Mã đặt bàn: ${booking.code}`);
      setSlot(undefined);
      setNote("");
      setTouched(false);
      onBooked(booking);
    } catch (e) {
      notify.error(e);
    } finally {
      setSubmitting(false);
    }
  };

  const today = dayjs().startOf("day");

  return (
    <div className="form">
      <div className="card">
        <Select
          label="Chi nhánh"
          placeholder="Chọn chi nhánh"
          value={branchId}
          closeOnSelect
          onChange={(v) => setBranchId(Number(v))}
        >
          {branches.map((b) => (
            <Option key={b.id} value={b.id} title={b.name} />
          ))}
        </Select>
        {branch && (
          <div className="branch-info">
            <div>
              <AppIcon name="pin" size={16} /> {branch.address}
            </div>
            <div>
              <AppIcon name="clock" size={16} /> Giờ mở cửa: {branch.openTime} – {branch.closeTime}
            </div>
            {branch.phone && (
              <div>
                <AppIcon name="phone" size={16} /> {branch.phone}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <div className="form-row">
          <DatePicker
            label="Ngày"
            title="Chọn ngày đặt bàn"
            key={`date-${maxDays}`}
            defaultValue={date}
            action={{ text: "Xong", close: true }}
            startDate={today.toDate()}
            endDate={today.add(maxDays, "day").toDate()}
            columnsFormat="DD-MM-YYYY"
            dateFormat="dd/mm/yyyy"
            formatPickedValueDisplay={(d) => {
              const dd = dayjs(d);
              const w = dd.format("dddd");
              return `${w.charAt(0).toUpperCase()}${w.slice(1)}, ${dd.format("DD/MM/YYYY")}`;
            }}
            onChange={(d) => setDate(dayjs(d).startOf("day").toDate())}
          />
        </div>
        <div className="form-row">
          <Select
            label="Giờ"
            placeholder={slots.length ? "Chọn giờ" : "Không còn khung giờ"}
            value={slot}
            closeOnSelect
            disabled={!slots.length}
            status={slotError ? "error" : undefined}
            errorText={slotError}
            onChange={(v) => setSlot(String(v))}
          >
            {slots.map((s) => (
              <Option key={s.value} value={s.value} title={s.label} />
            ))}
          </Select>
          {!slots.length && (
            <div className="form-hint form-hint--warn">
              Ngày này không còn khung giờ trống (cần đặt trước ít nhất {minAdvance} phút). Vui lòng chọn ngày khác.
            </div>
          )}
        </div>
        <div className="form-row">
          <div className="form-label">Số khách</div>
          <Stepper value={partySize} min={1} max={maxParty} onChange={setPartySize} />
          <div className="form-hint">Tối đa {maxParty} khách. Đoàn đông hơn vui lòng gọi hotline.</div>
        </div>
      </div>

      <div className="card">
        <div className="form-row">
          <Input
            label="Tên người đặt"
            placeholder="Nhập tên"
            value={name}
            maxLength={100}
            status={nameError ? "error" : undefined}
            errorText={nameError}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="form-row">
          <Input
            label="Số điện thoại liên hệ"
            placeholder="VD: 0901234567"
            inputMode="tel"
            value={phone}
            status={phoneError ? "error" : undefined}
            errorText={phoneError}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="form-row">
          <Input.TextArea
            label="Ghi chú"
            placeholder="Yêu cầu đặc biệt: ghế trẻ em, phòng riêng, dịp sinh nhật..."
            value={note}
            maxLength={500}
            showCount
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      <div className="form-actions">
        <Button fullWidth size="large" loading={submitting} onClick={submit}>
          Xác nhận đặt bàn
        </Button>
        <div className="form-hint form-hint--center">Nhà hàng sẽ xác nhận lịch đặt bàn và thông báo cho bạn qua Zalo.</div>
      </div>
    </div>
  );
}

function BookingCard({ booking, onCancel }: { booking: Booking; onCancel?: (b: Booking) => void }) {
  const cancellable = booking.status === "PENDING" || booking.status === "CONFIRMED";
  return (
    <div className="booking-card">
      <div className="booking-card__head">
        <div className="booking-card__code">#{booking.code}</div>
        <BookingStatusBadge status={booking.status} />
      </div>
      <div className="booking-card__time">{formatBookingTime(booking.bookingTime)}</div>
      <div className="booking-card__rows">
        <div>
          <AppIcon name="pin" size={16} /> {booking.branch?.name}
        </div>
        <div>
          <AppIcon name="users" size={16} /> {booking.partySize} khách · {booking.contactName} · {booking.contactPhone}
        </div>
        {booking.note && (
          <div>
            <AppIcon name="edit" size={16} /> {booking.note}
          </div>
        )}
        {booking.adminNote && <div className="booking-card__admin">Nhà hàng: {booking.adminNote}</div>}
      </div>
      <div className="booking-card__foot">
        <span className="muted">Đặt lúc {formatDateTime(booking.createdAt)}</span>
        {cancellable && onCancel && (
          <Button size="small" variant="tertiary" type="danger" onClick={() => onCancel(booking)}>
            Huỷ lịch
          </Button>
        )}
      </div>
    </div>
  );
}

function MyBookings({ version }: { version: number }) {
  const notify = useNotify();
  const upcoming = useRequest(() => api.getBookings("upcoming"), [version]);
  const past = useRequest(() => api.getBookings("past"), [version]);
  const [toCancel, setToCancel] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const doCancel = async () => {
    if (!toCancel) return;
    setCancelling(true);
    try {
      await api.cancelBooking(toCancel.id);
      notify.success("Đã huỷ lịch đặt bàn");
      setToCancel(null);
      await Promise.all([upcoming.reload(), past.reload()]);
    } catch (e) {
      notify.error(e);
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <h3 className="list-title">Sắp tới</h3>
      <AsyncView
        {...upcoming}
        onRetry={upcoming.reload}
        skeleton={<SkeletonList count={2} height={140} />}
        isEmpty={(d) => d.length === 0}
        empty={<Empty icon="calendar" title="Bạn chưa có lịch đặt bàn sắp tới" />}
      >
        {(list) => (
          <div className="list-gap">
            {list.map((b) => (
              <BookingCard key={b.id} booking={b} onCancel={setToCancel} />
            ))}
          </div>
        )}
      </AsyncView>

      <h3 className="list-title">Đã qua</h3>
      <AsyncView
        {...past}
        onRetry={past.reload}
        skeleton={<SkeletonList count={2} height={140} />}
        isEmpty={(d) => d.length === 0}
        empty={<Empty icon="clock" title="Chưa có lịch sử đặt bàn" />}
      >
        {(list) => (
          <div className="list-gap">
            {list.map((b) => (
              <BookingCard key={b.id} booking={b} onCancel={setToCancel} />
            ))}
          </div>
        )}
      </AsyncView>

      <Modal
        visible={!!toCancel}
        title="Huỷ lịch đặt bàn?"
        onClose={() => !cancelling && setToCancel(null)}
        actions={[
          { text: "Không", close: true, disabled: cancelling },
          { text: cancelling ? "Đang huỷ..." : "Huỷ lịch", danger: true, disabled: cancelling, onClick: doCancel },
        ]}
      >
        {toCancel && (
          <div className="modal-text">
            Bạn chắc chắn muốn huỷ lịch <b>#{toCancel.code}</b> lúc <b>{formatBookingTime(toCancel.bookingTime)}</b> tại{" "}
            {toCancel.branch?.name}?
          </div>
        )}
      </Modal>
    </>
  );
}

export default function BookingPage() {
  const [params, setParams] = useSearchParams();
  const active = params.get("tab") === "mine" ? "mine" : "new";
  const [version, setVersion] = useState(0);

  return (
    <AppPage tab title="Đặt bàn">
      <Tabs
        id="booking-tabs"
        className="app-tabs"
        activeKey={active}
        onChange={(key) => setParams({ tab: key }, { replace: true })}
      >
        <Tabs.Tab key="new" label="Đặt bàn mới">
          <div className="tab-body">
            <BookingForm
              onBooked={() => {
                setVersion((v) => v + 1);
                setParams({ tab: "mine" }, { replace: true });
              }}
            />
          </div>
        </Tabs.Tab>
        <Tabs.Tab key="mine" label="Lịch của tôi">
          <div className="tab-body">{active === "mine" && <MyBookings version={version} />}</div>
        </Tabs.Tab>
      </Tabs>
    </AppPage>
  );
}
