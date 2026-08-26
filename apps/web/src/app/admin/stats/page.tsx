"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminNav } from "@/components/admin-nav";

interface AdminStats {
  owners: { total: number; active: number; pendingApproval: number };
  venues: { total: number; active: number; pendingApproval: number };
  courts: { total: number; active: number };
  todayBookingsCount: number;
  todayRevenue: number;
  newCustomersThisMonth: number;
  revenueByDay: { date: string; revenue: number }[];
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export default function AdminStatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/admin/stats");
      if (response.status === 401) {
        router.push("/login?returnTo=%2Fadmin%2Fstats");
        return;
      }
      const data = await response.json().catch(() => null);
      setStats(data);
    }
    load();
  }, [router]);

  const maxRevenue = stats
    ? Math.max(...stats.revenueByDay.map((d) => d.revenue), 1)
    : 1;

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 p-8">
      <AdminNav />
      <h1 className="text-2xl font-bold">Thống kê nền tảng</h1>

      {stats === null && <p>Đang tải...</p>}

      {stats !== null && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  Chủ sân
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.owners.total}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.owners.active} hoạt động · {stats.owners.pendingApproval} chờ duyệt
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  Chi nhánh
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.venues.total}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.venues.active} hoạt động · {stats.venues.pendingApproval} chờ duyệt
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Sân</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.courts.total}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.courts.active} đang hoạt động
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  Booking hôm nay
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.todayBookingsCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  Doanh thu hôm nay
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {currencyFormatter.format(stats.todayRevenue)} đ
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  Khách mới tháng này
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.newCustomersThisMonth}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                Doanh thu 30 ngày gần nhất
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-32 items-end gap-1">
                {stats.revenueByDay.map((day) => (
                  <div
                    key={day.date}
                    title={`${day.date}: ${currencyFormatter.format(day.revenue)} đ`}
                    className="flex-1 rounded-t bg-primary"
                    style={{
                      height: `${Math.max((day.revenue / maxRevenue) * 100, 2)}%`,
                    }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
