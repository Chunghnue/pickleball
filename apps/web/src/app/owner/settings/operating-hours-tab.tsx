"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useSettingsVenueId } from "./use-settings-venue-id";
import { orderForDisplay, validateOperatingHours, DAY_LABELS } from "./operating-hours-format";
import type { OperatingHourRow } from "./types";

const WEEKEND_DAYS = new Set([0, 6]); // Chủ Nhật, Thứ 7

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
      <CardHeader>
        <CardTitle className="text-base font-semibold">Giờ hoạt động</CardTitle>
        <CardDescription>Cài đặt giờ mở cửa và đóng cửa</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.map((row) => (
          <div
            key={row.dayOfWeek}
            className="flex flex-wrap items-center gap-4 rounded-lg bg-muted/50 px-4 py-3.5"
          >
            <Switch
              checked={row.isOpen}
              onCheckedChange={(checked) => handleToggle(row.dayOfWeek, checked)}
              className="data-[checked]:bg-green-500"
            />
            <span
              className={cn(
                "w-20 shrink-0 text-sm font-semibold",
                WEEKEND_DAYS.has(row.dayOfWeek) && "text-blue-600 dark:text-blue-400",
              )}
            >
              {DAY_LABELS[row.dayOfWeek]}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={row.openTime ?? ""}
                disabled={!row.isOpen}
                onChange={(e) => updateRow(row.dayOfWeek, { openTime: e.target.value })}
                className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="text-sm text-muted-foreground">đến</span>
              <input
                type="time"
                value={row.closeTime ?? ""}
                disabled={!row.isOpen}
                onChange={(e) => updateRow(row.dayOfWeek, { closeTime: e.target.value })}
                className="h-9 rounded-lg border border-input bg-background px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
        ))}

        <Button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="h-11 w-full gap-1.5 rounded-xl bg-blue-600 font-medium text-white hover:bg-blue-700"
        >
          <Check className="size-4" />
          Lưu
        </Button>
      </CardContent>
    </Card>
  );
}
