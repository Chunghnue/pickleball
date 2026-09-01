import { describe, it, expect } from "vitest";
import {
  avatarInitials,
  avatarColor,
  tierLabel,
  formatShortDate,
  buildCustomersQuery,
} from "./customer-format";

describe("avatarInitials", () => {
  it("takes first + last word initials, uppercased", () => {
    expect(avatarInitials("Nguyễn Văn A")).toBe("NA");
  });
  it("handles a single word", () => {
    expect(avatarInitials("Minh")).toBe("M");
  });
  it("falls back to ? for empty input", () => {
    expect(avatarInitials("   ")).toBe("?");
  });
});

describe("avatarColor", () => {
  it("is deterministic for the same name", () => {
    expect(avatarColor("Phạm Văn An")).toBe(avatarColor("Phạm Văn An"));
  });
  it("returns a bg color utility class", () => {
    expect(avatarColor("Lê Thị Bình")).toMatch(/^bg-[a-z]+-\d{3}$/);
  });
});

describe("tierLabel", () => {
  it("maps tiers to Vietnamese labels", () => {
    expect(tierLabel("new")).toBe("Mới");
    expect(tierLabel("regular")).toBe("Thường xuyên");
    expect(tierLabel("vip")).toBe("VIP");
  });
});

describe("formatShortDate", () => {
  it("formats a YYYY-MM-DD date as dd/MM/yyyy", () => {
    expect(formatShortDate("2026-08-25")).toBe("25/08/2026");
  });
  it("formats an ISO datetime by its date part", () => {
    expect(formatShortDate("2026-09-01T00:00:00.000Z")).toBe("01/09/2026");
  });
  it("returns an em dash for null", () => {
    expect(formatShortDate(null)).toBe("—");
  });
});

describe("buildCustomersQuery", () => {
  it("omits venueId when not provided and omits tier=all", () => {
    expect(buildCustomersQuery({ tier: "all", search: "", page: 1 })).toBe(
      "page=1&pageSize=20",
    );
  });
  it("includes venueId, tier, trimmed search and page", () => {
    expect(
      buildCustomersQuery({ venueId: "v1", tier: "vip", search: "  An ", page: 2 }),
    ).toBe("venueId=v1&tier=vip&search=An&page=2&pageSize=20");
  });
});
