"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { Court } from "./types";

type BookingStatus = "confirmed" | "cancelled" | "completed";

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
}

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Đã xác nhận",
  cancelled: "Đã huỷ",
  completed: "Hoàn thành",
};

interface BookingsSectionProps {
  venueId: string;
  courts: Court[];
}

export function BookingsSection({ venueId, courts }: BookingsSectionProps) {
  const [bookings, setBookings] = useState<OwnerBooking[] | null>(null);
  const [date, setDate] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

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
              <CardContent className="flex items-center justify-between pt-6">
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
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
