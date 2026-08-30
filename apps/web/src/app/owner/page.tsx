"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
        <h1 className="text-2xl font-bold">Danh sách sân</h1>
        {venues.length > 0 && (
          <CourtFormDialog
            mode="create"
            venues={venues}
            defaultVenueId={selectedVenueId === ALL_BRANCHES_ID ? undefined : selectedVenueId}
            onSaved={handleCourtCreated}
            trigger={<Button>+ Thêm sân mới</Button>}
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

      <div className="flex items-center justify-between gap-4">
        <input
          type="text"
          placeholder="Tìm theo tên hoặc mô tả..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-9 max-w-sm flex-1 rounded-md border bg-background px-3 text-sm outline-none"
        />
        <div className="flex gap-1 rounded-md border p-1">
          <button
            type="button"
            onClick={() => changeViewMode("table")}
            className={`rounded px-2 py-1 text-sm ${viewMode === "table" ? "bg-muted font-medium" : ""}`}
          >
            Bảng
          </button>
          <button
            type="button"
            onClick={() => changeViewMode("grid")}
            className={`rounded px-2 py-1 text-sm ${viewMode === "grid" ? "bg-muted font-medium" : ""}`}
          >
            Lưới
          </button>
        </div>
      </div>

      {courts === null && <p>Đang tải...</p>}
      {courts !== null && filteredCourts.length === 0 && (
        <p className="text-muted-foreground">Không tìm thấy sân nào.</p>
      )}
      {courts !== null && filteredCourts.length > 0 && viewMode === "table" && (
        <CourtTable
          courts={filteredCourts}
          venues={venues}
          showVenueColumn={selectedVenueId === ALL_BRANCHES_ID}
          onUpdated={handleCourtUpdated}
          onDeleted={handleCourtDeleted}
        />
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
