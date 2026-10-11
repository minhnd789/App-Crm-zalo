import React from "react";
import type { BookingStatus } from "@/api/types";
import { BOOKING_STATUS_LABEL, BOOKING_STATUS_TONE, type BadgeTone } from "@/utils/format";

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: React.ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={BOOKING_STATUS_TONE[status]}>{BOOKING_STATUS_LABEL[status]}</Badge>;
}
