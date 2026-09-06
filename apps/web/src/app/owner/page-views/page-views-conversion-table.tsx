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
        <div className="border-b px-4 py-3">
          <h2 className="font-semibold">Tỷ lệ chuyển đổi: View → Booking</h2>
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
                <TableCell
                  className={
                    row.conversionRate === null
                      ? "text-muted-foreground"
                      : "font-semibold text-green-600 dark:text-green-400"
                  }
                >
                  {row.conversionRate === null ? "N/A" : formatPercent(row.conversionRate)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
