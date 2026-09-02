import { describe, it, expect } from "vitest";
import {
  avatarInitials,
  avatarColor,
  roleKey,
  roleLabel,
  roleBadgeClasses,
  filterStaff,
  countByRole,
} from "./staff-format";
import type { StaffListItem } from "./types";

const OWNER: StaffListItem = {
  id: "owner-1",
  fullName: "Chủ Sân Demo",
  phone: "0900000002",
  email: "owner@demo.com",
  role: "owner",
  staffRole: null,
  status: "active",
};
const MANAGER: StaffListItem = {
  id: "staff-1",
  fullName: "Nguyễn Thị Quản Lý",
  phone: "0900000010",
  email: "manager@demo.com",
  role: "staff",
  staffRole: "manager",
  status: "active",
};
const CASHIER: StaffListItem = {
  id: "staff-2",
  fullName: "Trần Văn Thu Ngân",
  phone: "0900000011",
  email: null,
  role: "staff",
  staffRole: "cashier",
  status: "suspended",
};
const STAFF: StaffListItem = {
  id: "staff-3",
  fullName: "Le Van Nhan Vien",
  phone: "0900000012",
  email: null,
  role: "staff",
  staffRole: "staff",
  status: "active",
};
const ALL = [OWNER, MANAGER, CASHIER, STAFF];

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

describe("roleKey", () => {
  it("returns 'owner' for the owner row regardless of staffRole", () => {
    expect(roleKey(OWNER)).toBe("owner");
  });
  it("returns staffRole for staff rows", () => {
    expect(roleKey(MANAGER)).toBe("manager");
    expect(roleKey(CASHIER)).toBe("cashier");
    expect(roleKey(STAFF)).toBe("staff");
  });
});

describe("roleLabel", () => {
  it("maps every role to its Vietnamese label", () => {
    expect(roleLabel(OWNER)).toBe("Chủ sân");
    expect(roleLabel(MANAGER)).toBe("Quản lý");
    expect(roleLabel(CASHIER)).toBe("Thu ngân");
    expect(roleLabel(STAFF)).toBe("Nhân viên");
  });
});

describe("roleBadgeClasses", () => {
  it("returns a non-empty class string for every role", () => {
    for (const item of ALL) {
      expect(roleBadgeClasses(item).length).toBeGreaterThan(0);
    }
  });
  it("returns different classes for different roles", () => {
    expect(roleBadgeClasses(OWNER)).not.toBe(roleBadgeClasses(MANAGER));
  });
});

describe("filterStaff", () => {
  it("returns everything for roleTab 'all' with empty search", () => {
    expect(filterStaff(ALL, { roleTab: "all", search: "" })).toEqual(ALL);
  });
  it("filters to the owner row for roleTab 'owner'", () => {
    expect(filterStaff(ALL, { roleTab: "owner", search: "" })).toEqual([OWNER]);
  });
  it("filters by staffRole for a specific role tab", () => {
    expect(filterStaff(ALL, { roleTab: "cashier", search: "" })).toEqual([CASHIER]);
  });
  it("filters by search across name/phone/email, case-insensitive and trimmed", () => {
    expect(filterStaff(ALL, { roleTab: "all", search: "  QUẢN LÝ ' " })).toEqual([]);
    expect(filterStaff(ALL, { roleTab: "all", search: "0900000011" })).toEqual([CASHIER]);
    expect(filterStaff(ALL, { roleTab: "all", search: "manager@demo" })).toEqual([MANAGER]);
  });
  it("combines roleTab and search", () => {
    expect(
      filterStaff(ALL, { roleTab: "staff", search: "nhan vien" }),
    ).toEqual([STAFF]);
  });
});

describe("countByRole", () => {
  it("counts each role group and sums to the total", () => {
    const counts = countByRole(ALL);
    expect(counts).toEqual({ owner: 1, manager: 1, cashier: 1, staff: 1 });
    expect(
      counts.owner + counts.manager + counts.cashier + counts.staff,
    ).toBe(ALL.length);
  });
});
