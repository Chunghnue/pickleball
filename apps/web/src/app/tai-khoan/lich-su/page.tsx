"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Calendar, Clock, History, MapPin, Tag, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";

type BookingStatus = "confirmed" | "cancelled" | "completed";
type PaymentStatus = "unpaid" | "paid" | "refunded";

interface Booking {
  id: string;
  bookingCode: string;
  courtName: string;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
}

const STATUS_BADGE_CLASSES: Record<BookingStatus, string> = {
  confirmed: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  completed:
    "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
  cancelled: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
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
    return <p>Đang tải...</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <History className="size-5 text-green-600 dark:text-green-400" />
        Lịch sử đặt sân
      </h1>

      {bookings.length === 0 && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground">Bạn chưa có lượt đặt sân nào.</p>
          <Link href="/venues" className={buttonVariants({ variant: "outline" })}>
            Tìm sân ngay
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {bookings.map((booking) => (
          <div
            key={booking.id}
            className="rounded-xl border border-border p-4"
          >
            <div className="flex items-center justify-between">
              <p className="font-bold">{booking.bookingCode}</p>
              <span
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold uppercase",
                  STATUS_BADGE_CLASSES[booking.status],
                )}
              >
                {booking.status}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3.5 text-pink-500" />
                  Sân
                </p>
                <p className="font-bold">{booking.courtName}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="size-3.5" />
                  Ngày
                </p>
                <p className="font-bold">{booking.date}</p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3.5" />
                  Giờ
                </p>
                <p className="font-bold">
                  {booking.startTime} - {booking.endTime}
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Tag className="size-3.5" />
                  Thành tiền
                </p>
                <p className="font-bold">
                  {booking.totalPrice.toLocaleString("vi-VN")}đ
                </p>
                <p className="text-xs text-muted-foreground">
                  {PAYMENT_STATUS_LABEL[booking.paymentStatus]}
                </p>
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              {booking.status === "confirmed" &&
                (confirmingId === booking.id ? (
                  <>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="rounded-full"
                      onClick={() => handleCancel(booking.id)}
                    >
                      Xác nhận huỷ?
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => setConfirmingId(null)}
                    >
                      Thôi
                    </Button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingId(booking.id)}
                    className="flex items-center gap-1 rounded-full border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <X className="size-3.5" />
                    Hủy đặt sân
                  </button>
                ))}
              {booking.paymentStatus === "paid" &&
                !disputedIds.has(booking.id) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => handleReportIssue(booking.id)}
                  >
                    Báo cáo vấn đề
                  </Button>
                )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
