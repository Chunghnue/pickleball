"use client";

import { useEffect, useState } from "react";
import { Building2, ChevronRight } from "lucide-react";
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
}

const ALL_BRANCHES_LABEL = "Tất cả chi nhánh";

export function BranchSwitcher() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedLabel, setSelectedLabel] = useState(ALL_BRANCHES_LABEL);

  useEffect(() => {
    fetch("/api/venues/mine")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setVenues(Array.isArray(data) ? data : []));
  }, []);

  return (
    <Dialog>
      <DialogTrigger className="flex w-full items-center gap-2 rounded-lg bg-blue-50 px-2 py-2 text-left text-sm font-medium text-blue-700 outline-none hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400">
        <Building2 className="size-4 shrink-0" />
        <span className="flex-1 truncate">{selectedLabel}</span>
        <ChevronRight className="size-4 shrink-0" />
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="mb-2 text-base font-semibold">Chọn chi nhánh</DialogTitle>
        <div className="flex flex-col gap-1">
          <DialogClose
            onClick={() => setSelectedLabel(ALL_BRANCHES_LABEL)}
            className="rounded px-2 py-2 text-left text-sm hover:bg-muted"
          >
            {ALL_BRANCHES_LABEL}
          </DialogClose>
          {venues.map((venue) => (
            <DialogClose
              key={venue.id}
              onClick={() => setSelectedLabel(venue.name)}
              className="flex flex-col rounded px-2 py-2 text-left text-sm hover:bg-muted"
            >
              <span>{venue.name}</span>
              <span className="text-xs text-muted-foreground">{venue.city}</span>
            </DialogClose>
          ))}
          {venues.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">Chưa có chi nhánh nào.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
