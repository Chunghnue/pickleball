import { Filter } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber, formatPercent } from "./page-views-format";
import type { PageViewsSummary } from "./types";

export function PageViewsConversionTable({
  conversion,
}: {
  conversion: PageViewsSummary["conversion"];
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-4 border-b px-4 py-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Filter className="size-4" />
            Tỷ lệ chuyển đổi: View → Booking
          </h2>
          <p className="text-xs text-muted-foreground">
            Cơ sở nào có nhiều view nhưng ít đặt sân? Sort theo % chuyển đổi
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead>CƠ SỞ</TableHead>
              <TableHead>LƯỢT XEM</TableHead>
              <TableHead>BOOKING</TableHead>
              <TableHead>TỶ LỆ CHUYỂN ĐỔI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {conversion.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  Chưa có dữ liệu.
                </TableCell>
              </TableRow>
            )}
            {conversion.map((row) => (
              <TableRow key={row.venueId}>
                <TableCell className="font-medium">{row.venueName}</TableCell>
                <TableCell>{formatNumber(row.views)}</TableCell>
                <TableCell>{formatNumber(row.bookings)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-green-500"
                        style={{ width: `${Math.min(100, row.conversionRate ?? 0)}%` }}
                      />
                    </div>
                    <span
                      className={
                        row.conversionRate === null
                          ? "text-muted-foreground"
                          : "font-semibold text-green-600 dark:text-green-400"
                      }
                    >
                      {row.conversionRate === null
                        ? "– (chưa có view)"
                        : formatPercent(row.conversionRate)}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
