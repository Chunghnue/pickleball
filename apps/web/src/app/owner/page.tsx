"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Grid3x3, List, Plus, Search, Volleyball } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ALL_BRANCHES_ID, useBranch } from "@/lib/branch-context";
import { CourtMetrics } from "./court-metrics";
import { CourtTable } from "./court-table";
import { CourtGrid } from "./court-grid";
import { CourtFormDialog } from "./court-form-dialog";
import type { Court, CourtWithVenueName } from "./types";

interface VenueOption {
  id: string;
  name: string;
}

const VIEW_STORAGE_KEY = "courts-view-mode";

export default function OwnerCourtsPage() {
  const router = useRouter();
  const { selectedVenueId } = useBranch();
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [courts, setCourts] = useState<(Court | CourtWithVenueName)[] | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const [sportTab, setSportTab] = useState<"all" | "pickleball">("all");

  useEffect(() => {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "grid" || stored === "table") {
      setViewMode(stored);
    }
  }, []);

  function changeViewMode(mode: "table" | "grid") {
    setViewMode(mode);
    localStorage.setItem(VIEW_STORAGE_KEY, mode);
  }

  useEffect(() => {
    fetch("/api/venues/mine")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner");
          return null;
        }
        return (await res.json()) as VenueOption[];
      })
      .then((data) => {
        if (data) setVenues(data);
      });
  }, [router]);

  useEffect(() => {
    setCourts(null);
    const url =
      selectedVenueId === ALL_BRANCHES_ID
        ? "/api/venues/mine/courts"
        : `/api/venues/mine/${selectedVenueId}/courts`;
    fetch(url)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCourts(Array.isArray(data) ? data : []));
  }, [selectedVenueId]);

  const filteredCourts = useMemo(() => {
    if (!courts) return [];
    const query = search.trim().toLowerCase();
    if (!query) return courts;
    return courts.filter(
      (court) =>
        court.name.toLowerCase().includes(query) ||
        (court.description ?? "").toLowerCase().includes(query),
    );
  }, [courts, search]);

  const total = courts?.length ?? 0;
  const activeCount = courts?.filter((court) => court.status === "active").length ?? 0;

  function handleCourtCreated(court: Court) {
    setCourts((previous) => (previous ? [...previous, court] : [court]));
  }

  function handleCourtUpdated(court: Court) {
    setCourts((previous) =>
      previous
        ? previous.map((item) => (item.id === court.id ? { ...item, ...court } : item))
        : previous,
    );
  }

  function handleCourtDeleted(courtId: string) {
    setCourts((previous) => previous?.filter((item) => item.id !== courtId) ?? previous);
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Quản lý sân</h1>
          <p className="text-sm text-muted-foreground">
            Tổng cộng {total} sân · {activeCount} hoạt động
          </p>
        </div>
        {venues.length > 0 && (
          <CourtFormDialog
            mode="create"
            venues={venues}
            defaultVenueId={selectedVenueId === ALL_BRANCHES_ID ? undefined : selectedVenueId}
            onSaved={handleCourtCreated}
            trigger={
              <Button className="h-10 gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">
                <Plus className="size-4" />
                Thêm sân mới
              </Button>
            }
          />
        )}
      </div>

      {venues.length === 0 && (
        <p className="text-muted-foreground">
          Bạn chưa có chi nhánh nào.{" "}
          <Link href="/owner/branches/new" className="text-primary underline">
            Tạo chi nhánh mới
          </Link>{" "}
          trước khi thêm sân.
        </p>
      )}

      {courts && <CourtMetrics courts={courts} />}

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSportTab("all")}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-medium",
                sportTab === "all"
                  ? "bg-blue-600 text-white"
                  : "border text-muted-foreground hover:bg-muted",
              )}
            >
              Tất cả ({total})
            </button>
            <button
              type="button"
              onClick={() => setSportTab("pickleball")}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium",
                sportTab === "pickleball"
                  ? "bg-blue-600 text-white"
                  : "border text-muted-foreground hover:bg-muted",
              )}
            >
              <Volleyball className="size-3.5 text-pink-500" />
              Pickleball ({total})
            </button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Tìm tên sân, mô tả..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-10 w-full rounded-lg border bg-muted/40 pl-9 pr-3 text-sm outline-none"
              />
            </div>
            <div className="flex h-10 gap-1 rounded-lg border p-1">
              <button
                type="button"
                onClick={() => changeViewMode("grid")}
                aria-label="Dạng lưới"
                className={cn(
                  "flex size-8 items-center justify-center rounded-md",
                  viewMode === "grid" ? "bg-blue-600 text-white" : "text-muted-foreground",
                )}
              >
                <Grid3x3 className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => changeViewMode("table")}
                aria-label="Dạng bảng"
                className={cn(
                  "flex size-8 items-center justify-center rounded-md",
                  viewMode === "table" ? "bg-blue-600 text-white" : "text-muted-foreground",
                )}
              >
                <List className="size-4" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {courts === null && <p>Đang tải...</p>}
      {courts !== null && filteredCourts.length === 0 && (
        <p className="text-muted-foreground">Không tìm thấy sân nào.</p>
      )}
      {courts !== null && filteredCourts.length > 0 && viewMode === "table" && (
        <Card>
          <CardContent className="p-0">
            <CourtTable
              courts={filteredCourts}
              venues={venues}
              showVenueColumn={selectedVenueId === ALL_BRANCHES_ID}
              onUpdated={handleCourtUpdated}
              onDeleted={handleCourtDeleted}
            />
          </CardContent>
        </Card>
      )}
      {courts !== null && filteredCourts.length > 0 && viewMode === "grid" && (
        <CourtGrid
          courts={filteredCourts}
          venues={venues}
          showVenueBadge={selectedVenueId === ALL_BRANCHES_ID}
          onUpdated={handleCourtUpdated}
          onDeleted={handleCourtDeleted}
        />
      )}
    </main>
  );
}
