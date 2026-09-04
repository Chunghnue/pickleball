"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 20;

interface PublicVenue {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string | null;
  courtsCount: number;
}

interface CityOption {
  city: string;
  count: number;
}

type SortOption = "" | "name" | "courts" | "city";

export default function VenuesSearchPage() {
  return (
    <Suspense>
      <VenuesSearchPageContent />
    </Suspense>
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

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">Tìm sân</h1>

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1 space-y-2">
          <Label htmlFor="query">Tìm theo tên, địa chỉ hoặc thành phố</Label>
          <Input
            id="query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">Thành phố</Label>
          <select
            id="city"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className="h-9 rounded-lg border px-2.5 text-sm"
          >
            <option value="">Tất cả thành phố</option>
            {cities?.map((option) => (
              <option key={option.city} value={option.city}>
                {option.city} ({option.count})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sort">Sắp xếp</Label>
          <select
            id="sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOption)}
            className="h-9 rounded-lg border px-2.5 text-sm"
          >
            <option value="">Mới nhất</option>
            <option value="name">Tên A-Z</option>
            <option value="courts">Nhiều sân nhất</option>
            <option value="city">Theo tỉnh thành</option>
          </select>
        </div>
      </div>

      {date && time && (
        <div className="flex w-fit items-center gap-2 rounded-full bg-green-50 py-1 pl-3 pr-1 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-400">
          Đang lọc sân trống lúc {time} ngày {date.split("-").reverse().join("/")}
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

      {venues === null && <p>Đang tải...</p>}
      {venues !== null && venues.length === 0 && (
        <p className="text-muted-foreground">Không tìm thấy sân nào phù hợp.</p>
      )}

      <div className="flex flex-col gap-4">
        {venues?.map((venue) => (
          <Link key={venue.id} href={`/venues/${venue.id}`}>
            <Card className="transition-colors hover:bg-muted">
              <CardHeader>
                <CardTitle className="text-base">{venue.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {venue.district ? `${venue.district}, ` : ""}
                  {venue.city}
                </span>
                <span className="text-sm text-muted-foreground">
                  {venue.courtsCount} sân
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} cơ sở</span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
            >
              Trước
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * PAGE_SIZE >= total}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
