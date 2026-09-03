"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BarChart3, Ban, Check, CreditCard, TicketCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { NotificationSettings } from "./types";

const ROWS: {
  key: keyof NotificationSettings;
  title: string;
  description: string;
  icon: typeof BarChart3;
}[] = [
  { key: "newBooking", title: "Đặt lịch mới", description: "Nhận thông báo khi có khách đặt sân", icon: TicketCheck },
  { key: "cancellation", title: "Hủy lịch", description: "Nhận thông báo khi khách hủy lịch đặt", icon: Ban },
  { key: "payment", title: "Thanh toán", description: "Nhận thông báo xác nhận thanh toán", icon: CreditCard },
  { key: "dailyReport", title: "Báo cáo ngày", description: "Nhận tóm tắt doanh thu cuối ngày", icon: BarChart3 },
];

export function NotificationsTab() {
  const router = useRouter();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    fetch("/api/notification-settings/mine").then(async (res) => {
      if (res.status === 401) {
        router.push("/login?returnTo=%2Fowner%2Fsettings");
        return;
      }
      const data: NotificationSettings | null = res.ok ? await res.json() : null;
      if (!data) {
        setLoadError("Không tải được dữ liệu.");
        return;
      }
      setSettings(data);
    });
  }, [router]);

  async function handleToggle(key: keyof NotificationSettings, checked: boolean) {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, [key]: checked });
    const response = await fetch("/api/notification-settings/mine", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: checked }),
    });
    if (response.status === 401) {
      setSettings(previous);
      router.push("/login?returnTo=%2Fowner%2Fsettings");
      return;
    }
    if (!response.ok) {
      setSettings(previous);
      toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      return;
    }
  }

  // Every toggle already PATCHes and persists on change (see handleToggle) —
  // this button is a visual confirmation affordance matching the reference,
  // not a separate save step. It re-sends the already-current settings
  // (idempotent) and surfaces one toast instead of one per toggle.
  async function handleConfirm() {
    if (!settings) return;
    setConfirming(true);
    const response = await fetch("/api/notification-settings/mine", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setConfirming(false);
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fowner%2Fsettings");
      return;
    }
    if (!response.ok) {
      toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      return;
    }
    toast.success("Đã lưu cài đặt");
  }

  if (loadError) {
    return <p className="text-sm text-muted-foreground">{loadError}</p>;
  }
  if (!settings) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Cài đặt thông báo</CardTitle>
        <CardDescription>Chọn loại thông báo bạn muốn nhận</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {ROWS.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.key}
              className="flex items-center justify-between gap-4 rounded-lg bg-muted/50 px-4 py-3.5"
            >
              <div className="flex items-start gap-2.5">
                <Icon className="mt-0.5 size-4 shrink-0 text-foreground" />
                <div>
                  <p className="text-sm font-semibold">{row.title}</p>
                  <p className="text-sm text-muted-foreground">{row.description}</p>
                </div>
              </div>
              <Switch
                checked={settings[row.key]}
                onCheckedChange={(checked) => handleToggle(row.key, checked)}
                className="shrink-0 data-[checked]:bg-green-500"
              />
            </div>
          );
        })}

        <Button
          type="button"
          onClick={handleConfirm}
          disabled={confirming}
          className="h-11 w-full gap-1.5 rounded-xl bg-blue-600 font-medium text-white hover:bg-blue-700"
        >
          <Check className="size-4" />
          Lưu cài đặt
        </Button>
      </CardContent>
    </Card>
  );
}
