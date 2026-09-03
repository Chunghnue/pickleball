"use client";

import { useEffect, useState } from "react";
import { useBranch, ALL_BRANCHES_ID } from "@/lib/branch-context";
import type { Venue } from "../types";

export interface SettingsVenueTarget {
  venueId: string | null;
  resolved: boolean;
}

// Neither Tab 1 nor Tab 2 has its own branch picker (10-cai-dat.md only
// surveyed a single-venue business) — both fall back to the global switcher,
// resolving to the owner's default venue when it's at "Tất cả chi nhánh".
export function useSettingsVenueId(): SettingsVenueTarget {
  const { selectedVenueId } = useBranch();
  const [venues, setVenues] = useState<Venue[] | null>(null);

  useEffect(() => {
    if (selectedVenueId !== ALL_BRANCHES_ID) return;
    fetch("/api/venues/mine")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setVenues(Array.isArray(data) ? data : []));
  }, [selectedVenueId]);

  if (selectedVenueId !== ALL_BRANCHES_ID) {
    return { venueId: selectedVenueId, resolved: true };
  }
  if (venues === null) {
    return { venueId: null, resolved: false };
  }
  const fallback = venues.find((venue) => venue.isDefault) ?? venues[0] ?? null;
  return { venueId: fallback?.id ?? null, resolved: true };
}
