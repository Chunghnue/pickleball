"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Copy, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { Venue } from "../types";
import type { PricingRule } from "./types";

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

export function CopyPricingDialog({
  trigger,
  venueId,
  sourceVenues,
  onCopied,
}: {
  trigger: React.ReactElement;
  venueId: string;
  sourceVenues: Venue[];
  onCopied: (rules: PricingRule[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sourceVenueId, setSourceVenueId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!sourceVenueId) {
      toast.error("Vui lòng chọn chi nhánh nguồn");
      return;
    }
    setSubmitting(true);
    const response = await fetch(
      `/api/venues/mine/${venueId}/pricing-rules/copy-from-venue/${sourceVenueId}`,
      { method: "POST" },
    );
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    const copied = data as PricingRule[];
    toast.success(`Đã sao chép ${copied.length} khung giá`);
    onCopied(copied);
    setSourceVenueId("");
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSourceVenueId("");
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-gradient-to-r from-teal-600 to-cyan-500 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-white">
            <Copy className="size-5 text-white" />
            Sao chép bảng giá
          </DialogTitle>
          <DialogClose className="text-white/80 outline-none hover:text-white" aria-label="Đóng">
            <X className="size-5" />
          </DialogClose>
        </div>

        <div className="flex flex-col gap-3 px-6 py-5">
          <div className="flex gap-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2.5 text-sm text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-200">
            <Info className="mt-0.5 size-4 shrink-0" />
            <p>
              Sao chép toàn bộ bảng giá từ chi nhánh khác về chi nhánh hiện tại. Bảng giá hiện có
              sẽ <span className="font-semibold">không</span> bị ghi đè.
            </p>
          </div>

          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>
              Quy tắc gắn với <span className="font-semibold">sân cụ thể</span> sẽ chuyển thành áp
              dụng cho cả chi nhánh (vì sân ở 2 nơi không trùng ID).
            </p>
          </div>

          <div className="space-y-1.5 pt-1">
            <label htmlFor="copy-source-venue" className="text-sm font-semibold">
              Chi nhánh nguồn <span className="text-destructive">*</span>
            </label>
            <select
              id="copy-source-venue"
              value={sourceVenueId}
              onChange={(e) => setSourceVenueId(e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">— Chọn chi nhánh —</option>
              {sourceVenues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
            {!sourceVenueId && (
              <p className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="size-3" />
                Chưa chọn chi nhánh hiện tại
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="rounded-lg border px-4 py-2 text-sm font-medium">Hủy</DialogClose>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
          >
            <Copy className="size-4" />
            Sao chép
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
