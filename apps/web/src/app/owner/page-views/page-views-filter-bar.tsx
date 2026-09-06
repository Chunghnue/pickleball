"use client";

import { useState } from "react";
import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getPresetRange, type PresetKey } from "./page-views-format";
import type { DateRange } from "./types";

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "7d", label: "7 ngày" },
  { key: "30d", label: "30 ngày" },
  { key: "90d", label: "90 ngày" },
  { key: "this-month", label: "Tháng này" },
];

export function PageViewsFilterBar({
  appliedRange,
  onApply,
}: {
  appliedRange: DateRange;
  onApply: (range: DateRange) => void;
}) {
  const [draftFrom, setDraftFrom] = useState(appliedRange.from);
  const [draftTo, setDraftTo] = useState(appliedRange.to);
  const [activePreset, setActivePreset] = useState<PresetKey | null>("30d");

  const isInvalid = !draftFrom || !draftTo || draftFrom > draftTo;

  function applyPreset(preset: PresetKey) {
    const range = getPresetRange(preset);
    setDraftFrom(range.from);
    setDraftTo(range.to);
    setActivePreset(preset);
    onApply(range);
  }

  function handleCustomApply() {
    setActivePreset(null);
    onApply({ from: draftFrom, to: draftTo });
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.key}
              type="button"
              variant={activePreset === preset.key ? "default" : "outline"}
              size="sm"
              onClick={() => applyPreset(preset.key)}
              className={cn(
                activePreset === preset.key && "bg-blue-600 text-white hover:bg-blue-700",
              )}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="page-views-from">Từ ngày</Label>
          <Input
            id="page-views-from"
            type="date"
            value={draftFrom}
            onChange={(e) => {
              setDraftFrom(e.target.value);
              setActivePreset(null);
            }}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="page-views-to">Đến ngày</Label>
          <Input
            id="page-views-to"
            type="date"
            value={draftTo}
            onChange={(e) => {
              setDraftTo(e.target.value);
              setActivePreset(null);
            }}
          />
        </div>
        <Button
          type="button"
          onClick={handleCustomApply}
          disabled={isInvalid}
          className="gap-2 bg-blue-600 text-white hover:bg-blue-700"
        >
          <Filter className="size-4" />
          Áp dụng
        </Button>
      </CardContent>
    </Card>
  );
}
