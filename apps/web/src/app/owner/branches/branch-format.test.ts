import { describe, it, expect } from "vitest";
import { filterBranches, sortBranches, countByTab, formatMoney, publicUrl } from "./branch-format";
import type { BranchListItem } from "./types";

function makeBranch(overrides: Partial<BranchListItem>): BranchListItem {
  return {
    id: "venue-1",
    name: "Sân ABC",
    address: "123 Le Loi",
    city: "Ho Chi Minh",
    district: null,
    slug: "san-abc",
    latitude: null,
    longitude: null,
    description: null,
    phone: null,
    email: null,
    isDefault: false,
    isHidden: false,
    logoUrl: null,
    status: "active",
    images: [],
    courtsCount: 0,
    bookingsThisMonth: 0,
    revenueThisMonth: 0,
    ...overrides,
  };
}

describe("filterBranches", () => {
  const active = makeBranch({ id: "v1", name: "Sân Quận 1", isHidden: false });
  const hidden = makeBranch({ id: "v2", name: "Sân Quận 7", address: "9 Nguyen Van Linh", isHidden: true });

  it("tab active keeps only non-hidden venues", () => {
    expect(filterBranches([active, hidden], { tab: "active", search: "" })).toEqual([active]);
  });

  it("tab hidden keeps only hidden venues", () => {
    expect(filterBranches([active, hidden], { tab: "hidden", search: "" })).toEqual([hidden]);
  });

  it("tab all keeps everything", () => {
    expect(filterBranches([active, hidden], { tab: "all", search: "" })).toEqual([active, hidden]);
  });

  it("search matches name, address, or city case-insensitively", () => {
    expect(filterBranches([active, hidden], { tab: "all", search: "quận 1" })).toEqual([active]);
    expect(filterBranches([active, hidden], { tab: "all", search: "NGUYEN VAN LINH" })).toEqual([hidden]);
  });

  it("combines tab and search", () => {
    expect(filterBranches([active, hidden], { tab: "hidden", search: "quận 1" })).toEqual([]);
  });
});

describe("sortBranches", () => {
  it('"default" puts the default venue first', () => {
    const a = makeBranch({ id: "v1", name: "A", isDefault: false });
    const b = makeBranch({ id: "v2", name: "B", isDefault: true });
    expect(sortBranches([a, b], "default").map((v) => v.id)).toEqual(["v2", "v1"]);
  });

  it('"name" sorts alphabetically', () => {
    const b = makeBranch({ id: "v1", name: "B Venue" });
    const a = makeBranch({ id: "v2", name: "A Venue" });
    expect(sortBranches([b, a], "name").map((v) => v.id)).toEqual(["v2", "v1"]);
  });
});

describe("countByTab", () => {
  it("active + hidden === all", () => {
    const items = [
      makeBranch({ id: "v1", isHidden: false }),
      makeBranch({ id: "v2", isHidden: true }),
      makeBranch({ id: "v3", isHidden: false }),
    ];
    const counts = countByTab(items);
    expect(counts).toEqual({ active: 2, hidden: 1, all: 3 });
  });
});

describe("formatMoney", () => {
  it("formats with Vietnamese thousands separators and a currency suffix", () => {
    expect(formatMoney(1500000)).toBe("1.500.000₫");
  });
});

describe("publicUrl", () => {
  it("builds the public URL from a slug", () => {
    expect(publicUrl("san-abc")).toBe("sanbong.vn/san-abc");
  });

  it("shows a placeholder when slug is null", () => {
    expect(publicUrl(null)).toBe("Chưa có đường dẫn");
  });
});
