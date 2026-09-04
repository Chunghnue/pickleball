"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Building2, MapPin, PanelLeft, PanelLeftClose, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
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
  const hasFilters = query !== "" || city !== "";

  function clearFilters() {
    setQuery("");
    setCity("");
  }

  return (
    <>
      <PublicHeader />
      <main className="flex flex-1 flex-col">
        <div className="border-b bg-gradient-to-br from-green-950 via-green-900 to-emerald-950 px-4 py-4">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-end gap-3">
            <div className="min-w-[200px] flex-1 space-y-1.5">
              <Label
                htmlFor="query"
                className="flex items-center gap-1 text-xs font-semibold tracking-wide text-green-300 uppercase"
              >
                <Search className="size-3.5" />
                Tìm cơ sở theo tên, quận, thành phố...
              </Label>
              <Input
                id="query"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="border-white/20 bg-white/95"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="city"
                className="flex items-center gap-1 text-xs font-semibold tracking-wide text-green-300 uppercase"
              >
                <MapPin className="size-3.5" />
                Thành phố
              </Label>
              <select
                id="city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="h-9 w-full rounded-lg border border-white/20 bg-white/95 px-2.5 text-sm sm:w-48"
              >
                <option value="">Tất cả thành phố</option>
                {cities?.map((option) => (
                  <option key={option.city} value={option.city}>
                    {option.city} ({option.count})
                  </option>
                ))}
              </select>
            </div>
            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                onClick={clearFilters}
                className="gap-1.5 text-white/70 hover:bg-white/10 hover:text-white"
              >
                <X className="size-4" />
                Xóa lọc
              </Button>
            )}
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-green-800/60 px-3 py-1.5 text-xs font-semibold text-green-300">
              <Building2 className="size-3.5" />
              Bản đồ hiển thị {pinCount} cơ sở thể thao
            </span>
          </div>
        </div>

        <div className="relative flex min-h-[600px] flex-1">
          <div className="relative flex-1">
            {venues !== null && <VenueMap venues={venues} />}
            {!listOpen && (
              <button
                type="button"
                onClick={() => setListOpen(true)}
                className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-sm font-medium shadow-md ring-1 ring-foreground/10 hover:bg-accent"
              >
                <PanelLeft className="size-4" />
                Danh sách
              </button>
            )}
          </div>

          {listOpen && (
            <aside className="flex w-80 shrink-0 flex-col border-l bg-card">
              <div className="flex items-center justify-between border-b p-3">
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <Building2 className="size-4 text-green-600 dark:text-green-400" />
                  {venues?.length ?? 0} cơ sở
                </span>
                <button
                  type="button"
                  onClick={() => setListOpen(false)}
                  className="flex items-center gap-1 rounded-full px-2 py-1 text-sm text-muted-foreground hover:bg-accent"
                >
                  Ẩn
                  <PanelLeftClose className="size-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {venues === null && <p className="p-4 text-muted-foreground">Đang tải...</p>}
                {venues !== null && venues.length === 0 && (
                  <p className="p-4 text-muted-foreground">Không tìm thấy cơ sở nào phù hợp.</p>
                )}
                <ul className="divide-y">
                  {venues?.map((venue) => (
                    <li key={venue.id} className="flex flex-col gap-2 p-4 transition-colors hover:bg-accent/50">
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold">{venue.name}</span>
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="size-3.5 shrink-0" />
                          {venue.district ? `${venue.district}, ` : ""}
                          {venue.city}
                        </span>
                        <span className="text-xs text-muted-foreground">{venue.courtsCount} sân</span>
                      </div>
                      <Link
                        href={`/venues/${venue.id}`}
                        className={cn(
                          buttonVariants({ variant: "outline", size: "sm" }),
                          "w-fit rounded-full",
                        )}
                      >
                        Chi tiết
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>
          )}
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
