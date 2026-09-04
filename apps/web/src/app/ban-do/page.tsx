"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Building2, ImageOff, MapPin, Menu, Search, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { cn } from "@/lib/utils";
import type { VenueMapItem } from "./venue-map";

const VenueMap = dynamic(() => import("./venue-map"), { ssr: false });

interface CityOption {
  city: string;
  count: number;
}

export default function BanDoPage() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [venues, setVenues] = useState<VenueMapItem[] | null>(null);
  const [cities, setCities] = useState<CityOption[] | null>(null);
  const [listOpen, setListOpen] = useState(true);

  useEffect(() => {
    fetch("/api/venues/cities")
      .then((res) => res.json())
      .then((data) => setCities(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      if (city) params.set("city", city);
      const qs = params.toString();
      fetch(`/api/venues/map${qs ? `?${qs}` : ""}`)
        .then((res) => res.json())
        .then((data) => setVenues(Array.isArray(data) ? data : []));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, city]);

  const pinCount = venues?.filter((v) => v.latitude !== null && v.longitude !== null).length ?? 0;
  const total = venues?.length ?? 0;

  return (
    <>
      <PublicHeader />
      <main className="flex flex-1 flex-col">
        <div className="relative flex min-h-[600px] flex-1">
          {listOpen && (
            <aside className="flex w-72 shrink-0 flex-col border-r bg-card sm:w-80">
              <div className="flex items-center justify-between border-b p-3">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Building2 className="size-4 text-green-600 dark:text-green-400" />
                  {total} cơ sở
                </span>
                <button
                  type="button"
                  onClick={() => setListOpen(false)}
                  aria-label="Ẩn danh sách"
                  className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
                >
                  <X className="size-4" />
                </button>
              </div>
              {venues !== null && total > 0 && pinCount < total && (
                <p className="border-b px-3 py-2 text-xs text-muted-foreground">
                  {pinCount} cơ sở có vị trí trên bản đồ
                </p>
              )}
              <div className="flex-1 overflow-y-auto">
                {venues === null && <p className="p-4 text-muted-foreground">Đang tải...</p>}
                {venues !== null && venues.length === 0 && (
                  <p className="p-4 text-muted-foreground">Không tìm thấy cơ sở nào phù hợp.</p>
                )}
                <ul className="divide-y">
                  {venues?.map((venue) => (
                    <li key={venue.id} className="flex gap-3 p-3 transition-colors hover:bg-accent/50">
                      <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {venue.logoUrl ? (
                          <img src={venue.logoUrl} alt="" className="size-full object-cover" />
                        ) : (
                          <div className="flex size-full items-center justify-center text-muted-foreground">
                            <ImageOff className="size-5" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-1 flex-col gap-1">
                        <span className="leading-tight font-semibold">{venue.name}</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="size-3 shrink-0" />
                          {venue.district ? `${venue.district}, ` : ""}
                          {venue.city}
                        </span>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">{venue.courtsCount} sân</span>
                          <Link
                            href={`/venues/${venue.id}`}
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                              "h-7 rounded-full px-3 text-xs",
                            )}
                          >
                            Chi tiết
                          </Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          )}

          <div className="relative flex-1">
            {venues !== null && <VenueMap venues={venues} />}

            {!listOpen && (
              <button
                type="button"
                onClick={() => setListOpen(true)}
                aria-label="Hiện danh sách"
                className="absolute top-3 left-3 z-[1000] flex items-center gap-1.5 rounded-full bg-card px-3 py-2 text-sm font-medium shadow-md ring-1 ring-foreground/10 hover:bg-accent"
              >
                <Menu className="size-4" />
                {total} cơ sở
              </button>
            )}

            <div className="absolute top-3 left-1/2 z-[1000] w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2">
              <div className="flex items-center gap-1 rounded-full bg-card px-3 py-2 shadow-md ring-1 ring-foreground/10">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm cơ sở theo tên, quận, thành phố..."
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label="Xoá từ khoá"
                    className="flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-accent"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
                <div className="h-5 w-px shrink-0 bg-border" />
                <select
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  className="max-w-[8rem] shrink-0 bg-transparent text-sm outline-none sm:max-w-[10rem]"
                >
                  <option value="">Tất cả thành phố</option>
                  {cities?.map((option) => (
                    <option key={option.city} value={option.city}>
                      {option.city} ({option.count})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
