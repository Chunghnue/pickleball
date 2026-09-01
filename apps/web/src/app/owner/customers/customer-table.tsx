import { Eye } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { avatarColor, avatarInitials, formatShortDate } from "./customer-format";
import { TierBadge } from "./tier-badge";
import type { CustomerListItem } from "./types";

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export function CustomerTable({
  items,
  page,
  pageSize,
  total,
  onOpenDetail,
  onPrev,
  onNext,
}: {
  items: CustomerListItem[];
  page: number;
  pageSize: number;
  total: number;
  onOpenDetail: (item: CustomerListItem) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const hasPager = total > pageSize;

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead className="w-10">#</TableHead>
              <TableHead>KHÁCH HÀNG</TableHead>
              <TableHead>SĐT</TableHead>
              <TableHead>LƯỢT ĐẶT</TableHead>
              <TableHead>TỔNG TIỀN</TableHead>
              <TableHead>LẦN CUỐI</TableHead>
              <TableHead>LOẠI</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Chưa có khách hàng nào.
                </TableCell>
              </TableRow>
            )}
            {items.map((item, index) => (
              <TableRow key={`${item.kind}-${item.id}`}>
                <TableCell className="text-muted-foreground">
                  {(page - 1) * pageSize + index + 1}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor(item.fullName)}`}
                    >
                      {avatarInitials(item.fullName)}
                    </span>
                    <span className="font-semibold">{item.fullName}</span>
                  </div>
                </TableCell>
                <TableCell>{item.phone ?? "—"}</TableCell>
                <TableCell className="font-semibold text-blue-600 dark:text-blue-400">
                  {item.totalBookings}
                </TableCell>
                <TableCell className="font-semibold text-green-600 dark:text-green-400">
                  {currencyFormatter.format(item.totalSpent)}đ
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatShortDate(item.lastBookingAt)}
                </TableCell>
                <TableCell>
                  <TierBadge tier={item.tier} />
                </TableCell>
                <TableCell className="text-right">
                  <button
                    type="button"
                    aria-label="Xem chi tiết"
                    onClick={() => onOpenDetail(item)}
                    className="inline-flex size-8 items-center justify-center rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-400 dark:hover:bg-blue-950/40"
                  >
                    <Eye className="size-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
          <span>{total} khách hàng</span>
          {hasPager && (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onPrev} disabled={page <= 1}>
                Trước
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onNext}
                disabled={page * pageSize >= total}
              >
                Sau
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
