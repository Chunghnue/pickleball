"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { CourtWithVenueName } from "../types";
import type { PricingRule } from "./types";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

export function CopyPricingDialog({
  trigger,
  venueId,
  targetCourtId,
  sourceCandidates,
  onCopied,
}: {
  trigger: React.ReactElement;
  venueId: string;
  targetCourtId: string;
  sourceCandidates: CourtWithVenueName[];
  onCopied: (rules: PricingRule[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sourceCourtId, setSourceCourtId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!sourceCourtId) {
      toast.error("Vui lòng chọn sân nguồn");
      return;
    }
    setSubmitting(true);
    const response = await fetch(
      `/api/venues/mine/${venueId}/courts/${targetCourtId}/pricing-rules/copy-from/${sourceCourtId}`,
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
    setSourceCourtId("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-sm gap-0 p-0">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle className="text-lg font-semibold">Sao chép bảng giá</DialogTitle>
          <DialogClose
            className="text-muted-foreground outline-none hover:text-foreground"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </DialogClose>
        </div>
        <div className="space-y-3 px-6 py-5">
          <p className="text-sm text-muted-foreground">
            Sao chép toàn bộ khung giá từ một sân khác sang sân đang chọn.
          </p>
          <select
            value={sourceCourtId}
            onChange={(e) => setSourceCourtId(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="" disabled>
              -- Chọn sân nguồn --
            </option>
            {sourceCandidates.map((court) => (
              <option key={court.id} value={court.id}>
                {court.venueName} · {court.name}
              </option>
            ))}
          </select>
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
