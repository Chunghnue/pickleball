"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  MapPin,
  Plus,
  Settings,
  TrendingUp,
  UserPlus,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getGreeting } from "@/lib/greeting";
import { ALL_BRANCHES_ID, useBranch } from "@/lib/branch-context";
import type { BookingStatus } from "@/app/owner/bookings/types";
import { StatCards } from "./stat-cards";
import { RevenueChart } from "./revenue-chart";
import { CourtRevenueChart } from "./court-revenue-chart";
import { RecentBookings } from "./recent-bookings";

interface DashboardSummary {
  todayBookingsCount: number;
  todayRevenue: number;
  courts: { active: number; total: number };
  newCustomersThisMonth: number;
  revenueByDay: { date: string; revenue: number }[];
  revenueByCourt: { courtId: string; courtName: string; revenue: number }[];
  recentBookings: {
    id: string;
    customerName: string;
    customerPhone: string | null;
    courtName: string;
    date: string;
    startTime: string;
    endTime: string;
    totalPrice: number;
    status: BookingStatus;
  }[];
}

const QUICK_ACTIONS = [
  {
    href: "/owner",
    label: "Quản lý sân",
    icon: MapPin,
    color: "text-blue-600 dark:text-blue-400",
  },
  {
    href: "/owner/bookings",
    label: "Tạo lịch đặt",
    icon: CalendarPlus,
    color: "text-green-600 dark:text-green-400",
  },
  {
    href: "/owner/customers",
    label: "Thêm khách",
    icon: UserPlus,
    color: "text-violet-600 dark:text-violet-400",
  },
  {
    href: "/owner/revenue",
    label: "Báo cáo",
    icon: TrendingUp,
    color: "text-amber-600 dark:text-amber-400",
  },
  {
    href: "/owner/settings",
    label: "Cài đặt",
    icon: Settings,
    color: "text-muted-foreground",
  },
];

export default function OwnerDashboardPage() {
  const router = useRouter();
  const { selectedVenueId } = useBranch();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    async function load() {
      const qs =
        selectedVenueId === ALL_BRANCHES_ID ? "" : `?venueId=${selectedVenueId}`;
      const response = await fetch(`/api/dashboard/summary${qs}`);
      if (response.status === 401) {
        router.push("/login?returnTo=%2Fowner%2Fdashboard");
        return;
      }
      const data = await response.json().catch(() => null);
      setSummary(data);
    }
    load();
  }, [router, selectedVenueId]);

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{getGreeting(new Date())} 👋</h1>
        <Link
          href="/owner/bookings"
          className={cn(
            buttonVariants(),
            "h-11 gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700",
          )}
        >
          <Plus className="size-4" />
          Đặt sân mới
        </Link>
      </div>

      <div className="flex flex-wrap gap-3">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-11 gap-2 rounded-xl px-4 text-sm font-medium",
              )}
            >
              <Icon className={cn("size-4", action.color)} />
              {action.label}
            </Link>
          );
        })}
      </div>

      {summary === null && <p>Đang tải...</p>}

      {summary !== null && (
        <>
          <StatCards
            todayBookingsCount={summary.todayBookingsCount}
            todayRevenue={summary.todayRevenue}
            courts={summary.courts}
            newCustomersThisMonth={summary.newCustomersThisMonth}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <RevenueChart revenueByDay={summary.revenueByDay} />
            <CourtRevenueChart revenueByCourt={summary.revenueByCourt} />
          </div>
          <RecentBookings recentBookings={summary.recentBookings} />
        </>
      )}
    </main>
  );
}
