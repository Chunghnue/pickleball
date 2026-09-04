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
        <section className="flex flex-col items-center gap-6 px-4 py-16 text-center">
          <h1 className="text-3xl font-bold">Đặt sân pickleball nhanh chóng</h1>
          <p className="text-muted-foreground">
            Tìm và đặt sân trống gần bạn chỉ trong vài giây.
          </p>
          <div className="flex w-full max-w-md gap-2">
            <Input
              placeholder="Tìm theo tên hoặc địa điểm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSearch();
              }}
            />
            <Button onClick={handleSearch}>Tìm ngay</Button>
          </div>
          {venues !== null && (
            <p className="text-sm text-muted-foreground">
              {summary.venueCount} cơ sở · {summary.courtCount} sân
            </p>
          )}
        </section>

        <section className="flex flex-col gap-4 px-4 py-8">
          <h2 className="text-xl font-bold">Cơ sở nổi bật</h2>
          {venues === null && <p className="text-muted-foreground">Đang tải...</p>}
          {venues !== null && venues.length === 0 && (
            <p className="text-muted-foreground">Chưa có cơ sở nào.</p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {summary.featured.map((venue) => (
              <Link key={venue.id} href={`/venues/${venue.id}`}>
                <Card className="h-full transition-colors hover:bg-muted">
                  <CardHeader>
                    <CardTitle className="text-base">{venue.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      {venue.address}, {venue.city}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {venue.courtsCount} sân
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-6 px-4 py-8">
          <h2 className="text-center text-xl font-bold">
            Đặt sân chỉ với 3 bước
          </h2>
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">1</p>
              <p className="font-medium">Tìm sân gần bạn</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">2</p>
              <p className="font-medium">Chọn ngày & giờ</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">3</p>
              <p className="font-medium">Xác nhận & đến sân</p>
            </div>
          </div>
        </section>

        {summary.cities.length > 0 && (
          <section className="flex flex-col gap-4 px-4 py-8">
            <h2 className="text-xl font-bold">Đặt sân theo thành phố</h2>
            <div className="flex flex-wrap gap-2">
              {summary.cities.map((city) => (
                <Link
                  key={city}
                  href={`/venues?query=${encodeURIComponent(city)}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {city}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col items-center gap-4 bg-muted px-4 py-12 text-center">
          <h2 className="text-xl font-bold">
            Phần mềm quản lý dành cho chủ sân
          </h2>
          <ul className="text-muted-foreground">
            <li>Quản lý lịch đặt sân realtime</li>
            <li>Báo cáo doanh thu chi tiết</li>
            <li>Quản lý khách hàng</li>
          </ul>
          <Link href="/register/owner" className={buttonVariants()}>
            Đăng ký chủ sân
          </Link>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
