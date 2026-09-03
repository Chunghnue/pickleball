import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, formatMoney } from "./revenue-format";
import type { RevenueTransaction } from "./types";

export function RevenueTransactionsTable({
  transactions,
}: {
  transactions: RevenueTransaction[];
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">Danh sách giao dịch ({transactions.length})</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead>MÃ GD</TableHead>
              <TableHead>KHÁCH HÀNG</TableHead>
              <TableHead>THỜI GIAN</TableHead>
              <TableHead>SỐ TIỀN</TableHead>
              <TableHead>TRẠNG THÁI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
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
                  <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-950/40 dark:text-green-400">
                    Đã thanh toán
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
