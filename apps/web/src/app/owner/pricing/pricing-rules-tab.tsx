"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatDaysOfWeek, formatMoney } from "./pricing-format";
import { PricingRuleFormDialog } from "./pricing-rule-form-dialog";
import { CopyPricingDialog } from "./copy-pricing-dialog";
import type { CourtWithVenueName } from "../types";
import type { PricingRule } from "./types";

const SELECT_CLASS =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

export function PricingRulesTab({
  venueId,
  courtsInVenue,
  selectedCourtId,
  onCourtChange,
  rules,
  copySourceCandidates,
  onRuleSaved,
  onRuleDeleted,
  onCopied,
}: {
  venueId: string;
  courtsInVenue: CourtWithVenueName[];
  selectedCourtId: string;
  onCourtChange: (courtId: string) => void;
  rules: PricingRule[];
  /** All of the owner's courts across every venue except the one currently
   * selected — `copy-from` is allowed to pull rules from any venue the
   * owner owns, not just this one. Supplied by page.tsx (Task 10), which is
   * the only place with the full cross-venue court list. */
  copySourceCandidates: CourtWithVenueName[];
  onRuleSaved: (rule: PricingRule) => void;
  onRuleDeleted: (ruleId: string) => void;
  onCopied: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = rules.filter((rule) =>
    rule.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedCourtId}
              onChange={(e) => onCourtChange(e.target.value)}
              className={SELECT_CLASS}
            >
              {courtsInVenue.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tên khung giá..."
                className="h-9 w-48 border-0 px-0 focus-visible:ring-0"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <CopyPricingDialog
              venueId={venueId}
              targetCourtId={selectedCourtId}
              sourceCandidates={copySourceCandidates}
              onCopied={onCopied}
              trigger={
                <Button type="button" variant="outline" className="gap-1.5">
                  <Copy className="size-4" />
                  Sao chép
                </Button>
              }
            />
            <PricingRuleFormDialog
              mode="create"
              venueId={venueId}
              courtId={selectedCourtId}
              onSaved={onRuleSaved}
              trigger={
                <Button type="button" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700">
                  <Plus className="size-4" />
                  Thêm bảng giá
                </Button>
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableHead>TÊN KHUNG GIÁ</TableHead>
                <TableHead>THỨ ÁP DỤNG</TableHead>
                <TableHead>KHUNG GIỜ</TableHead>
                <TableHead>GIÁ</TableHead>
                <TableHead>ĐẶT TRƯỚC</TableHead>
                <TableHead>ƯU TIÊN</TableHead>
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
                  courtId={selectedCourtId}
                  rule={rule}
                  onSaved={onRuleSaved}
                  onDeleted={onRuleDeleted}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
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

  return (
    <TableRow>
      <TableCell className="font-medium">{rule.name}</TableCell>
      <TableCell>{formatDaysOfWeek(rule.daysOfWeek)}</TableCell>
      <TableCell>
        {rule.startTime} - {rule.endTime}
      </TableCell>
      <TableCell className="font-semibold text-blue-600 dark:text-blue-400">
        {formatMoney(rule.price)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {rule.advanceBookingHours
          ? `${rule.advanceBookingHours}h → ${formatMoney(rule.advancePrice ?? 0)}`
          : "—"}
      </TableCell>
      <TableCell>{rule.priority}</TableCell>
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
