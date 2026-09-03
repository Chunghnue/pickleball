import { describe, it, expect } from "vitest";
import { orderForDisplay, validateOperatingHours, DAY_LABELS } from "./operating-hours-format";
import type { OperatingHourRow } from "./types";

function makeRows(overrides: Partial<Record<number, Partial<OperatingHourRow>>> = {}): OperatingHourRow[] {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    isOpen: true,
    openTime: "06:00",
    closeTime: "22:00",
    ...(overrides[dayOfWeek] ?? {}),
  }));
}

describe("orderForDisplay", () => {
  it("reorders Monday-first, Sunday-last regardless of input order", () => {
    const rows = makeRows();
    const result = orderForDisplay(rows);
    expect(result.map((r) => r.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("fills in a missing day with a closed default", () => {
    const rows = makeRows().filter((r) => r.dayOfWeek !== 3);
    const result = orderForDisplay(rows);
    const wednesday = result.find((r) => r.dayOfWeek === 3);
    expect(wednesday).toEqual({ dayOfWeek: 3, isOpen: false, openTime: null, closeTime: null });
  });
});

describe("validateOperatingHours", () => {
  it("returns null when every open day has openTime < closeTime", () => {
    expect(validateOperatingHours(makeRows())).toBeNull();
  });

  it("returns an error naming the day when openTime >= closeTime", () => {
    const rows = makeRows({ 2: { openTime: "22:00", closeTime: "06:00" } });
    expect(validateOperatingHours(rows)).toBe(`${DAY_LABELS[2]}: giờ mở phải trước giờ đóng`);
  });

  it("ignores closed days even with nonsensical times", () => {
    const rows = makeRows({ 4: { isOpen: false, openTime: null, closeTime: null } });
    expect(validateOperatingHours(rows)).toBeNull();
  });
});
