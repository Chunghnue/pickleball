"use client";

import { useState } from "react";
import { Download, Filter } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DateRange } from "./types";

export function RevenueFilterBar({
  appliedRange,
  onApply,
  exportHref,
}: {
  appliedRange: DateRange;
  onApply: (range: DateRange) => void;
  exportHref: string;
}) {
  const [draftFrom, setDraftFrom] = useState(appliedRange.from);
  const [draftTo, setDraftTo] = useState(appliedRange.to);

  const isInvalid = !draftFrom || !draftTo || draftFrom > draftTo;

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="revenue-from">Từ ngày</Label>
          <Input
            id="revenue-from"
            type="date"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="revenue-to">Đến ngày</Label>
          <Input
            id="revenue-to"
            type="date"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
          />
        </div>
        <Button
          type="button"
          onClick={() => onApply({ from: draftFrom, to: draftTo })}
          disabled={isInvalid}
          className="gap-2"
        >
          <Filter className="size-4" />
          Lọc
        </Button>
      </div>
      <a href={exportHref} className={buttonVariants({ variant: "outline", className: "gap-2" })}>
        <Download className="size-4" />
        Xuất báo cáo
      </a>
    </div>
  );
}
