"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
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
  confirmed: "Đã xác nhận",
  cancelled: "Đã huỷ",
  completed: "Hoàn thành",
};

const PAYMENT_STATUS_LABEL: Record<OwnerBooking["paymentStatus"], string> = {
  unpaid: "Chưa thanh toán",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
};

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
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle className="text-lg font-semibold">Chi tiết lịch đặt</DialogTitle>
          <DialogClose
            className="text-muted-foreground outline-none hover:text-foreground"
            aria-label="Đóng"
          >
            ✕
          </DialogClose>
        </div>

        <div className="flex flex-col gap-2 px-6 py-5 text-sm">
          <p className="font-medium">
            {court?.name ?? booking.courtId} · {booking.date}
          </p>
          <p>
            {booking.customerName} · {booking.customerPhone ?? "Chưa có"}
          </p>
          <p>
            {booking.startTime}–{booking.endTime} · {booking.totalPrice.toLocaleString("vi-VN")}đ
          </p>
          <p>Trạng thái: {STATUS_LABEL[booking.status]}</p>
          <p>Mã booking: {booking.bookingCode}</p>
          <p>
            {PAYMENT_STATUS_LABEL[booking.paymentStatus]}
            {booking.paymentNote ? ` · ${booking.paymentNote}` : ""}
          </p>

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
          <DialogClose className="rounded-lg border px-4 py-2 text-sm font-medium">Đóng</DialogClose>
          {booking.status === "confirmed" &&
            (confirmingCancel ? (
              <>
                <Button variant="outline" onClick={() => setConfirmingCancel(false)}>
                  Thôi
                </Button>
                <Button variant="destructive" onClick={handleCancel}>
                  Xác nhận huỷ?
                </Button>
              </>
            ) : (
              <Button variant="destructive" onClick={() => setConfirmingCancel(true)}>
                Huỷ lịch
              </Button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
