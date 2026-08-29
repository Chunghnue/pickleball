import Link from "next/link";
import { Clock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
const COURT_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#0891b2"];

function colorForCourt(courtName: string): string {
  let hash = 0;
  for (let i = 0; i < courtName.length; i++) {
    hash = (hash * 31 + courtName.charCodeAt(i)) % COURT_COLORS.length;
  }
  return COURT_COLORS[hash];
}

const STATUS_BADGE_CLASS: Record<BookingStatus, string> = {
  confirmed: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  cancelled: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  completed: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
};

export function RecentBookings({ recentBookings }: RecentBookingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-4" />
          Đặt lịch gần nhất
        </CardTitle>
        <CardAction>
          <Link
            href="/owner/bookings"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Xem tất cả
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Khách hàng</TableHead>
              <TableHead>Sân</TableHead>
              <TableHead>Thời gian</TableHead>
              <TableHead className="text-right">Giá</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentBookings.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Chưa có lịch đặt nào.
                </TableCell>
              </TableRow>
            )}
            {recentBookings.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell>
                  <p className="font-medium">{booking.customerName}</p>
                  <p className="text-sm text-muted-foreground">
                    {booking.customerPhone ?? "Chưa có"}
                  </p>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: colorForCourt(booking.courtName) }}
                    />
                    {booking.courtName}
                  </span>
                </TableCell>
                <TableCell>
                  {booking.startTime}–{booking.endTime}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {currencyFormatter.format(booking.totalPrice)}đ
                </TableCell>
                <TableCell>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[booking.status]}`}
                  >
                    {STATUS_LABEL[booking.status]}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
