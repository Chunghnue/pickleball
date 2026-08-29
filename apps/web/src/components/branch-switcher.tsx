"use client";

import { useEffect, useState } from "react";
import { BarChart3, Check, ChevronRight, LayoutGrid, MapPin, Phone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Venue {
  id: string;
  name: string;
  city: string;
  phone: string | null;
  isDefault: boolean;
}

const ALL_BRANCHES_ID = "all";

export function BranchSwitcher() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedId, setSelectedId] = useState(ALL_BRANCHES_ID);

  useEffect(() => {
    fetch("/api/venues/mine")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setVenues(Array.isArray(data) ? data : []));
  }, []);

  const selectedLabel =
    selectedId === ALL_BRANCHES_ID
      ? "Tất cả chi nhánh"
      : (venues.find((v) => v.id === selectedId)?.name ?? "Tất cả chi nhánh");

  return (
    <Dialog>
      <DialogTrigger className="flex w-full items-center gap-2 rounded-lg bg-blue-50 px-2 py-2 text-left text-sm font-medium text-blue-700 outline-none hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400">
        <BarChart3 className="size-4 shrink-0" />
        <span className="flex-1 truncate">{selectedLabel}</span>
        <ChevronRight className="size-4 shrink-0" />
      </DialogTrigger>
      <DialogContent className="max-w-sm overflow-hidden p-0">
        <div className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3">
          <BarChart3 className="size-4 text-white" />
          <DialogTitle className="flex-1 text-base font-semibold text-white">
            Chọn chi nhánh
          </DialogTitle>
          <DialogClose aria-label="Đóng" className="text-white/80 outline-none hover:text-white">
            <X className="size-4" />
          </DialogClose>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <DialogClose
            onClick={() => setSelectedId(ALL_BRANCHES_ID)}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left",
              selectedId === ALL_BRANCHES_ID ? "border-blue-500 bg-blue-50" : "border-border",
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
              <LayoutGrid className="size-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">Tất cả chi nhánh</span>
              <span className="block text-xs text-muted-foreground">Xem dữ liệu tổng hợp</span>
            </span>
            {selectedId === ALL_BRANCHES_ID ? (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                <Check className="size-3" />
              </span>
            ) : null}
          </DialogClose>
          {venues.map((venue) => (
            <DialogClose
              key={venue.id}
              onClick={() => setSelectedId(venue.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left",
                selectedId === venue.id ? "border-blue-500 bg-blue-50" : "border-border",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  venue.isDefault ? "bg-green-100 text-green-600" : "bg-muted text-muted-foreground",
                )}
              >
                <MapPin className="size-4" />
              </span>
              <span className="flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{venue.name}</span>
                  {venue.isDefault ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Mặc định
                    </span>
                  ) : null}
                </span>
                {venue.phone ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="size-3" />
                    {venue.phone}
                  </span>
                ) : null}
              </span>
              {selectedId === venue.id ? (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                  <Check className="size-3" />
                </span>
              ) : null}
            </DialogClose>
          ))}
          {venues.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">Chưa có chi nhánh nào.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
