"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarPlus,
  MapPin,
  Plus,
  Settings,
  UserPlus,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getGreeting } from "@/lib/greeting";
import type { BookingStatus } from "@/app/owner/venues/[id]/bookings-section";
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
  { href: "/owner", label: "Quản lý sân", icon: MapPin },
  { href: "/owner/bookings", label: "Tạo lịch đặt", icon: CalendarPlus },
  { href: "/owner/customers", label: "Thêm khách", icon: UserPlus },
  { href: "/owner/revenue", label: "Báo cáo", icon: BarChart3 },
  { href: "/owner/settings", label: "Cài đặt", icon: Settings },
];

export default function OwnerDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/dashboard/summary");
      if (response.status === 401) {
        router.push("/login?returnTo=%2Fowner%2Fdashboard");
        return;
      }
      const data = await response.json().catch(() => null);
      setSummary(data);
    }
    load();
  }, [router]);

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{getGreeting(new Date())} 👋</h1>
        <Link href="/owner/bookings" className={buttonVariants()}>
          <Plus />
          Đặt sân mới
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Icon />
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
