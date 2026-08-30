"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { Court } from "../../types";

export type BookingStatus = "confirmed" | "cancelled" | "completed";
type PaymentStatus = "unpaid" | "paid" | "refunded";

interface OwnerBooking {
  id: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  status: BookingStatus;
  customerName: string;
  customerPhone: string | null;
  paymentStatus: PaymentStatus;
  paymentNote: string | null;
}

export const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Đã xác nhận",
  cancelled: "Đã huỷ",
  completed: "Hoàn thành",
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Chưa thanh toán",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
};

interface BookingsSectionProps {
  venueId: string;
  courts: Court[];
}

export function BookingsSection({ venueId, courts }: BookingsSectionProps) {
  const [bookings, setBookings] = useState<OwnerBooking[] | null>(null);
  const [date, setDate] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [paymentAction, setPaymentAction] = useState<{
    bookingId: string;
    type: "pay" | "refund";
    note: string;
  } | null>(null);

  async function loadBookings() {
    const query = date ? `?date=${date}` : "";
    const response = await fetch(
      `/api/venues/mine/${venueId}/bookings${query}`,
    );
    const data = await response.json().catch(() => []);
    setBookings(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadBookings();
  }, [venueId, date]);

  function courtName(courtId: string): string {
    return courts.find((court) => court.id === courtId)?.name ?? courtId;
  }

  async function handleCancel(id: string) {
    const response = await fetch(
      `/api/venues/mine/${venueId}/bookings/${id}/cancel`,
      { method: "POST" },
    );
    const data = await response.json().catch(() => null);
    setConfirmingId(null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã huỷ booking");
    setBookings(
      (current) =>
        current?.map((booking) =>
          booking.id === id ? { ...booking, status: "cancelled" } : booking,
        ) ?? null,
    );
  }

  async function handlePaymentAction() {
    if (!paymentAction) return;
    const { bookingId, type, note } = paymentAction;
    const path = type === "pay" ? "mark-paid" : "mark-refunded";
    const response = await fetch(
      `/api/venues/mine/${venueId}/bookings/${bookingId}/payment/${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      },
    );
    const data = await response.json().catch(() => null);
    setPaymentAction(null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success(
      type === "pay" ? "Đã đánh dấu đã nhận tiền" : "Đã đánh dấu đã hoàn tiền",
    );
    setBookings(
      (current) =>
        current?.map((booking) =>
          booking.id === bookingId
            ? {
                ...booking,
                paymentStatus: type === "pay" ? "paid" : "refunded",
                paymentNote: note.trim() || booking.paymentNote,
              }
            : booking,
        ) ?? null,
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Booking</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="booking-date-filter">Lọc theo ngày</Label>
            <Input
              id="booking-date-filter"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          {date && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDate("")}
            >
              Xem tất cả
            </Button>
          )}
        </div>

        {bookings === null && <p className="text-sm">Đang tải...</p>}
        {bookings !== null && bookings.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Chưa có booking nào.
          </p>
        )}

        <div className="flex flex-col gap-4">
          {bookings?.map((booking) => (
            <Card key={booking.id}>
              <CardContent className="flex flex-col gap-3 pt-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {courtName(booking.courtId)}
                    </p>
                    <p>
                      {booking.date} · {booking.startTime}–{booking.endTime}
                    </p>
                    <p>
                      {booking.customerName} · {booking.customerPhone ?? "Chưa có"}
                    </p>
                    <p>
                      {booking.totalPrice.toLocaleString("vi-VN")}đ ·{" "}
                      {STATUS_LABEL[booking.status]}
                    </p>
                  </div>
                  {booking.status === "confirmed" && (
                    <div className="flex gap-2">
                      {confirmingId === booking.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleCancel(booking.id)}
                          >
                            Xác nhận huỷ?
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmingId(null)}
                          >
                            Thôi
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmingId(booking.id)}
                        >
                          Huỷ
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <p className="text-sm text-muted-foreground">
                    {PAYMENT_STATUS_LABEL[booking.paymentStatus]}
                    {booking.paymentNote ? ` · ${booking.paymentNote}` : ""}
                  </p>
                  {paymentAction?.bookingId === booking.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Ghi chú (tuỳ chọn)"
                        value={paymentAction.note}
                        onChange={(event) =>
                          setPaymentAction({
                            ...paymentAction,
                            note: event.target.value,
                          })
                        }
                        className="h-8 w-40"
                      />
                      <Button size="sm" onClick={handlePaymentAction}>
                        Xác nhận
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPaymentAction(null)}
                      >
                        Thôi
                      </Button>
                    </div>
                  ) : (
                    <>
                      {booking.paymentStatus === "unpaid" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPaymentAction({
                              bookingId: booking.id,
                              type: "pay",
                              note: "",
                            })
                          }
                        >
                          Đã nhận tiền
                        </Button>
                      )}
                      {booking.paymentStatus === "paid" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPaymentAction({
                              bookingId: booking.id,
                              type: "refund",
                              note: "",
                            })
                          }
                        >
                          Đánh dấu đã hoàn tiền
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
