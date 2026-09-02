"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { filterBranches, sortBranches, countByTab } from "./branch-format";
import { BranchMetrics } from "./branch-metrics";
import { BranchFilters } from "./branch-filters";
import { BranchFormDialog } from "./branch-form-dialog";
import { BranchCard } from "./branch-card";
import { BranchRow } from "./branch-row";
import type { BranchListItem, BranchTab, BranchSort } from "./types";

const VIEW_MODE_STORAGE_KEY = "branches-view-mode";

export default function OwnerBranchesPage() {
  const router = useRouter();

  const [allItems, setAllItems] = useState<BranchListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<BranchTab>("active");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<BranchSort>("default");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    if (localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "list") {
      setViewMode("list");
    }
  }, []);

  function handleViewModeChange(mode: "grid" | "list") {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadBranches = useCallback(() => {
    fetch("/api/venues/mine").then(async (res) => {
      if (res.status === 401) {
        router.push("/login?returnTo=%2Fowner%2Fbranches");
        return;
      }
      if (!res.ok) {
        setLoadError("Không tải được dữ liệu.");
        return;
      }
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) {
        setAllItems(data);
        setLoadError(null);
      } else {
        setLoadError("Không tải được dữ liệu.");
      }
    });
  }, [router]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const displayItems = sortBranches(
    filterBranches(allItems ?? [], { tab, search: debouncedSearch }),
    sort,
  );
  const counts = countByTab(allItems ?? []);

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Chi nhánh</h1>
        <BranchFormDialog
          mode="create"
          onSaved={loadBranches}
          trigger={
            <Button type="button" className="h-10 gap-2 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700">
              <Plus className="size-4" />
              Thêm chi nhánh mới
            </Button>
          }
        />
      </div>

      {loadError && (
        <div className="rounded-xl border border-input bg-card p-6 text-center text-sm text-muted-foreground">
          {loadError}
        </div>
      )}

      {!loadError && allItems && (
        <>
          <BranchMetrics items={allItems} />
          <BranchFilters
            tab={tab}
            search={search}
            sort={sort}
            viewMode={viewMode}
            counts={counts}
            onTabChange={setTab}
            onSearchChange={setSearch}
            onSortChange={setSort}
            onViewModeChange={handleViewModeChange}
          />

          {displayItems.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              {allItems.length === 0 ? "Bạn chưa có chi nhánh nào." : "Không tìm thấy chi nhánh phù hợp."}
            </p>
          )}

          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayItems.map((venue) => (
                <BranchCard key={venue.id} venue={venue} onSaved={loadBranches} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {displayItems.map((venue) => (
                <BranchRow key={venue.id} venue={venue} onSaved={loadBranches} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
