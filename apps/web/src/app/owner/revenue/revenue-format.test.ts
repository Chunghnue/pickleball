import { describe, it, expect } from "vitest";
import {
  buildRevenueQuery,
  defaultDateRange,
  formatChangePercent,
  formatDateTime,
  formatMoney,
} from "./revenue-format";

describe("formatDateTime", () => {
  it("formats an ISO timestamp as dd/MM/yyyy HH:mm using UTC components", () => {
    expect(formatDateTime("2026-08-15T10:30:00.000Z")).toBe("15/08/2026 10:30");
  });

  it("pads single-digit day, month, hour and minute", () => {
    expect(formatDateTime("2026-01-05T03:05:00.000Z")).toBe("05/01/2026 03:05");
  });
});

describe("formatMoney", () => {
  it("formats a number with vi-VN thousands separators and a đ suffix", () => {
    expect(formatMoney(15000000)).toBe("15.000.000 đ");
  });

  it("formats zero", () => {
    expect(formatMoney(0)).toBe("0 đ");
  });
});

describe("formatChangePercent", () => {
  it("returns N/A for null", () => {
    expect(formatChangePercent(null)).toBe("N/A");
  });

  it("prefixes a positive value with +, one decimal place", () => {
    expect(formatChangePercent(25)).toBe("+25.0%");
  });

  it("keeps the minus sign for a negative value", () => {
    expect(formatChangePercent(-47.8)).toBe("-47.8%");
  });

  it("treats zero as positive (+0.0%)", () => {
    expect(formatChangePercent(0)).toBe("+0.0%");
  });
});

describe("defaultDateRange", () => {
  it("returns a 30-day range ending today (inclusive)", () => {
    expect(defaultDateRange(new Date(2026, 7, 30))).toEqual({
      from: "2026-08-01",
      to: "2026-08-30",
    });
  });

  it("rolls the from-date back across a month boundary", () => {
    expect(defaultDateRange(new Date(2026, 8, 5))).toEqual({
      from: "2026-08-07",
      to: "2026-09-05",
    });
  });
});

describe("buildRevenueQuery", () => {
  it("omits venueId when not provided", () => {
    expect(buildRevenueQuery({ from: "2026-08-01", to: "2026-08-30" })).toBe(
      "from=2026-08-01&to=2026-08-30",
    );
  });

  it("includes venueId when provided", () => {
    expect(
      buildRevenueQuery({ venueId: "v1", from: "2026-08-01", to: "2026-08-30" }),
    ).toBe("venueId=v1&from=2026-08-01&to=2026-08-30");
  });
});
