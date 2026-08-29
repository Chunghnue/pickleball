import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STATUS_LABEL, type BookingStatus } from "@/app/owner/venues/[id]/bookings-section";

interface RecentBooking {
  id: string;
  customerName: string;
  customerPhone: string | null;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  status: BookingStatus;
}

interface RecentBookingsProps {
  recentBookings: RecentBooking[];
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export function RecentBookings({ recentBookings }: RecentBookingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">
          Đặt lịch gần nhất
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {recentBookings.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có lịch đặt nào.</p>
        )}
        {recentBookings.map((booking) => (
          <Card key={booking.id}>
            <CardContent className="flex flex-col gap-1 pt-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                {booking.customerName} · {booking.customerPhone ?? "Chưa có"}
              </p>
              <p>{booking.courtName}</p>
              <p>
                {booking.date} · {booking.startTime}–{booking.endTime}
              </p>
              <p>
                {currencyFormatter.format(booking.totalPrice)}đ ·{" "}
                {STATUS_LABEL[booking.status]}
              </p>
            </CardContent>
          </Card>
        ))}
        <Link
          href="/owner/bookings"
          className={buttonVariants({ variant: "outline", size: "sm" }) + " self-start"}
        >
          Xem tất cả
        </Link>
      </CardContent>
    </Card>
  );
}
