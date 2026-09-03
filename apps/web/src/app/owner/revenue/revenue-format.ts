import type { DateRange } from "./types";

const moneyFormatter = new Intl.NumberFormat("vi-VN");

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}`;
}

export function formatMoney(value: number): string {
  return `${moneyFormatter.format(value)} đ`;
}

export function formatChangePercent(value: number | null): string {
  if (value === null) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatDateForQuery(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function defaultDateRange(now: Date = new Date()): DateRange {
  const to = formatDateForQuery(now);
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 29);
  return { from: formatDateForQuery(fromDate), to };
}

export function buildRevenueQuery(params: {
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
