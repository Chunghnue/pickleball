import type { AccountRole, RoleTab, StaffListItem } from "./types";

export function avatarInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-blue-500",
  "bg-red-500",
  "bg-purple-500",
  "bg-green-600",
  "bg-amber-500",
  "bg-pink-500",
  "bg-cyan-600",
  "bg-indigo-500",
];

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  }
  return AVATAR_COLORS[hash];
}

export function roleKey(item: Pick<StaffListItem, "role" | "staffRole">): AccountRole {
  return item.role === "owner" ? "owner" : (item.staffRole as AccountRole);
}

const ROLE_LABELS: Record<AccountRole, string> = {
  owner: "Chủ sân",
  manager: "Quản lý",
  cashier: "Thu ngân",
  staff: "Nhân viên",
};

export function roleLabel(item: Pick<StaffListItem, "role" | "staffRole">): string {
  return ROLE_LABELS[roleKey(item)];
}

const ROLE_BADGE_CLASSES: Record<AccountRole, string> = {
  owner: "bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
  manager: "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  cashier: "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  staff: "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400",
};

export function roleBadgeClasses(item: Pick<StaffListItem, "role" | "staffRole">): string {
  return ROLE_BADGE_CLASSES[roleKey(item)];
}

export function filterStaff(
  items: StaffListItem[],
  opts: { roleTab: RoleTab; search: string },
): StaffListItem[] {
  let result = items;
  if (opts.roleTab === "owner") {
    result = result.filter((i) => i.role === "owner");
  } else if (opts.roleTab !== "all") {
    result = result.filter((i) => i.staffRole === opts.roleTab);
  }
  const search = opts.search.trim().toLowerCase();
  if (search) {
    result = result.filter(
      (i) =>
        i.fullName.toLowerCase().includes(search) ||
        (i.phone ?? "").toLowerCase().includes(search) ||
        (i.email ?? "").toLowerCase().includes(search),
    );
  }
  return result;
}

export function countByRole(items: StaffListItem[]): Record<AccountRole, number> {
  const counts: Record<AccountRole, number> = { owner: 0, manager: 0, cashier: 0, staff: 0 };
  for (const item of items) counts[roleKey(item)] += 1;
  return counts;
}
