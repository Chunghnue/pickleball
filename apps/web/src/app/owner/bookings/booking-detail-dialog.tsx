"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Clock, Phone, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { formatHeaderDate } from "@/lib/format-datetime";
import type { Court } from "../types";
import type { OwnerBooking } from "./types";

interface BookingDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  booking: OwnerBooking | null;
  court: Court | null;
  onUpdated: (booking: OwnerBooking) => void;
}

const STATUS_LABEL: Record<OwnerBooking["status"], string> = {
  confirmed: "Đã đặt",
  cancelled: "Đã huỷ",
  completed: "Hoàn thành",
};

const STATUS_BADGE_CLASS: Record<OwnerBooking["status"], string> = {
  confirmed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  cancelled: "bg-muted text-muted-foreground",
  completed: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
};

const PAYMENT_STATUS_LABEL: Record<OwnerBooking["paymentStatus"], string> = {
  unpaid: "Chưa thanh toán",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
};

function parseDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function BookingDetailDialog({
  open,
  onOpenChange,
  venueId,
  booking,
  court,
  onUpdated,
}: BookingDetailDialogProps) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [paymentNote, setPaymentNote] = useState("");
  const [showPaymentNote, setShowPaymentNote] = useState<"pay" | "refund" | null>(null);

  if (!booking) return null;

  async function handleCancel() {
    const response = await fetch(`/api/venues/mine/${venueId}/bookings/${booking!.id}/cancel`, {
      method: "POST",
    });
    const data = await response.json().catch(() => null);
    setConfirmingCancel(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success("Đã huỷ lịch đặt");
    onUpdated({ ...booking!, status: "cancelled" });
    onOpenChange(false);
  }

  async function handlePayment(type: "pay" | "refund") {
    const path = type === "pay" ? "mark-paid" : "mark-refunded";
    const response = await fetch(
      `/api/venues/mine/${venueId}/bookings/${booking!.id}/payment/${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: paymentNote.trim() || undefined }),
      },
    );
    const data = await response.json().catch(() => null);
    setShowPaymentNote(null);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success(type === "pay" ? "Đã đánh dấu đã nhận tiền" : "Đã đánh dấu đã hoàn tiền");
    onUpdated({
      ...booking!,
      paymentStatus: type === "pay" ? "paid" : "refunded",
      paymentNote: paymentNote.trim() || booking!.paymentNote,
    });
    setPaymentNote("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-red-600 px-6 py-4">
          <DialogTitle className="text-lg font-semibold text-white">
            Chi tiết lịch đặt
          </DialogTitle>
          <DialogClose
            className="text-white/80 outline-none hover:text-white"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </DialogClose>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="rounded-lg bg-muted/50 px-4 py-3">
            <p className="flex items-center gap-1.5 font-semibold">
              <span className="size-2 shrink-0 rounded-full bg-pink-500" />
              {court?.name ?? booking.courtId}
            </p>
            <p className="text-sm text-muted-foreground">{formatHeaderDate(parseDate(booking.date))}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground">Khách hàng</p>
              <p className="flex items-center gap-1.5 font-medium">
                <User className="size-4 shrink-0 text-muted-foreground" />
                {booking.customerName}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Trạng thái</p>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE_CLASS[booking.status]}`}
              >
                {STATUS_LABEL[booking.status]}
              </span>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Số điện thoại</p>
              <p className="flex items-center gap-1.5 font-medium">
                <Phone className="size-4 shrink-0 text-muted-foreground" />
                {booking.customerPhone ?? "Chưa có"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Giờ</p>
              <p className="flex items-center gap-1.5 font-medium">
                <Clock className="size-4 shrink-0 text-muted-foreground" />
                {booking.startTime}–{booking.endTime} · {booking.totalPrice.toLocaleString("vi-VN")}đ
              </p>
            </div>
          </div>

          {booking.note && (
            <p className="text-sm text-muted-foreground">Ghi chú: {booking.note}</p>
          )}

          <div className="flex flex-col gap-2 border-t pt-3 text-sm">
            <p>
              <span className="text-muted-foreground"># Mã booking: </span>
              <span className="font-semibold">{booking.bookingCode}</span>
            </p>
            <p className="text-muted-foreground">
              {PAYMENT_STATUS_LABEL[booking.paymentStatus]}
              {booking.paymentNote ? ` · ${booking.paymentNote}` : ""}
            </p>
          </div>

          {showPaymentNote && (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Ghi chú (tuỳ chọn)"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                className="h-8"
              />
              <Button size="sm" onClick={() => handlePayment(showPaymentNote)}>
                Xác nhận
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowPaymentNote(null)}>
                Thôi
              </Button>
            </div>
          )}
          {!showPaymentNote && booking.paymentStatus === "unpaid" && (
            <Button size="sm" variant="outline" onClick={() => setShowPaymentNote("pay")}>
              Đã nhận tiền
            </Button>
          )}
          {!showPaymentNote && booking.paymentStatus === "paid" && (
            <Button size="sm" variant="outline" onClick={() => setShowPaymentNote("refund")}>
              Đánh dấu đã hoàn tiền
            </Button>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="h-10 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
            Đóng
          </DialogClose>
          {booking.status === "confirmed" &&
            (confirmingCancel ? (
              <>
                <Button
                  variant="outline"
                  className="h-10 rounded-xl"
                  onClick={() => setConfirmingCancel(false)}
                >
                  Thôi
                </Button>
                <Button
                  onClick={handleCancel}
                  className="h-10 gap-1.5 rounded-xl border border-red-300 bg-white text-red-600 hover:bg-red-50 dark:border-red-800 dark:bg-transparent dark:hover:bg-red-950/40"
                >
                  <X className="size-4" />
                  Xác nhận huỷ?
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setConfirmingCancel(true)}
                className="h-10 gap-1.5 rounded-xl border border-red-300 bg-white text-red-600 hover:bg-red-50 dark:border-red-800 dark:bg-transparent dark:hover:bg-red-950/40"
              >
                <X className="size-4" />
                Hủy lịch
              </Button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
