"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Phone, Receipt, User, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { buildHourAxis } from "@/lib/booking-grid";
import type { Court } from "../types";
import type { CustomerKind } from "../customers/types";
import type { OwnerBooking } from "./types";

interface QuickBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  date: string;
  courts: Court[];
  initialCourtId?: string;
  initialHour?: string;
  maxDurationHours?: number;
  onCreated: (booking: OwnerBooking) => void;
  prefillCustomer?: { kind: CustomerKind; id: string; fullName: string; phone: string };
  editableDate?: boolean;
  venues?: { id: string; name: string }[];
  onVenueChange?: (venueId: string) => void;
}

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

function addHours(hour: string, hours: number): string {
  const [h, m] = hour.split(":").map(Number);
  const total = h * 60 + m + hours * 60;
  const hh = Math.floor(total / 60).toString().padStart(2, "0");
  const mm = (total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

export function QuickBookDialog({
  open,
  onOpenChange,
  venueId,
  date,
  courts,
  initialCourtId,
  initialHour,
  maxDurationHours,
  onCreated,
  prefillCustomer,
  editableDate,
  venues,
  onVenueChange,
}: QuickBookDialogProps) {
  const isPrefilled = Boolean(initialCourtId && initialHour);
  const activeCourts = courts.filter((c) => c.status === "active");
  const [courtId, setCourtId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(1);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [bookingDate, setBookingDate] = useState(date);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const resolvedCourtId = initialCourtId ?? activeCourts[0]?.id ?? "";
    setCourtId(resolvedCourtId);
    const resolvedCourt = activeCourts.find((c) => c.id === resolvedCourtId);
    const defaultHour = resolvedCourt
      ? buildHourAxis([
          {
            id: resolvedCourt.id,
            status: resolvedCourt.status,
            openTime: resolvedCourt.openTime,
            closeTime: resolvedCourt.closeTime,
          },
        ])[0]
      : undefined;
    setStartTime(initialHour ?? defaultHour ?? "");
    setDuration(Math.min(2, maxDurationHours ?? 8));
    setBookingDate(date);
    setFullName(prefillCustomer?.fullName ?? "");
    setPhone(prefillCustomer?.phone ?? "");
    setNote("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCourtId, initialHour, maxDurationHours, date, prefillCustomer]);

  // standalone (customers screen): when the selected venue's courts change,
  // re-seed the court and its first start-time. Gated to editableDate so the
  // calendar's QuickBookDialog is unaffected.
  useEffect(() => {
    if (!open || !editableDate) return;
    const first = activeCourts[0];
    setCourtId(first?.id ?? "");
    setStartTime(
      first
        ? buildHourAxis([
            { id: first.id, status: first.status, openTime: first.openTime, closeTime: first.closeTime },
          ])[0] ?? ""
        : "",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  const selectedCourt = activeCourts.find((c) => c.id === courtId);
  const startTimeOptions = selectedCourt
    ? buildHourAxis([
        {
          id: selectedCourt.id,
          status: selectedCourt.status,
          openTime: selectedCourt.openTime,
          closeTime: selectedCourt.closeTime,
        },
      ])
    : [];
  const endTime = startTime ? addHours(startTime, duration) : "";
  const estimatedTotal = selectedCourt ? selectedCourt.pricePerHour * duration : 0;
  const maxDuration = maxDurationHours ?? 8;
  const durationOptions = Array.from({ length: maxDuration }, (_, i) => i + 1);

  async function handleSubmit() {
    if (!courtId || !startTime || !fullName.trim() || !phone.trim()) {
      toast.error("Vui lòng nhập đủ thông tin bắt buộc");
      return;
    }
    setSubmitting(true);
    const customerPayload = prefillCustomer
      ? prefillCustomer.kind === "registered"
        ? { customerId: prefillCustomer.id }
        : { customerContactId: prefillCustomer.id }
      : { newCustomer: { fullName: fullName.trim(), phone: phone.trim() } };

    const response = await fetch(`/api/venues/mine/${venueId}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courtId,
        date: bookingDate,
        startTime,
        endTime,
        note: note.trim() || undefined,
        ...customerPayload,
      }),
    });
    const data = await response.json().catch(() => null);
    setSubmitting(false);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã tạo lịch đặt sân");
    onCreated(data as OwnerBooking);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-gradient-to-r from-emerald-600 to-green-400 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-white">
            <Zap className="size-5 fill-white text-white" />
            {isPrefilled && selectedCourt ? `${selectedCourt.name} – ${startTime}` : "Đặt sân nhanh"}
          </DialogTitle>
          <DialogClose
            className="text-white/80 outline-none hover:text-white"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </DialogClose>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="qb-name">
                Tên khách hàng <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
                <User className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  id="qb-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={Boolean(prefillCustomer)}
                  placeholder="Nguyễn Văn A"
                  className="h-9 border-0 px-0 focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qb-phone">
                Số điện thoại <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
                <Phone className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  id="qb-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={Boolean(prefillCustomer)}
                  placeholder="0901 234 567"
                  className="h-9 border-0 px-0 focus-visible:ring-0"
                />
              </div>
            </div>
          </div>

          {editableDate && venues && venues.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="qb-venue">Chi nhánh</Label>
              <select
                id="qb-venue"
                value={venueId}
                onChange={(e) => onVenueChange?.(e.target.value)}
                className={SELECT_CLASS}
              >
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="qb-court">
              Sân <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-2.5 flex -translate-y-1/2 items-center">
                <span className="size-2 rounded-full bg-pink-500" />
              </span>
              <select
                id="qb-court"
                value={courtId}
                onChange={(e) => {
                  const newCourtId = e.target.value;
                  setCourtId(newCourtId);
                  const newCourt = activeCourts.find((c) => c.id === newCourtId);
                  const hours = newCourt
                    ? buildHourAxis([
                        {
                          id: newCourt.id,
                          status: newCourt.status,
                          openTime: newCourt.openTime,
                          closeTime: newCourt.closeTime,
                        },
                      ])
                    : [];
                  setStartTime(hours[0] ?? "");
                }}
                disabled={isPrefilled}
                className={`${SELECT_CLASS} pl-6`}
              >
                {activeCourts.map((court) => (
                  <option key={court.id} value={court.id}>
                    {court.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {editableDate && (
            <div className="space-y-1.5">
              <Label htmlFor="qb-date">Ngày</Label>
              <input
                id="qb-date"
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                className={SELECT_CLASS}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="qb-start">Giờ bắt đầu</Label>
              {isPrefilled ? (
                <Input id="qb-start" value={startTime} disabled />
              ) : (
                <select
                  id="qb-start"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="" disabled>
                    -- Chọn giờ --
                  </option>
                  {startTimeOptions.map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qb-duration">Thời lượng</Label>
              <select
                id="qb-duration"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className={SELECT_CLASS}
              >
                {durationOptions.map((hours) => (
                  <option key={hours} value={hours}>
                    {hours} giờ
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qb-note">Ghi chú</Label>
            <textarea
              id="qb-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Cần thuê áo đấu..."
              rows={1}
              className="h-11 w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3 dark:border-green-900 dark:bg-green-950/30">
            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Receipt className="size-4 text-muted-foreground" />
              Tổng tiền dự tính
            </span>
            <span className="text-lg font-bold text-green-700 underline decoration-2 underline-offset-2 dark:text-green-400">
              {estimatedTotal.toLocaleString("vi-VN")}đ
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="h-10 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
            Hủy
          </DialogClose>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 gap-1.5 rounded-xl bg-green-600 px-4 font-medium text-white hover:bg-green-700"
          >
            <Check className="size-4" />
            Xác nhận đặt sân
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
