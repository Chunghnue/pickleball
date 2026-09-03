export interface DateRange {
  start: Date;
  end: Date;
}

export function getTodayRange(now: Date = new Date()): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function getCurrentMonthRange(now: Date = new Date()): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLast30Days(now: Date = new Date()): string[] {
  const { start } = getTodayRange(now);
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    days.push(formatLocalDate(d));
  }
  return days;
}

export function getDaysBetween(from: string, to: string): string[] {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const cursor = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  const days: string[] = [];
  while (cursor.getTime() <= end.getTime()) {
    days.push(formatLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function parseDateRangeBoundaries(from: string, to: string): DateRange {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export interface RevenueByDayRow {
  date: string;
  revenue: string | number;
}

export function fillRevenueByDay(
  rows: RevenueByDayRow[],
  days: string[],
): { date: string; revenue: number }[] {
  const revenueByDate = new Map(rows.map((r) => [r.date, Number(r.revenue)]));
  return days.map((date) => ({ date, revenue: revenueByDate.get(date) ?? 0 }));
}
