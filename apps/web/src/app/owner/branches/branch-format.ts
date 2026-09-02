import type { BranchListItem, BranchTab, BranchSort } from "./types";

export function filterBranches(
  items: BranchListItem[],
  opts: { tab: BranchTab; search: string },
): BranchListItem[] {
  let result = items;
  if (opts.tab === "active") result = result.filter((v) => !v.isHidden);
  else if (opts.tab === "hidden") result = result.filter((v) => v.isHidden);
  const search = opts.search.trim().toLowerCase();
  if (search) {
    result = result.filter(
      (v) =>
        v.name.toLowerCase().includes(search) ||
        v.address.toLowerCase().includes(search) ||
        v.city.toLowerCase().includes(search),
    );
  }
  return result;
}

export function sortBranches(items: BranchListItem[], sort: BranchSort): BranchListItem[] {
  const copy = [...items];
  if (sort === "name") return copy.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "newest") return copy;
  return copy.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

export function countByTab(items: BranchListItem[]): Record<BranchTab, number> {
  const hidden = items.filter((v) => v.isHidden).length;
  return { active: items.length - hidden, hidden, all: items.length };
}

export function formatMoney(amount: number): string {
  return amount.toLocaleString("vi-VN") + "₫";
}

export function publicUrl(slug: string | null): string {
  return slug ? `sanbong.vn/${slug}` : "Chưa có đường dẫn";
}
