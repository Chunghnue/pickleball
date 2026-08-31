"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { buildHourAxis } from "@/lib/booking-grid";
import type { Court } from "../types";
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
}: QuickBookDialogProps) {
  const isPrefilled = Boolean(initialCourtId && initialHour);
  const activeCourts = courts.filter((c) => c.status === "active");
  const [courtId, setCourtId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(1);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCourtId(initialCourtId ?? activeCourts[0]?.id ?? "");
    setStartTime(initialHour ?? "");
    setDuration(Math.min(2, maxDurationHours ?? 8));
    setFullName("");
    setPhone("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCourtId, initialHour, maxDurationHours]);

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
    const response = await fetch(`/api/venues/mine/${venueId}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courtId,
        date,
        startTime,
        endTime,
        newCustomer: { fullName: fullName.trim(), phone: phone.trim() },
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
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle className="text-lg font-semibold">Đặt sân nhanh</DialogTitle>
          <DialogClose
            className="text-muted-foreground outline-none hover:text-foreground"
            aria-label="Đóng"
          >
            ✕
          </DialogClose>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="qb-court">Sân *</Label>
            <select
              id="qb-court"
              value={courtId}
              onChange={(e) => setCourtId(e.target.value)}
              disabled={isPrefilled}
              className={SELECT_CLASS}
            >
              {activeCourts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="qb-start">Giờ bắt đầu *</Label>
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
              <Label htmlFor="qb-duration">Thời lượng (giờ)</Label>
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
            <Label htmlFor="qb-name">Tên khách hàng *</Label>
            <Input id="qb-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qb-phone">Số điện thoại *</Label>
            <Input id="qb-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          {startTime && (
            <p className="text-sm text-muted-foreground">
              {startTime}–{endTime} · {estimatedTotal.toLocaleString("vi-VN")}đ
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="rounded-lg border px-4 py-2 text-sm font-medium">Hủy</DialogClose>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            Xác nhận đặt sân
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
