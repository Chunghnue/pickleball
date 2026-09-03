"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { NotificationSettings } from "./types";

const ROWS: { key: keyof NotificationSettings; title: string; description: string }[] = [
  { key: "newBooking", title: "Đặt lịch mới", description: "Nhận thông báo khi có khách đặt sân." },
  { key: "cancellation", title: "Hủy lịch", description: "Nhận thông báo khi khách hủy lịch đặt." },
  { key: "payment", title: "Thanh toán", description: "Nhận thông báo xác nhận thanh toán." },
  { key: "dailyReport", title: "Báo cáo ngày", description: "Nhận tóm tắt doanh thu cuối ngày." },
];

export function NotificationsTab() {
  const router = useRouter();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    toast.success("Đã lưu");
  }

  if (loadError) {
    return <p className="text-sm text-muted-foreground">{loadError}</p>;
  }
  if (!settings) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        {ROWS.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between gap-4 border-b pb-4 last:border-b-0 last:pb-0"
          >
            <div>
              <p className="text-sm font-semibold">{row.title}</p>
              <p className="text-sm text-muted-foreground">{row.description}</p>
            </div>
            <Switch checked={settings[row.key]} onCheckedChange={(checked) => handleToggle(row.key, checked)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
