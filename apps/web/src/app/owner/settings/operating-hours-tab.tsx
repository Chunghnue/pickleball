"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useSettingsVenueId } from "./use-settings-venue-id";
import { orderForDisplay, validateOperatingHours, DAY_LABELS } from "./operating-hours-format";
import type { OperatingHourRow } from "./types";

export function OperatingHoursTab() {
  const router = useRouter();
  const { venueId, resolved } = useSettingsVenueId();
  const [rows, setRows] = useState<OperatingHourRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    setRows(null);
    setLoadError(null);
    fetch(`/api/venues/mine/${venueId}/operating-hours`).then(async (res) => {
      if (res.status === 401) {
        router.push("/login?returnTo=%2Fowner%2Fsettings");
        return;
      }
      const data: OperatingHourRow[] | null = res.ok ? await res.json() : null;
      if (!data) {
        setLoadError("Không tải được dữ liệu.");
        return;
      }
      setRows(orderForDisplay(data));
    });
  }, [venueId, router]);

  function updateRow(dayOfWeek: number, patch: Partial<OperatingHourRow>) {
    setRows((prev) => (prev ?? []).map((row) => (row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row)));
  }

  function handleToggle(dayOfWeek: number, isOpen: boolean) {
    updateRow(
      dayOfWeek,
      isOpen ? { isOpen, openTime: "06:00", closeTime: "22:00" } : { isOpen, openTime: null, closeTime: null },
    );
  }

  async function handleSubmit() {
    if (!venueId || !rows) return;
    const error = validateOperatingHours(rows);
    if (error) {
      toast.error(error);
      return;
    }
    setSubmitting(true);
    const response = await fetch(`/api/venues/mine/${venueId}/operating-hours`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows),
    });
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fowner%2Fsettings");
      return;
    }
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      toast.error(data?.message ?? "Có lỗi xảy ra, vui lòng thử lại.");
      return;
    }
    setRows(orderForDisplay(data));
    toast.success("Đã lưu thay đổi");
  }

  if (!resolved) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }
  if (!venueId) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có chi nhánh nào, tạo chi nhánh trước ở mục Chi nhánh.
      </p>
    );
  }
  if (loadError) {
    return <p className="text-sm text-muted-foreground">{loadError}</p>;
  }
  if (!rows) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {rows.map((row) => (
          <div
            key={row.dayOfWeek}
            className="flex flex-wrap items-center gap-4 border-b pb-3 last:border-b-0 last:pb-0"
          >
            <Switch checked={row.isOpen} onCheckedChange={(checked) => handleToggle(row.dayOfWeek, checked)} />
            <span className="w-20 shrink-0 text-sm font-medium">{DAY_LABELS[row.dayOfWeek]}</span>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={row.openTime ?? ""}
                disabled={!row.isOpen}
                onChange={(e) => updateRow(row.dayOfWeek, { openTime: e.target.value })}
                className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="text-sm text-muted-foreground">-</span>
              <input
                type="time"
                value={row.closeTime ?? ""}
                disabled={!row.isOpen}
                onChange={(e) => updateRow(row.dayOfWeek, { closeTime: e.target.value })}
                className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
        ))}

        <div className="flex justify-end pt-2">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
          >
            Lưu
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
