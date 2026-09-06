export interface ViewsByDayRow {
  date: string;
  views: string | number;
}

export function fillViewsByDay(
  rows: ViewsByDayRow[],
  days: string[],
): { date: string; views: number }[] {
  const viewsByDate = new Map(rows.map((r) => [r.date, Number(r.views)]));
  return days.map((date) => ({ date, views: viewsByDate.get(date) ?? 0 }));
}

export function computePercent(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

export function computeConversionRate(
  bookings: number,
  views: number,
): number | null {
  if (views === 0) return null;
  return Math.round((bookings / views) * 1000) / 10;
}

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const CSV_HEADER = ['Ngày', 'Lượt xem', 'Lượt xem kỳ trước'];

export interface PageViewsCsvRow {
  date: string;
  views: number;
  previousViews: number;
}

export function toPageViewsCsv(rows: PageViewsCsvRow[]): string {
  const dataLines = rows.map((row) =>
    [row.date, String(row.views), String(row.previousViews)].map(csvField).join(','),
  );
  return '﻿' + [CSV_HEADER.join(','), ...dataLines].join('\r\n');
}
