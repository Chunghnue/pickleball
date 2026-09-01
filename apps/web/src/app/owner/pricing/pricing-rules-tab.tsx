"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Calendar, ChevronDown, FileText, Pencil, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { formatDaysOfWeek, formatMoney, formatShortDate, isAllDaysSelected } from "./pricing-format";
import { PricingRuleFormDialog } from "./pricing-rule-form-dialog";
import type { PricingRule } from "./types";

export function PricingRulesTab({
  venueId,
  courtId,
  rules,
  onRuleSaved,
  onRuleDeleted,
}: {
  venueId: string;
  courtId: string;
  rules: PricingRule[];
  onRuleSaved: (rule: PricingRule) => void;
  onRuleDeleted: (ruleId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [sortAsc, setSortAsc] = useState(true);
  const filtered = rules
    .filter((rule) => rule.name.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) =>
      sortAsc ? a.startTime.localeCompare(b.startTime) : b.startTime.localeCompare(a.startTime),
    );

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        className="inline-flex h-9 w-fit items-center rounded-full bg-blue-600 px-4 text-sm font-medium text-white"
      >
        Tất cả ({rules.length})
      </button>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-input bg-card px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên khung giá..."
            className="h-11 border-0 px-0 focus-visible:ring-0"
          />
        </div>
        <button
          type="button"
          onClick={() => setSortAsc((prev) => !prev)}
          aria-label={sortAsc ? "Sắp xếp theo giờ tăng dần" : "Sắp xếp theo giờ giảm dần"}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <span>Sắp xếp:</span>
          <span className="font-medium text-foreground">Theo giờ</span>
          <ChevronDown className={cn("size-4 transition-transform", !sortAsc && "rotate-180")} />
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card">
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="size-4 text-muted-foreground" />
            Chung
          </span>
          <span className="text-xs text-muted-foreground">{filtered.length} khung</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead>KHUNG GIÁ</TableHead>
              <TableHead>NGÀY</TableHead>
              <TableHead>GIỜ</TableHead>
              <TableHead>GIÁ</TableHead>
              <TableHead>ĐẶT TRƯỚC</TableHead>
              <TableHead>ĐƠN VỊ</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  {rules.length === 0
                    ? "Chưa có khung giá nào cho sân này — Tạo khung giá đầu tiên"
                    : "Không tìm thấy khung giá phù hợp"}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((rule) => (
              <PricingRuleRow
                key={rule.id}
                venueId={venueId}
                courtId={courtId}
                rule={rule}
                onSaved={onRuleSaved}
                onDeleted={onRuleDeleted}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PricingRuleRow({
  venueId,
  courtId,
  rule,
  onSaved,
  onDeleted,
}: {
  venueId: string;
  courtId: string;
  rule: PricingRule;
  onSaved: (rule: PricingRule) => void;
  onDeleted: (ruleId: string) => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const response = await fetch(
      `/api/venues/mine/${venueId}/courts/${courtId}/pricing-rules/${rule.id}`,
      { method: "DELETE" },
    );
    setDeleting(false);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success("Đã xóa khung giá");
    setDeleteOpen(false);
    onDeleted(rule.id);
  }

  const hasValidRange = rule.validFrom || rule.validTo;

  return (
    <TableRow>
      <TableCell>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{rule.name}</span>
          {hasValidRange && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400">
              <Calendar className="size-3" />
              {formatShortDate(rule.validFrom)} → {formatShortDate(rule.validTo)}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        {isAllDaysSelected(rule.daysOfWeek) ? (
          <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            Tất cả
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{formatDaysOfWeek(rule.daysOfWeek)}</span>
        )}
      </TableCell>
      <TableCell>
        {rule.startTime} – {rule.endTime}
      </TableCell>
      <TableCell className="font-semibold text-blue-600 dark:text-blue-400">
        {formatMoney(rule.price)}
      </TableCell>
      <TableCell>
        {rule.advanceBookingHours ? (
          <div>
            <p className="font-semibold text-green-600 dark:text-green-400">
              {formatMoney(rule.advancePrice ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">trước {rule.advanceBookingHours}h</p>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          Giờ
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1.5">
          <PricingRuleFormDialog
            mode="edit"
            venueId={venueId}
            courtId={courtId}
            rule={rule}
            onSaved={onSaved}
            trigger={
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Sửa khung giá"
                className="border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/40"
              >
                <Pencil className="size-3.5" />
              </Button>
            }
          />
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Xóa khung giá"
                  className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              }
            />
            <DialogContent className="max-w-sm p-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <Trash2 className="size-11 text-muted-foreground/70" strokeWidth={1.25} />
                <DialogTitle className="text-base font-semibold">
                  Xóa khung giá <span className="text-blue-600">{rule.name}</span>?
                </DialogTitle>
              </div>
              <div className="mt-5 flex gap-3">
                <DialogClose className="flex-1 rounded-lg border bg-muted/60 px-4 py-2 text-sm font-medium hover:bg-muted">
                  Hủy
                </DialogClose>
                <Button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 gap-1.5 bg-red-600 text-white hover:bg-red-700"
                >
                  <Trash2 className="size-4" />
                  Xóa
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </TableCell>
    </TableRow>
  );
}
