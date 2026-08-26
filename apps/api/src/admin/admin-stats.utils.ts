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
