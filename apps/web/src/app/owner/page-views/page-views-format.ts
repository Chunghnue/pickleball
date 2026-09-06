import type { DateRange } from "./types";

export type PresetKey = "7d" | "30d" | "90d" | "this-month";

const numberFormatter = new Intl.NumberFormat("vi-VN");

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDateForQuery(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getPresetRange(preset: PresetKey, now: Date = new Date()): DateRange {
  const to = formatDateForQuery(now);
  if (preset === "this-month") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: formatDateForQuery(from), to };
  }
  const daysBack = preset === "7d" ? 6 : preset === "30d" ? 29 : 89;
  const from = new Date(now);
  from.setDate(from.getDate() - daysBack);
  return { from: formatDateForQuery(from), to };
}

export function defaultDateRange(now: Date = new Date()): DateRange {
  return getPresetRange("30d", now);
}

export function buildPageViewsQuery(params: {
  venueId?: string;
  from: string;
  to: string;
}): string {
  const sp = new URLSearchParams();
  if (params.venueId) sp.set("venueId", params.venueId);
  sp.set("from", params.from);
  sp.set("to", params.to);
  return sp.toString();
}
