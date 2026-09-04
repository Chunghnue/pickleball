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
import { formatDateTime, formatMoney } from "./revenue-format";
import type { RevenueTransaction } from "./types";

function PaidBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-950/40 dark:text-green-400">
      Đã thanh toán
    </span>
  );
}

export function RevenueTransactionsTable({
  transactions,
  page,
  pageSize,
  total,
  onPrev,
  onNext,
}: {
  transactions: RevenueTransaction[];
  page: number;
  pageSize: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const hasPager = total > pageSize;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">Danh sách giao dịch</h2>
          <span className="text-sm text-muted-foreground">Tổng: {total} giao dịch</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead>MÃ GD</TableHead>
              <TableHead>KHÁCH HÀNG</TableHead>
              <TableHead>THỜI GIAN</TableHead>
              <TableHead>SỐ TIỀN</TableHead>
              <TableHead>THANH TOÁN</TableHead>
              <TableHead>TRẠNG THÁI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Chưa có giao dịch nào.
                </TableCell>
              </TableRow>
            )}
            {transactions.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.transactionCode}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-semibold">{t.customerName}</span>
                    <span className="text-xs text-muted-foreground">{t.customerPhone}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(t.paidAt)}
                </TableCell>
                <TableCell className="font-semibold text-green-600 dark:text-green-400">
                  {formatMoney(t.amount)}
                </TableCell>
                <TableCell>
                  <PaidBadge />
                </TableCell>
                <TableCell>
                  <PaidBadge />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
          <span>
            Hiển thị {total === 0 ? 0 : (page - 1) * pageSize + 1}–
            {Math.min(page * pageSize, total)} / {total}
          </span>
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
