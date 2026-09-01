import { describe, it, expect } from "vitest";
import {
  dayLabel,
  formatDaysOfWeek,
  formatMoney,
  formatShortDate,
  isAllDaysSelected,
  sessionPriceAfterDiscount,
} from "./pricing-format";

describe("dayLabel", () => {
  it("maps 0-6 to T2..CN", () => {
    expect(dayLabel(0)).toBe("T2");
    expect(dayLabel(6)).toBe("CN");
  });
});

describe("formatDaysOfWeek", () => {
  it("sorts and joins day labels", () => {
    expect(formatDaysOfWeek([4, 0, 2])).toBe("T2, T4, T6");
  });
  it("returns an empty string for an empty array", () => {
    expect(formatDaysOfWeek([])).toBe("");
  });
});

describe("formatMoney", () => {
  it("formats with vi-VN thousands separators and a đ suffix", () => {
    expect(formatMoney(150000)).toBe("150.000đ");
  });
});

describe("formatShortDate", () => {
  it("formats a YYYY-MM-DD date as dd/MM/yyyy", () => {
    expect(formatShortDate("2026-08-25")).toBe("25/08/2026");
  });
  it("returns an em dash for null", () => {
    expect(formatShortDate(null)).toBe("—");
  });
});

describe("isAllDaysSelected", () => {
  it("is true when all 7 days are present, in any order", () => {
    expect(isAllDaysSelected([6, 0, 1, 2, 3, 4, 5])).toBe(true);
  });
  it("is false when a day is missing", () => {
    expect(isAllDaysSelected([0, 1, 2, 3, 4, 5])).toBe(false);
  });
});

describe("sessionPriceAfterDiscount", () => {
  it("applies a percent discount and rounds to 2 decimals", () => {
    expect(sessionPriceAfterDiscount(100000, 10)).toBe(90000);
  });
  it("returns the full price when discount is null", () => {
    expect(sessionPriceAfterDiscount(100000, null)).toBe(100000);
  });
});
