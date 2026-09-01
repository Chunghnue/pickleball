import type { CustomerTier } from "./types";

export function avatarInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

const TIER_LABELS: Record<CustomerTier, string> = {
  new: "Mới",
  regular: "Thường xuyên",
  vip: "VIP",
};

const TIER_CLASSES: Record<CustomerTier, string> = {
  new: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  regular: "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  vip: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
};

export function tierLabel(tier: CustomerTier): string {
  return TIER_LABELS[tier];
}

export function tierClasses(tier: CustomerTier): string {
  return TIER_CLASSES[tier];
}

export function formatShortDate(value: string | null): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
}

export function buildCustomersQuery(params: {
  venueId?: string;
  tier: CustomerTier | "all";
  search: string;
  page: number;
  pageSize?: number;
}): string {
  const sp = new URLSearchParams();
  if (params.venueId) sp.set("venueId", params.venueId);
  if (params.tier !== "all") sp.set("tier", params.tier);
  const search = params.search.trim();
  if (search) sp.set("search", search);
  sp.set("page", String(params.page));
  sp.set("pageSize", String(params.pageSize ?? 20));
  return sp.toString();
}
