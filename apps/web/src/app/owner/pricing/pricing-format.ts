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

export function isAllDaysSelected(days: number[]): boolean {
  return new Set(days).size >= 7;
}

export type PricingRuleSortValue = "time" | "priceAsc" | "priceDesc" | "name";

interface SortableRule {
  id: string;
  name: string;
  price: number;
  startTime: string;
}

// Ties (equal price/name/time) always fall through to name then id, so the
// same set of rules sorts identically no matter what order it arrived in —
// otherwise a stable sort merely preserves whatever order the input array
// happened to have, which silently changes across re-fetches/optimistic
// local updates and makes tied rows look like they're randomly reordering.
export function sortPricingRules<T extends SortableRule>(
  rules: T[],
  sortValue: PricingRuleSortValue,
): T[] {
  return [...rules].sort((a, b) => {
    let primary: number;
    switch (sortValue) {
      case "priceAsc":
        primary = a.price - b.price;
        break;
      case "priceDesc":
        primary = b.price - a.price;
        break;
      case "name":
        primary = a.name.localeCompare(b.name, "vi");
        break;
      case "time":
      default:
        primary = a.startTime.localeCompare(b.startTime);
        break;
    }
    if (primary !== 0) return primary;
    const nameCompare = a.name.localeCompare(b.name, "vi");
    if (nameCompare !== 0) return nameCompare;
    return a.id.localeCompare(b.id);
  });
}

export function sessionPriceAfterDiscount(
  pricePerSession: number,
  discountPercent: number | null,
): number {
  return Math.round(pricePerSession * (1 - (discountPercent ?? 0) / 100) * 100) / 100;
}
