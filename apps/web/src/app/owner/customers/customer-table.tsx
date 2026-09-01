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
import { avatarInitials, formatShortDate } from "./customer-format";
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
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead className="w-10">#</TableHead>
              <TableHead>Khách hàng</TableHead>
              <TableHead>SĐT</TableHead>
              <TableHead>Lượt đặt</TableHead>
              <TableHead>Tổng tiền</TableHead>
              <TableHead>Lần cuối</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
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
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {avatarInitials(item.fullName)}
                    </span>
                    <span className="font-medium">{item.fullName}</span>
                  </div>
                </TableCell>
                <TableCell>{item.phone ?? "—"}</TableCell>
                <TableCell>{item.totalBookings}</TableCell>
                <TableCell className="font-medium">
                  {currencyFormatter.format(item.totalSpent)}đ
                </TableCell>
                <TableCell>{formatShortDate(item.lastBookingAt)}</TableCell>
                <TableCell>
                  <TierBadge tier={item.tier} />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Xem chi tiết"
                    onClick={() => onOpenDetail(item)}
                  >
                    <Eye className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
          <span>
            Hiển thị {from}–{to} / {total}
          </span>
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
        </div>
      </CardContent>
    </Card>
  );
}
