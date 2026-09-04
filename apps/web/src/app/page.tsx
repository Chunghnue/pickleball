"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Calendar, ImageOff, ListChecks, Map, MapPin, Search, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { computeHomeSummary, type PublicVenueSummary } from "@/lib/home-summary";

export default function HomePage() {
  const router = useRouter();
  const [venues, setVenues] = useState<PublicVenueSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [dateTime, setDateTime] = useState("");

  useEffect(() => {
    fetch("/api/venues")
      .then((res) => res.json())
      .then((data) => setVenues(Array.isArray(data) ? data : []));
  }, []);

  const summary = computeHomeSummary(venues ?? []);

  function handleSearch() {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    if (dateTime) {
      const [date, time] = dateTime.split("T");
      if (date) params.set("date", date);
      if (time) params.set("time", time.slice(0, 5));
    }
    const qs = params.toString();
    router.push(`/venues${qs ? `?${qs}` : ""}`);
  }

  return (
    <>
      <PublicHeader />
      <main className="flex flex-1 flex-col">
        <section className="relative overflow-hidden bg-gradient-to-br from-green-950 via-green-900 to-emerald-950 pt-16 pb-28 text-white">
          <svg
            viewBox="0 0 200 300"
            aria-hidden="true"
            className="pointer-events-none absolute -top-10 -right-10 size-72 text-white/10 sm:size-[420px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
          >
            <rect x="30" y="10" width="140" height="180" rx="70" />
            <rect x="85" y="185" width="30" height="95" rx="10" />
            <circle cx="175" cy="235" r="20" />
            <circle cx="145" cy="280" r="14" />
          </svg>
          <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 text-center sm:text-left">
            <span className="inline-flex w-fit items-center gap-1.5 self-center rounded-full bg-green-800/60 px-3 py-1 text-xs font-semibold text-green-300 sm:self-start">
              <MapPin className="size-3.5" />
              {venues !== null
                ? `HƠN ${summary.venueCount} CƠ SỞ TRÊN TOÀN QUỐC`
                : "CƠ SỞ TRÊN TOÀN QUỐC"}
            </span>
            <h1 className="text-4xl font-extrabold sm:text-5xl">
              Đặt sân pickleball
              <br />
              <span className="text-green-400">nhanh - dễ - tiện</span>
            </h1>
            <p className="max-w-xl self-center text-white/70 sm:self-start sm:text-lg">
              Tìm và đặt sân pickleball ngay trong vài giây. Xem giá thực, lịch
              trống theo thời gian thực.
            </p>
            <div className="flex flex-wrap justify-center gap-3 sm:justify-start">
              <a
                href="#tim-san"
                className={cn(
                  buttonVariants({
                    className: "gap-1.5 rounded-full bg-white text-green-700 hover:bg-green-50",
                  }),
                )}
              >
                <Search className="size-4" />
                Tìm sân ngay
              </a>
              <Link
                href="/ban-do"
                className={cn(
                  buttonVariants({
                    variant: "outline",
                    className:
                      "gap-1.5 rounded-full border-white/40 bg-transparent text-white hover:bg-white/10",
                  }),
                )}
              >
                <Map className="size-4" />
                Xem bản đồ
              </Link>
            </div>
            {venues !== null && (
              <div className="flex justify-center gap-8 sm:justify-start">
                <div>
                  <p className="text-2xl font-bold">{summary.venueCount}</p>
                  <p className="text-sm text-white/60">Cơ sở</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.courtCount}</p>
                  <p className="text-sm text-white/60">Sân pickleball</p>
                </div>
              </div>
            )}
          </div>
        </section>

        <div
          id="tim-san"
          className="relative z-10 mx-auto -mt-16 w-full max-w-7xl scroll-mt-20 px-4"
        >
          <div className="rounded-2xl bg-card p-5 text-left shadow-md ring-1 ring-foreground/10">
            <p className="mb-4 flex items-center gap-2 font-bold">
              <Search className="size-4 text-green-600 dark:text-green-400" />
              Tìm sân pickleball ngay
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <MapPin className="size-3.5" />
                  Địa điểm
                </Label>
                <Input
                  placeholder="Quận, phường, khu vực, tên sân..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSearch();
                  }}
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <Calendar className="size-3.5" />
                  Ngày & giờ
                </Label>
                <Input
                  type="datetime-local"
                  value={dateTime}
                  onChange={(event) => setDateTime(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleSearch();
                  }}
                />
              </div>
              <Button
                onClick={handleSearch}
                className="gap-1.5 bg-green-600 text-white hover:bg-green-700"
              >
                <Search className="size-4" />
                Tìm ngay
              </Button>
            </div>
          </div>
        </div>

        <section className="bg-muted/40 px-4 pt-12 pb-12">
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

        <section className="bg-gradient-to-br from-slate-900 via-green-950 to-black px-4 py-16 text-white">
          <div className="mx-auto flex w-full max-w-7xl flex-col items-center gap-3 text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-900/60 px-2.5 py-1 text-xs font-semibold text-green-400">
              <ListChecks className="size-3.5" />
              QUY TRÌNH
            </span>
            <h2 className="text-2xl font-bold sm:text-3xl">
              Đặt sân trong 3 bước đơn giản
            </h2>
            <p className="text-sm text-white/60">
              Nhanh chóng, dễ dàng, không cần đăng ký phức tạp
            </p>

            <div className="mt-8 grid w-full grid-cols-1 items-start gap-8 sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
              <div className="flex flex-col items-center gap-3">
                <span className="flex size-12 items-center justify-center rounded-full bg-green-600 text-xl font-bold text-white">
                  1
                </span>
                <p className="font-semibold">Tìm sân gần bạn</p>
                <p className="text-sm text-white/60">
                  Nhập tên hoặc địa điểm để tìm sân phù hợp gần bạn.
                </p>
              </div>
              <ArrowRight className="mt-5 hidden size-5 text-white/30 sm:block" />
              <div className="flex flex-col items-center gap-3">
                <span className="flex size-12 items-center justify-center rounded-full bg-green-600 text-xl font-bold text-white">
                  2
                </span>
                <p className="font-semibold">Chọn ngày & giờ</p>
                <p className="text-sm text-white/60">
                  Xem khung giờ trống theo thời gian thực và chọn giờ chơi phù hợp.
                </p>
              </div>
              <ArrowRight className="mt-5 hidden size-5 text-white/30 sm:block" />
              <div className="flex flex-col items-center gap-3">
                <span className="flex size-12 items-center justify-center rounded-full bg-green-600 text-xl font-bold text-white">
                  3
                </span>
                <p className="font-semibold">Xác nhận & đến sân</p>
                <p className="text-sm text-white/60">
                  Xác nhận đặt sân, nhận email xác nhận và sẵn sàng ra sân.
                </p>
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
