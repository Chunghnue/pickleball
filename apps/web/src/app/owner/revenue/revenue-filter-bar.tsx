"use client";

import { useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DateRange } from "./types";

export function RevenueFilterBar({
  appliedRange,
  onApply,
}: {
  appliedRange: DateRange;
  onApply: (range: DateRange) => void;
}) {
  const [draftFrom, setDraftFrom] = useState(appliedRange.from);
  const [draftTo, setDraftTo] = useState(appliedRange.to);

  const isInvalid = !draftFrom || !draftTo || draftFrom > draftTo;

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3">
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
          className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
        >
          <Filter className="size-4" />
          Lọc
        </Button>
      </CardContent>
    </Card>
  );
}
