"use client";

import { useEffect, useState } from "react";
import { Bell, Building2, Clock, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { VenueInfoTab } from "./venue-info-tab";
import { OperatingHoursTab } from "./operating-hours-tab";
import { NotificationsTab } from "./notifications-tab";
import { AccountTab } from "./account-tab";
import type { SettingsTab } from "./types";

const TABS: { value: SettingsTab; label: string; icon: typeof Building2 }[] = [
  { value: "venue", label: "Thông tin sân", icon: Building2 },
  { value: "hours", label: "Giờ hoạt động", icon: Clock },
  { value: "notifications", label: "Thông báo", icon: Bell },
  { value: "account", label: "Tài khoản", icon: User },
];

function isSettingsTab(value: string | null): value is SettingsTab {
  return value === "venue" || value === "hours" || value === "notifications" || value === "account";
}

export default function OwnerSettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("venue");

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (isSettingsTab(tab)) {
      setActiveTab(tab);
    }
  }, []);

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div>
        <h1 className="text-2xl font-bold">Cài đặt hệ thống</h1>
        <p className="text-sm text-muted-foreground">
          Cấu hình thông tin sân, giờ hoạt động, thông báo và tài khoản
        </p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <nav className="flex w-full shrink-0 flex-col gap-1 md:w-56">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium",
                  active
                    ? "bg-blue-50 font-semibold text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">
          {activeTab === "venue" && <VenueInfoTab />}
          {activeTab === "hours" && <OperatingHoursTab />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "account" && <AccountTab />}
        </div>
      </div>
    </main>
  );
}
