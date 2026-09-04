"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ImageOff, MapPin, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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
        <section className="bg-gradient-to-b from-green-50 to-white px-4 py-16 dark:from-green-950/20 dark:to-background">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-6 text-center">
            <h1 className="text-3xl font-bold">
              Đặt sân{" "}
              <span className="text-green-600 dark:text-green-400">pickleball</span>{" "}
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
                className="bg-green-600 text-white hover:bg-green-700"
              >
                Tìm ngay
              </Button>
            </div>
            {venues !== null && (
              <p className="text-sm text-muted-foreground">
                <span className="font-bold text-green-600 dark:text-green-400">
                  {summary.venueCount}
                </span>{" "}
                cơ sở ·{" "}
                <span className="font-bold text-green-600 dark:text-green-400">
                  {summary.courtCount}
                </span>{" "}
                sân
              </p>
            )}
          </div>
        </section>

        <section className="bg-muted/40 px-4 py-12">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
            <div className="flex flex-col gap-2">
              <span className="inline-flex w-fit items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-950/50 dark:text-green-400">
                <Star className="size-3 fill-current" />
                NỔI BẬT
              </span>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-2xl font-bold">Cơ sở thể thao nổi bật</h2>
                  <p className="text-sm text-muted-foreground">
                    Các cơ sở mới nhất trên nền tảng
                  </p>
                </div>
                <Link
                  href="/venues"
                  className={cn(
                    buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className:
                        "gap-1.5 rounded-full border-green-200 text-green-700 hover:bg-green-50 dark:border-green-900 dark:text-green-400 dark:hover:bg-green-950/40",
                    }),
                  )}
                >
                  Xem tất cả
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>

            {venues === null && <p className="text-muted-foreground">Đang tải...</p>}
            {venues !== null && venues.length === 0 && (
              <p className="text-muted-foreground">Chưa có cơ sở nào.</p>
            )}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {summary.featured.map((venue) => (
                <Card
                  key={venue.id}
                  className="h-full gap-0 overflow-hidden rounded-2xl py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="relative aspect-video w-full bg-muted">
                    {venue.logoUrl ? (
                      <img
                        src={venue.logoUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <ImageOff className="size-8" />
                      </div>
                    )}
                  </div>
                  <CardContent className="flex flex-1 flex-col gap-3 p-4">
                    <div className="flex-1 space-y-1">
                      <h3 className="font-bold">{venue.name}</h3>
                      <p className="flex items-start gap-1 text-sm text-muted-foreground">
                        <MapPin className="mt-0.5 size-3.5 shrink-0" />
                        {venue.address}, {venue.city}
                      </p>
                    </div>
                    <p className="text-right text-xs text-muted-foreground">
                      {venue.courtsCount} sân
                    </p>
                    <Link
                      href={`/venues/${venue.id}`}
                      className={cn(
                        buttonVariants({
                          className: "w-full rounded-full bg-green-600 text-white hover:bg-green-700",
                        }),
                      )}
                    >
                      Xem chi tiết
                    </Link>
                  </CardContent>
                </Card>
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
                <p className="mx-auto flex size-12 items-center justify-center rounded-full bg-green-600 text-xl font-bold text-white">
                  1
                </p>
                <p className="mt-3 font-medium">Tìm sân gần bạn</p>
              </div>
              <div className="text-center">
                <p className="mx-auto flex size-12 items-center justify-center rounded-full bg-green-600 text-xl font-bold text-white">
                  2
                </p>
                <p className="mt-3 font-medium">Chọn ngày & giờ</p>
              </div>
              <div className="text-center">
                <p className="mx-auto flex size-12 items-center justify-center rounded-full bg-green-600 text-xl font-bold text-white">
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
                    className={cn(
                      buttonVariants({
                        variant: "outline",
                        size: "sm",
                        className:
                          "rounded-full border-green-200 bg-green-50 text-green-600 hover:bg-green-100 dark:border-green-900 dark:bg-green-950/40 dark:text-green-400 dark:hover:bg-green-950/60",
                      }),
                    )}
                  >
                    {city}
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="bg-green-600 px-4 py-14 text-white">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-4 text-center">
            <h2 className="text-xl font-bold">
              Phần mềm quản lý dành cho chủ sân
            </h2>
            <ul className="text-green-50">
              <li>Quản lý lịch đặt sân realtime</li>
              <li>Báo cáo doanh thu chi tiết</li>
              <li>Quản lý khách hàng</li>
            </ul>
            <Link
              href="/register/owner"
              className={cn(
                buttonVariants({
                  className: "bg-white text-green-600 hover:bg-green-50",
                }),
              )}
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
