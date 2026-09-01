export const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function dayLabel(day: number): string {
  return DAY_LABELS[day] ?? "—";
}

export function formatDaysOfWeek(days: number[]): string {
  return [...days]
    .sort((a, b) => a - b)
    .map((day) => dayLabel(day))
    .join(", ");
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export function formatMoney(value: number): string {
  return `${currencyFormatter.format(value)}đ`;
}

export function formatShortDate(value: string | null): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
}

export function sessionPriceAfterDiscount(
  pricePerSession: number,
  discountPercent: number | null,
): number {
  return Math.round(pricePerSession * (1 - (discountPercent ?? 0) / 100) * 100) / 100;
}
