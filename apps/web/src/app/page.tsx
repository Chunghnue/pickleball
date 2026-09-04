"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { computeHomeSummary, type PublicVenueSummary } from "@/lib/home-summary";

export default function HomePage() {
  const router = useRouter();
  const [venues, setVenues] = useState<PublicVenueSummary[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch("/api/venues")
      .then((res) => res.json())
      .then((data) => setVenues(Array.isArray(data) ? data : []));
  }, []);

  const summary = computeHomeSummary(venues ?? []);

  function handleSearch() {
    router.push(
      query ? `/venues?query=${encodeURIComponent(query)}` : "/venues",
    );
  }

  return (
    <>
      <PublicHeader />
      <main className="flex flex-1 flex-col">
        <section className="bg-gradient-to-b from-blue-50 to-white px-4 py-16 dark:from-blue-950/20 dark:to-background">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-6 text-center">
            <h1 className="text-3xl font-bold">
              Đặt sân{" "}
              <span className="text-blue-600 dark:text-blue-400">pickleball</span>{" "}
              nhanh chóng
            </h1>
            <p className="text-muted-foreground">
              Tìm và đặt sân trống gần bạn chỉ trong vài giây.
            </p>
            <div className="flex w-full max-w-md gap-2 rounded-2xl bg-card p-2 shadow-md ring-1 ring-foreground/10">
              <Input
                placeholder="Tìm theo tên hoặc địa điểm"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSearch();
                }}
                className="border-none shadow-none focus-visible:ring-0"
              />
              <Button
                onClick={handleSearch}
                className="bg-blue-600 text-white hover:bg-blue-700"
              >
                Tìm ngay
              </Button>
            </div>
            {venues !== null && (
              <p className="text-sm text-muted-foreground">
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {summary.venueCount}
                </span>{" "}
                cơ sở ·{" "}
                <span className="font-bold text-blue-600 dark:text-blue-400">
                  {summary.courtCount}
                </span>{" "}
                sân
              </p>
            )}
          </div>
        </section>

        <section className="px-4 py-12">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
            <h2 className="text-xl font-bold">Cơ sở nổi bật</h2>
            {venues === null && <p className="text-muted-foreground">Đang tải...</p>}
            {venues !== null && venues.length === 0 && (
              <p className="text-muted-foreground">Chưa có cơ sở nào.</p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {summary.featured.map((venue) => (
                <Link key={venue.id} href={`/venues/${venue.id}`}>
                  <Card className="h-full rounded-2xl shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <CardHeader>
                      <CardTitle className="text-base">{venue.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {venue.address}, {venue.city}
                      </p>
                      <span className="inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                        {venue.courtsCount} sân
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-12">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
            <h2 className="text-center text-xl font-bold">
              Đặt sân chỉ với 3 bước
            </h2>
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="text-center">
                <p className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white">
                  1
                </p>
                <p className="mt-3 font-medium">Tìm sân gần bạn</p>
              </div>
              <div className="text-center">
                <p className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white">
                  2
                </p>
                <p className="mt-3 font-medium">Chọn ngày & giờ</p>
              </div>
              <div className="text-center">
                <p className="mx-auto flex size-12 items-center justify-center rounded-full bg-blue-600 text-xl font-bold text-white">
                  3
                </p>
                <p className="mt-3 font-medium">Xác nhận & đến sân</p>
              </div>
            </div>
          </div>
        </section>

        {summary.cities.length > 0 && (
          <section className="px-4 py-12">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
              <h2 className="text-xl font-bold">Đặt sân theo thành phố</h2>
              <div className="flex flex-wrap gap-2">
                {summary.cities.map((city) => (
                  <Link
                    key={city}
                    href={`/venues?query=${encodeURIComponent(city)}`}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className:
                        "rounded-full border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/60",
                    })}
                  >
                    {city}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="bg-blue-600 px-4 py-14 text-white">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-4 text-center">
            <h2 className="text-xl font-bold">
              Phần mềm quản lý dành cho chủ sân
            </h2>
            <ul className="text-blue-50">
              <li>Quản lý lịch đặt sân realtime</li>
              <li>Báo cáo doanh thu chi tiết</li>
              <li>Quản lý khách hàng</li>
            </ul>
            <Link
              href="/register/owner"
              className={buttonVariants({
                className: "bg-white text-blue-600 hover:bg-blue-50",
              })}
            >
              Đăng ký chủ sân
            </Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
