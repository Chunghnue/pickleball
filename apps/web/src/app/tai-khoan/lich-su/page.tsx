"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSubmitErrorMessage } from "@/lib/error-message";

type BookingStatus = "confirmed" | "cancelled" | "completed";
type PaymentStatus = "unpaid" | "paid" | "refunded";

interface Booking {
  id: string;
  courtName: string;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
}

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Đã xác nhận",
  cancelled: "Đã huỷ",
  completed: "Hoàn thành",
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Chưa thanh toán",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
};

export default function MyBookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [disputedIds, setDisputedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/bookings/mine")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Ftai-khoan%2Flich-su");
          return null;
        }
        return (await res.json()) as Booking[];
      })
      .then((data) => {
        if (!data) return;
        setBookings(data);
      });
  }, [router]);

  async function handleCancel(id: string) {
    const response = await fetch(`/api/bookings/${id}/cancel`, {
      method: "POST",
    });
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

  async function handleReportIssue(id: string) {
    const reason = window.prompt("Mô tả vấn đề bạn gặp phải với booking này:");
    if (reason === null) return;
    if (reason.trim() === "") {
      toast.error("Vui lòng nhập lý do khiếu nại.");
      return;
    }

    const response = await fetch(`/api/bookings/${id}/disputes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã gửi khiếu nại, admin sẽ xem xét sớm.");
    setDisputedIds((current) => new Set(current).add(id));
  }

  if (!bookings) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p>Đang tải...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">Booking của tôi</h1>

      {bookings.length === 0 && (
        <p className="text-muted-foreground">Bạn chưa có booking nào.</p>
      )}

      <div className="flex flex-col gap-4">
        {bookings.map((booking) => (
          <Card key={booking.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {booking.courtName} · {booking.venueName}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                <p>
                  {booking.date} · {booking.startTime}–{booking.endTime}
                </p>
                <p>
                  {booking.totalPrice.toLocaleString("vi-VN")}đ ·{" "}
                  {STATUS_LABEL[booking.status]}
                </p>
                <p>{PAYMENT_STATUS_LABEL[booking.paymentStatus]}</p>
              </div>
              <div className="flex gap-2">
                {booking.status === "confirmed" &&
                  (confirmingId === booking.id ? (
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
                  ))}
                {booking.paymentStatus === "paid" &&
                  !disputedIds.has(booking.id) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReportIssue(booking.id)}
                    >
                      Báo cáo vấn đề
                    </Button>
                  )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
