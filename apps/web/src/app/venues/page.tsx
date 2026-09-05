"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ImageOff,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";

const PAGE_SIZE = 20;

interface PublicVenue {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string | null;
  courtsCount: number;
  logoUrl: string | null;
}

interface CityOption {
  city: string;
  count: number;
}

type SortOption = "" | "name" | "courts" | "city";

export default function VenuesSearchPage() {
  return (
    <>
      <PublicHeader />
      <Suspense>
        <VenuesSearchPageContent />
      </Suspense>
      <PublicFooter />
    </>
  );
}

function VenuesSearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const date = searchParams.get("date");
  const time = searchParams.get("time");

  const [query, setQuery] = useState(searchParams.get("query") ?? "");
  const [city, setCity] = useState("");
  const [sort, setSort] = useState<SortOption>("");
  const [page, setPage] = useState(1);
  const [venues, setVenues] = useState<PublicVenue[] | null>(null);
  const [total, setTotal] = useState(0);
  const [cities, setCities] = useState<CityOption[] | null>(null);

  const hasFilters = query !== "" || city !== "" || sort !== "";

  useEffect(() => {
    fetch("/api/venues/cities")
      .then((res) => res.json())
      .then((data) => setCities(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [query, city, sort]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      if (date) params.set("date", date);
      if (time) params.set("time", time);
      if (city) params.set("city", city);
      if (sort) params.set("sort", sort);
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      fetch(`/api/venues?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          setVenues(Array.isArray(data.items) ? data.items : []);
          setTotal(typeof data.total === "number" ? data.total : 0);
        });
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, city, sort, page, date, time]);

  function clearDateTimeFilter() {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    const qs = params.toString();
    router.push(`/venues${qs ? `?${qs}` : ""}`);
  }

  function clearFilters() {
    setQuery("");
    setCity("");
    setSort("");
  }

  return (
    <main className="flex flex-1 flex-col">
      <section className="bg-gradient-to-br from-green-950 via-green-900 to-emerald-950 px-4 pt-10 pb-8 text-white">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
          <nav className="flex items-center gap-1.5 text-sm text-white/60">
            <Link href="/" className="hover:text-white hover:underline">
              Trang chủ
            </Link>
            <span>›</span>
            <span className="text-white/80">Tìm sân</span>
          </nav>
          <h1 className="flex items-center gap-2 text-3xl font-extrabold sm:text-4xl">
            <Search className="size-7 shrink-0 sm:size-8" />
            Tìm sân thể thao
          </h1>
          {venues !== null && (
            <p className="text-white/70">
              Tìm thấy{" "}
              <span className="font-bold text-green-400">{total}</span> cơ sở
              phù hợp
            </p>
          )}
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-6 w-full max-w-5xl px-4">
        <div className="rounded-2xl bg-card p-5 shadow-md ring-1 ring-foreground/10">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label
                htmlFor="query"
                className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                <Search className="size-3.5" />
                Tên sân, khu vực...
              </Label>
              <Input
                id="query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="city"
                className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                <MapPin className="size-3.5" />
                Thành phố
              </Label>
              <select
                id="city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="h-9 w-full rounded-lg border px-2.5 text-sm sm:w-48"
              >
                <option value="">Tất cả thành phố</option>
                {cities?.map((option) => (
                  <option key={option.city} value={option.city}>
                    {option.city} ({option.count})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="sort"
                className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                <SlidersHorizontal className="size-3.5" />
                Sắp xếp
              </Label>
              <select
                id="sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortOption)}
                className="h-9 w-full rounded-lg border px-2.5 text-sm sm:w-40"
              >
                <option value="">Mới nhất</option>
                <option value="name">Tên A-Z</option>
                <option value="courts">Nhiều sân nhất</option>
                <option value="city">Theo tỉnh thành</option>
              </select>
            </div>
            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                onClick={clearFilters}
                className="gap-1.5 text-muted-foreground"
              >
                <X className="size-4" />
                Xóa lọc
              </Button>
            )}
          </div>

          {date && time && (
            <div className="mt-3 flex w-fit items-center gap-2 rounded-full bg-green-50 py-1 pl-3 pr-1 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-400">
              Đang lọc sân trống lúc {time} ngày{" "}
              {date.split("-").reverse().join("/")}
              <button
                type="button"
                onClick={clearDateTimeFilter}
                aria-label="Bỏ lọc theo ngày/giờ"
                className="flex size-5 items-center justify-center rounded-full hover:bg-green-100 dark:hover:bg-green-900/60"
              >
                <X className="size-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 py-8">
        {venues === null && (
          <p className="text-muted-foreground">Đang tải...</p>
        )}
        {venues !== null && venues.length === 0 && (
          <p className="text-muted-foreground">
            Không tìm thấy sân nào phù hợp.
          </p>
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {venues?.map((venue) => (
            <Link key={venue.id} href={`/venues/${venue.id}`}>
              <Card className="h-full gap-0 overflow-hidden rounded-2xl py-0 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
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
                <CardContent className="flex flex-1 flex-col gap-2 p-4">
                  <h3 className="font-bold">{venue.name}</h3>
                  <p className="flex items-start gap-1 text-sm text-muted-foreground">
                    <MapPin className="mt-0.5 size-3.5 shrink-0" />
                    {venue.district ? `${venue.district}, ` : ""}
                    {venue.city}
                  </p>
                  <p className="text-right text-xs text-muted-foreground">
                    {venue.courtsCount} sân
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t pt-4 text-sm text-muted-foreground">
            <span>{total} cơ sở</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setPage((p) => p - 1)}
                disabled={page <= 1}
              >
                Trước
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => setPage((p) => p + 1)}
                disabled={page * PAGE_SIZE >= total}
              >
                Sau
              </Button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
