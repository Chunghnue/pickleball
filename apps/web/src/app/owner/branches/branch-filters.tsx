"use client";

import { Check, ChevronDown, EyeOff, LayoutGrid, LayoutList, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { BranchTab, BranchSort } from "./types";

const TABS: { value: BranchTab; label: string; icon: LucideIcon }[] = [
  { value: "active", label: "Hoạt động", icon: Check },
  { value: "hidden", label: "Đã ẩn", icon: EyeOff },
  { value: "all", label: "Tất cả", icon: LayoutList },
];

const SORT_LABELS: Record<BranchSort, string> = {
  default: "Mặc định trước",
  name: "Tên",
  newest: "Mới nhất",
};

export function BranchFilters({
  tab,
  search,
  sort,
  viewMode,
  counts,
  onTabChange,
  onSearchChange,
  onSortChange,
  onViewModeChange,
}: {
  tab: BranchTab;
  search: string;
  sort: BranchSort;
  viewMode: "grid" | "list";
  counts: Record<BranchTab, number>;
  onTabChange: (tab: BranchTab) => void;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: BranchSort) => void;
  onViewModeChange: (mode: "grid" | "list") => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Card className="flex-1">
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => {
              const active = tab === t.value;
              const Icon = t.icon;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => onTabChange(t.value)}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium",
                    active ? "bg-blue-600 text-white" : "border text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="size-3.5" />
                  {t.label}
                  <span
                    className={cn(
                      "flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs",
                      active ? "bg-white/25 text-white" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {counts[t.value]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                autoComplete="off"
                placeholder="Tìm theo tên, địa chỉ, thành phố..."
                className="h-9 w-56 border-0 px-0 focus-visible:ring-0"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium outline-none hover:bg-muted">
                {SORT_LABELS[sort]}
                <ChevronDown className="size-4 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(Object.keys(SORT_LABELS) as BranchSort[]).map((value) => (
                  <DropdownMenuItem
                    key={value}
                    onClick={() => onSortChange(value)}
                    className={cn(
                      value === sort &&
                        "bg-blue-600 text-white data-[highlighted]:bg-blue-600 data-[highlighted]:text-white",
                    )}
                  >
                    {SORT_LABELS[value]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-0.5 p-1">
          <button
            type="button"
            aria-label="Dạng lưới"
            onClick={() => onViewModeChange("grid")}
            className={cn(
              "flex size-8 items-center justify-center rounded-md",
              viewMode === "grid" ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <LayoutGrid className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Dạng danh sách"
            onClick={() => onViewModeChange("list")}
            className={cn(
              "flex size-8 items-center justify-center rounded-md",
              viewMode === "list" ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <LayoutList className="size-4" />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
