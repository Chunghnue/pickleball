import { describe, it, expect } from "vitest";
import {
  dayLabel,
  formatDaysOfWeek,
  formatMoney,
  formatShortDate,
  isAllDaysSelected,
  minutesBetween,
  sessionPriceAfterDiscount,
  sortPricingRules,
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

describe("sortPricingRules", () => {
  const RULE_B = { id: "b-id", name: "B", price: 100000, startTime: "18:00" };
  const RULE_A = { id: "a-id", name: "A", price: 100000, startTime: "09:00" };
  const RULE_C = { id: "c-id", name: "C", price: 50000, startTime: "12:00" };

  it("breaks ties on equal price by name, regardless of input order", () => {
    const order1 = sortPricingRules([RULE_B, RULE_A, RULE_C], "priceAsc");
    const order2 = sortPricingRules([RULE_A, RULE_C, RULE_B], "priceAsc");
    expect(order1.map((r) => r.id)).toEqual(order2.map((r) => r.id));
    // C (50000) first, then A/B (100000) tied on price -> broken by name A, B
    expect(order1.map((r) => r.id)).toEqual(["c-id", "a-id", "b-id"]);
  });

  it("sorts by price descending", () => {
    const result = sortPricingRules([RULE_C, RULE_A, RULE_B], "priceDesc");
    expect(result.map((r) => r.id)).toEqual(["a-id", "b-id", "c-id"]);
  });

  it("sorts by name", () => {
    const result = sortPricingRules([RULE_C, RULE_B, RULE_A], "name");
    expect(result.map((r) => r.id)).toEqual(["a-id", "b-id", "c-id"]);
  });

  it("sorts by start time", () => {
    const result = sortPricingRules([RULE_B, RULE_C, RULE_A], "time");
    expect(result.map((r) => r.id)).toEqual(["a-id", "c-id", "b-id"]);
  });

  it("does not mutate the input array", () => {
    const input = [RULE_B, RULE_A];
    sortPricingRules(input, "priceAsc");
    expect(input).toEqual([RULE_B, RULE_A]);
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

describe("minutesBetween", () => {
  it("computes the duration in minutes", () => {
    expect(minutesBetween("07:00", "08:30")).toBe(90);
    expect(minutesBetween("19:00", "20:30")).toBe(90);
  });
  it("returns null when end is not after start", () => {
    expect(minutesBetween("08:00", "08:00")).toBeNull();
    expect(minutesBetween("09:00", "08:00")).toBeNull();
  });
  it("returns null for malformed input", () => {
    expect(minutesBetween("bad", "08:00")).toBeNull();
    expect(minutesBetween("08:00", "")).toBeNull();
  });
});
