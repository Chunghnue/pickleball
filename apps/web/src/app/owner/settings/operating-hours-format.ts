import type { OperatingHourRow } from "./types";

export const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const DAY_LABELS: Record<number, string> = {
  0: "Chủ Nhật",
  1: "Thứ 2",
  2: "Thứ 3",
  3: "Thứ 4",
  4: "Thứ 5",
  5: "Thứ 6",
  6: "Thứ 7",
};

export function orderForDisplay(rows: OperatingHourRow[]): OperatingHourRow[] {
  return DISPLAY_ORDER.map(
    (dayOfWeek) =>
      rows.find((row) => row.dayOfWeek === dayOfWeek) ?? {
        dayOfWeek,
        isOpen: false,
        openTime: null,
        closeTime: null,
      },
  );
}

export function validateOperatingHours(rows: OperatingHourRow[]): string | null {
  for (const row of rows) {
    if (row.isOpen && row.openTime && row.closeTime && row.openTime >= row.closeTime) {
      return `${DAY_LABELS[row.dayOfWeek]}: giờ mở phải trước giờ đóng`;
    }
  }
  return null;
}
