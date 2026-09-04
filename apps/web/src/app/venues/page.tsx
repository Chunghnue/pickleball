"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PublicVenue {
  id: string;
  name: string;
  address: string;
  city: string;
}

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
  const [venues, setVenues] = useState<PublicVenue[] | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      if (date) params.set("date", date);
      if (time) params.set("time", time);
      const qs = params.toString();
      fetch(`/api/venues${qs ? `?${qs}` : ""}`)
        .then((res) => res.json())
        .then((data) => setVenues(Array.isArray(data) ? data : []));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, date, time]);

  function clearDateTimeFilter() {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    const qs = params.toString();
    router.push(`/venues${qs ? `?${qs}` : ""}`);
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">Tìm sân</h1>

      <div className="space-y-2">
        <Label htmlFor="query">Tìm theo tên, địa chỉ hoặc thành phố</Label>
        <Input
          id="query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
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
              <CardContent>
                <span className="text-sm text-muted-foreground">
                  {venue.address}, {venue.city}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
