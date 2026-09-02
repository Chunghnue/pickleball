import type { Venue } from "../types";

export interface BranchListItem extends Venue {
  courtsCount: number;
  bookingsThisMonth: number;
  revenueThisMonth: number;
}

export type BranchTab = "active" | "hidden" | "all";
export type BranchSort = "default" | "name" | "newest";
