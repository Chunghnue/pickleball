# Branches Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare-bones `/owner/branches` stub (+ `/branches/new`, `/branches/[id]`) with a single full-featured `/owner/branches` page per [2026-09-02-branches-frontend-design.md](../specs/2026-09-02-branches-frontend-design.md): metric cards, filter tabs, search, sort, grid/list toggle, branch cards with 4 actions, and a create/edit dialog with a real Leaflet map.

**Architecture:** All CRUD happens through dialogs on one list page (no more per-venue sub-routes), matching Courts/Staff Accounts/Customers. The page fetches the full branch list once (`GET /api/venues/mine`) and does all filtering/sorting/searching client-side. `react-leaflet`/`leaflet` are new dependencies, dynamically imported (`ssr: false`) since Leaflet needs `window`.

**Tech Stack:** Next.js 16 (App Router, modified — read `apps/web/node_modules/next/dist/docs/` before touching routing/dynamic-import code per `apps/web/AGENTS.md`), React 19, Tailwind, shadcn-style components (`@base-ui/react` under the hood), `lucide-react`, `sonner`, Vitest.

## Global Constraints

- Backend is fully implemented and tested (`docs/superpowers/plans/2026-09-02-branches-module-backend.md`, all 10 tasks done). This plan builds against the real API, not a speculative one.
- **Deviations from the approved frontend design spec, found while cross-checking it against the real backend response shapes — read before starting:**
  1. **`courtsCount`/`bookingsThisMonth`/`revenueThisMonth` do NOT go on the shared `owner/types.ts` `Venue`.** They only exist in the response of `GET /venues/mine` (`VenuesService.findMineWithMetrics`) — `GET /venues/mine/:id` (used by other pages via the shared `Venue` type) returns the bare entity without them. Putting them on the shared type would silently lie to every other consumer of `Venue`. They go on a **local** `BranchListItem` type in `apps/web/src/app/owner/branches/types.ts` instead — same pattern Staff Accounts (`StaffListItem`) and Customers already use.
  2. **`slug` is `string | null`, not `string`.** The backend column is nullable by design (existing pre-migration venues keep `slug = null`, see backend plan Task 1) — every venue created through the real create flow gets one, but the type must reflect reality. `publicUrl()` handles `null`.
  3. **`phone` is edit-only, not on the create form**, even though `08-chi-nhanh.md` lists it for "Thêm chi nhánh mới". This isn't a new decision — `CreateVenueDto` was deliberately never given a `phone` field (see `2026-08-29-venue-default-phone-and-branch-dialog-design.md` Global Constraints: "no phone on the venue create form"). Sending it on create would 400 (`forbidNonWhitelisted: true`). The create dialog simply doesn't show a phone input; the edit dialog does.
  4. **409 slug-conflict and 400 slug-limit errors surface as a toast, not an inline error under the slug field**, despite the spec's §6 wording ("inline lỗi trường slug"). The exact backend message still reaches the user either way (`getSubmitErrorMessage` reads `data.message` verbatim) — this just follows `StaffFormDialog`'s established pattern of toast-only submit errors (no dialog in this codebase does inline field-level errors for API responses, only for the images dialog's URL validation, which this plan keeps as-is).
  5. **"Lượt xem 7D" is dropped from this plan entirely** — not stubbed, not proxied. The frontend spec assumed `GET /analytics/page-views/summary` was an already-built endpoint to reuse; it does not exist anywhere in `apps/api/src` (verified while writing the backend plan). Building a proxy against a route that 404s forever isn't worth shipping — add it back when a Page View Analytics backend plan exists. Branch cards show 3 quick stats (Sân/Booking tháng/DT tháng), not 4.
- New dependencies: `react-leaflet@^5.0.0`, `leaflet@^1.9.4` (dev: `@types/leaflet@^1.9.22`) — versions confirmed current on the registry and compatible with this repo's React 19.
- Leaflet's default marker relies on bundler-specific PNG asset resolution that's fragile across webpack/turbopack versions — this plan uses a plain CSS `L.divIcon` teardrop marker instead (no image assets, no bundler landmine).
- Every task must leave `npm test` (Vitest) and `npx tsc --noEmit -p .` green from `apps/web`.

---

## File Structure

**New files:**
- `apps/web/src/app/owner/branches/types.ts` — `BranchListItem`, `BranchTab`, `BranchSort`
- `apps/web/src/app/owner/branches/branch-format.ts` (+ `.test.ts`)
- `apps/web/src/app/owner/branches/branch-metrics.tsx`
- `apps/web/src/app/owner/branches/branch-filters.tsx`
- `apps/web/src/app/owner/branches/branch-location-map.tsx`
- `apps/web/src/app/owner/branches/branch-form-dialog.tsx`
- `apps/web/src/app/owner/branches/branch-images-dialog.tsx`
- `apps/web/src/app/owner/branches/delete-branch-dialog.tsx`
- `apps/web/src/app/owner/branches/branch-actions.tsx`
- `apps/web/src/app/owner/branches/branch-card.tsx`
- `apps/web/src/app/owner/branches/branch-row.tsx`
- `apps/web/src/app/api/venues/mine/[venueId]/set-default/route.ts`

**Modified:**
- `apps/web/src/app/owner/types.ts` — extend shared `Venue`
- `apps/web/src/app/api/venues/mine/[venueId]/route.ts` — add `DELETE`
- `apps/web/src/app/owner/branches/page.tsx` — full rewrite
- `apps/web/src/app/owner/page.tsx` — fix dead link to deleted `/branches/new`
- `apps/web/src/lib/schemas.ts` / `schemas.test.ts` — remove now-dead `createVenueSchema`/`updateVenueSchema`
- `apps/web/package.json` — new dependencies

**Removed:**
- `apps/web/src/app/owner/branches/new/` (whole dir)
- `apps/web/src/app/owner/branches/[id]/` (whole dir)

---

### Task 1: Add Leaflet dependencies

**Files:**
- Modify: `apps/web/package.json`, `apps/web/package-lock.json`

- [ ] **Step 1: Install**

Run (from `apps/web`):
```bash
npm install react-leaflet@^5.0.0 leaflet@^1.9.4
npm install -D @types/leaflet@^1.9.22
```
Expected: `package.json` gains all three under the right dependency sections; install exits 0.

- [ ] **Step 2: Verify the app still builds**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0 (new deps present but unused yet, no code changes).

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json
git commit -m "chore(web): add react-leaflet/leaflet for the branch location picker"
```

---

### Task 2: Extend shared `Venue` type, add local branch types

**Files:**
- Modify: `apps/web/src/app/owner/types.ts`
- Create: `apps/web/src/app/owner/branches/types.ts`

**Interfaces:**
- Produces: `Venue.slug/district/latitude/longitude/email/isDefault/isHidden` (shared, present on every venue read regardless of endpoint), `BranchListItem` (local, adds the 3 list-only metrics) — consumed by every other task in this plan.

- [ ] **Step 1: Extend the shared `Venue` interface**

In `apps/web/src/app/owner/types.ts`, replace the `Venue` interface:

```ts
export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string | null;
  slug: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  isDefault: boolean;
  isHidden: boolean;
  status: "pending_approval" | "active" | "rejected";
  images: VenueImage[];
}
```

- [ ] **Step 2: Create the local branch types**

Create `apps/web/src/app/owner/branches/types.ts`:

```ts
import type { Venue } from "../types";

export interface BranchListItem extends Venue {
  courtsCount: number;
  bookingsThisMonth: number;
  revenueThisMonth: number;
}

export type BranchTab = "active" | "hidden" | "all";
export type BranchSort = "default" | "name" | "newest";
```

- [ ] **Step 3: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0 — every existing consumer of `Venue` (bookings, pricing, dashboard, `branch-switcher.tsx`) only reads a subset of fields, so purely-additive new fields don't break anything.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/owner/types.ts apps/web/src/app/owner/branches/types.ts
git commit -m "feat(web): add branch fields to shared Venue type, add local BranchListItem"
```

---

### Task 3: `branch-format.ts` — filter/sort/count/format helpers (TDD)

**Files:**
- Create: `apps/web/src/app/owner/branches/branch-format.ts`
- Test: `apps/web/src/app/owner/branches/branch-format.test.ts`

**Interfaces:**
- Consumes: `BranchListItem`, `BranchTab`, `BranchSort` (Task 2).
- Produces: `filterBranches`, `sortBranches`, `countByTab`, `formatMoney`, `publicUrl` — consumed by `page.tsx` (Task 12) and `branch-card.tsx`/`branch-row.tsx` (Tasks 10).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/app/owner/branches/branch-format.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/web`): `npx vitest run branch-format`
Expected: FAIL — `Cannot find module './branch-format'`.

- [ ] **Step 3: Implement**

Create `apps/web/src/app/owner/branches/branch-format.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/web`): `npx vitest run branch-format`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/owner/branches/branch-format.ts apps/web/src/app/owner/branches/branch-format.test.ts
git commit -m "feat(web): add branch-format helpers (filter/sort/count/format)"
```

---

### Task 4: Route proxy — `POST /api/venues/mine/[venueId]/set-default`

**Files:**
- Create: `apps/web/src/app/api/venues/mine/[venueId]/set-default/route.ts`

**Interfaces:**
- Consumes: backend `POST /venues/mine/:id/set-default` (implemented, `venues.controller.ts`).

- [ ] **Step 1: Read the Next.js route-handler doc for this modified version**

Before writing, check `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (or the closest match) for the current dynamic-params signature — the rest of this plan assumes `{ params }: { params: Promise<{ venueId: string }> }` matching every existing proxy under `venues/mine/[venueId]/`; confirm it still holds before continuing.

- [ ] **Step 2: Create the proxy**

Create `apps/web/src/app/api/venues/mine/[venueId]/set-default/route.ts`:

```ts
import { NextRequest } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { clearAuthCookies } from "@/lib/auth-cookies";
import { toNextResponse } from "@/lib/proxy-response";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await params;
  const upstream = await fetchApi(`/venues/mine/${venueId}/set-default`, {
    method: "POST",
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 3: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/venues/mine/[venueId]/set-default/route.ts
git commit -m "feat(web): add POST /api/venues/mine/[venueId]/set-default proxy"
```

---

### Task 5: Route proxy — add `DELETE` to `venues/mine/[venueId]/route.ts`

**Files:**
- Modify: `apps/web/src/app/api/venues/mine/[venueId]/route.ts`

**Interfaces:**
- Consumes: backend `DELETE /venues/mine/:id` (implemented).

- [ ] **Step 1: Add the handler**

In `apps/web/src/app/api/venues/mine/[venueId]/route.ts`, add after the existing `PATCH` export:

```ts
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await params;
  const upstream = await fetchApi(`/venues/mine/${venueId}`, { method: 'DELETE' });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/venues/mine/[venueId]/route.ts
git commit -m "feat(web): add DELETE handler to venues/mine/[venueId] proxy"
```

---

### Task 6: `branch-metrics.tsx`

**Files:**
- Create: `apps/web/src/app/owner/branches/branch-metrics.tsx`

**Interfaces:**
- Consumes: `BranchListItem[]` (Task 2).

- [ ] **Step 1: Implement**

Create `apps/web/src/app/owner/branches/branch-metrics.tsx` (mirrors `apps/web/src/app/owner/accounts/staff-metrics.tsx`'s `MetricCard` pattern):

```tsx
import { Building2, CalendarCheck, LayoutGrid, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "./branch-format";
import type { BranchListItem } from "./types";

const CARD_STYLES = {
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  purple: "bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
  green: "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
} as const;

function MetricCard({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: LucideIcon;
  color: keyof typeof CARD_STYLES;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${CARD_STYLES[color]}`}
        >
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-2xl font-bold leading-tight">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function BranchMetrics({ items }: { items: BranchListItem[] }) {
  const totalCourts = items.reduce((sum, v) => sum + v.courtsCount, 0);
  const totalBookings = items.reduce((sum, v) => sum + v.bookingsThisMonth, 0);
  const totalRevenue = items.reduce((sum, v) => sum + v.revenueThisMonth, 0);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <MetricCard icon={Building2} color="blue" label="Chi nhánh" value={String(items.length)} />
      <MetricCard icon={LayoutGrid} color="purple" label="Tổng sân" value={String(totalCourts)} />
      <MetricCard
        icon={CalendarCheck}
        color="green"
        label="Booking tháng này"
        value={String(totalBookings)}
      />
      <MetricCard icon={Wallet} color="amber" label="Doanh thu tháng" value={formatMoney(totalRevenue)} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/branches/branch-metrics.tsx
git commit -m "feat(web): add BranchMetrics summary cards"
```

---

### Task 7: `branch-filters.tsx`

**Files:**
- Create: `apps/web/src/app/owner/branches/branch-filters.tsx`

**Interfaces:**
- Consumes: `BranchTab`, `BranchSort` (Task 2).
- Produces: view-mode persistence via `localStorage["branches-view-mode"]`.

- [ ] **Step 1: Implement**

Create `apps/web/src/app/owner/branches/branch-filters.tsx` (tabs mirror `staff-filters.tsx`, sort dropdown mirrors the `DropdownMenu` in `pricing-rules-tab.tsx`, view-mode persistence mirrors `app-shell.tsx`'s `STORAGE_KEY` pattern):

```tsx
"use client";

import { LayoutGrid, List, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { BranchTab, BranchSort } from "./types";

const TABS: { value: BranchTab; label: string }[] = [
  { value: "active", label: "Hoạt động" },
  { value: "hidden", label: "Đã ẩn" },
  { value: "all", label: "Tất cả" },
];

const SORT_LABELS: Record<BranchSort, string> = {
  default: "Mặc định trước",
  name: "Tên",
  newest: "Mới nhất",
};

export function BranchFilters({
  tab,
  search,
  sort,
  viewMode,
  counts,
  onTabChange,
  onSearchChange,
  onSortChange,
  onViewModeChange,
}: {
  tab: BranchTab;
  search: string;
  sort: BranchSort;
  viewMode: "grid" | "list";
  counts: Record<BranchTab, number>;
  onTabChange: (tab: BranchTab) => void;
  onSearchChange: (search: string) => void;
  onSortChange: (sort: BranchSort) => void;
  onViewModeChange: (mode: "grid" | "list") => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => {
            const active = tab === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => onTabChange(t.value)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium",
                  active ? "bg-blue-600 text-white" : "border text-muted-foreground hover:bg-muted",
                )}
              >
                {t.label} ({counts[t.value]})
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              autoComplete="off"
              placeholder="Tìm theo tên, địa chỉ, thành phố..."
              className="h-9 w-56 border-0 px-0 focus-visible:ring-0"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex h-9 items-center gap-1.5 rounded-lg border border-input px-3 text-sm text-muted-foreground outline-none hover:bg-muted">
              <span>Sắp xếp:</span>
              <span className="font-medium text-foreground">{SORT_LABELS[sort]}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(SORT_LABELS) as BranchSort[]).map((value) => (
                <DropdownMenuItem
                  key={value}
                  onClick={() => onSortChange(value)}
                  className={cn(
                    value === sort &&
                      "bg-blue-600 text-white data-[highlighted]:bg-blue-600 data-[highlighted]:text-white",
                  )}
                >
                  {SORT_LABELS[value]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center rounded-lg border border-input p-0.5">
            <button
              type="button"
              aria-label="Dạng lưới"
              onClick={() => onViewModeChange("grid")}
              className={cn(
                "flex size-8 items-center justify-center rounded-md",
                viewMode === "grid" ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Dạng danh sách"
              onClick={() => onViewModeChange("list")}
              className={cn(
                "flex size-8 items-center justify-center rounded-md",
                viewMode === "list" ? "bg-blue-600 text-white" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <List className="size-4" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/branches/branch-filters.tsx
git commit -m "feat(web): add BranchFilters (tabs, search, sort, grid/list toggle)"
```

---

### Task 8: `branch-location-map.tsx`

**Files:**
- Create: `apps/web/src/app/owner/branches/branch-location-map.tsx`

**Interfaces:**
- Produces: default-exported `BranchLocationMap({ latitude, longitude, onChange })` — consumed by `branch-form-dialog.tsx` (Task 9) via `next/dynamic` with `ssr: false`.

- [ ] **Step 1: Read the Next.js dynamic-import doc for this modified version**

Read `apps/web/node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md` and confirm `dynamic(() => import(...), { ssr: false })` from inside a `"use client"` component is still the supported way to skip SSR for a browser-only library — this plan's Task 9 relies on it.

- [ ] **Step 2: Implement**

Create `apps/web/src/app/owner/branches/branch-location-map.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";

// Hà Nội — chỉ là điểm neo mặc định khi chưa có toạ độ, không có ý nghĩa nghiệp vụ.
const DEFAULT_CENTER: [number, number] = [21.0278, 105.8342];

// CSS teardrop marker thay vì ảnh marker mặc định của Leaflet — tránh vấn đề
// bundler (webpack/turbopack) không resolve đúng đường dẫn ảnh PNG trong node_modules.
const markerIcon = L.divIcon({
  className: "",
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#2563eb;transform:rotate(-45deg);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

function RecenterOnChange({ latitude, longitude }: { latitude: number | null; longitude: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (latitude !== null && longitude !== null) {
      map.setView([latitude, longitude], map.getZoom());
    }
  }, [latitude, longitude, map]);
  return null;
}

export interface BranchLocationMapProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
}

export default function BranchLocationMap({ latitude, longitude, onChange }: BranchLocationMapProps) {
  const center: [number, number] =
    latitude !== null && longitude !== null ? [latitude, longitude] : DEFAULT_CENTER;

  return (
    <MapContainer center={center} zoom={13} style={{ height: "220px", width: "100%", borderRadius: "0.75rem" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {latitude !== null && longitude !== null && <Marker position={[latitude, longitude]} icon={markerIcon} />}
      <ClickHandler onPick={onChange} />
      <RecenterOnChange latitude={latitude} longitude={longitude} />
    </MapContainer>
  );
}
```

- [ ] **Step 3: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0. If `@types/leaflet` doesn't fully satisfy `react-leaflet@5`'s own types, resolve the specific error shown (react-leaflet 5 ships its own types — do not add workarounds speculatively, only fix what `tsc` actually reports).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/owner/branches/branch-location-map.tsx
git commit -m "feat(web): add BranchLocationMap (Leaflet click-to-pick + recenter)"
```

---

### Task 9: `branch-form-dialog.tsx`

**Files:**
- Create: `apps/web/src/app/owner/branches/branch-form-dialog.tsx`

**Interfaces:**
- Consumes: `BranchListItem` (Task 2), `BranchLocationMap` (Task 8, via `next/dynamic`).
- Produces: `BranchFormDialog` — consumed by `branch-actions.tsx` (Task 10 & 11) and `page.tsx` (Task 12).

- [ ] **Step 1: Implement**

Create `apps/web/src/app/owner/branches/branch-form-dialog.tsx` (union create/edit props mirror `StaffFormDialog`; gradient header/footer chrome mirrors the same file):

```tsx
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Check, MapPin, Store, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { BranchListItem } from "./types";

const BranchLocationMap = dynamic(() => import("./branch-location-map"), { ssr: false });

// Phải khớp SLUG_PATTERN ở apps/api/src/courts/slug.util.ts — validate sớm ở
// client, backend vẫn là nguồn sự thật cuối cùng.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface CreateProps {
  mode: "create";
  trigger: React.ReactElement;
  onSaved: () => void;
}
interface EditProps {
  mode: "edit";
  venue: BranchListItem;
  trigger: React.ReactElement;
  onSaved: () => void;
}

export function BranchFormDialog(props: CreateProps | EditProps) {
  const { trigger, onSaved, mode } = props;
  const isEdit = mode === "edit";
  const venue = props.mode === "edit" ? props.venue : undefined;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [description, setDescription] = useState("");
  const [isHidden, setIsHidden] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(venue?.name ?? "");
    setSlug(venue?.slug ?? "");
    setEmail(venue?.email ?? "");
    setPhone(venue?.phone ?? "");
    setAddress(venue?.address ?? "");
    setCity(venue?.city ?? "");
    setDistrict(venue?.district ?? "");
    setDescription(venue?.description ?? "");
    setIsHidden(venue?.isHidden ?? false);
    setLatitude(venue?.latitude ?? null);
    setLongitude(venue?.longitude ?? null);
  }, [open, venue]);

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      toast.error("Trình duyệt không hỗ trợ định vị");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
      },
      () => toast.error("Không thể lấy vị trí, vui lòng cho phép truy cập vị trí"),
    );
  }

  async function handleSubmit() {
    if (!name.trim() || !address.trim() || !city.trim()) {
      toast.error("Vui lòng nhập tên chi nhánh, địa chỉ và tỉnh/thành phố");
      return;
    }
    if (slug.trim() && !SLUG_PATTERN.test(slug.trim())) {
      toast.error("Đường dẫn chỉ được chứa chữ thường, số và dấu gạch ngang");
      return;
    }

    setSubmitting(true);
    const commonBody = {
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      description: description.trim() || undefined,
      slug: slug.trim() || undefined,
      district: district.trim() || undefined,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      email: email.trim() || undefined,
    };
    const body = isEdit ? { ...commonBody, phone: phone.trim() || undefined, isHidden } : commonBody;

    const response = await fetch(isEdit ? `/api/venues/mine/${venue!.id}` : "/api/venues", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success(isEdit ? "Đã cập nhật chi nhánh" : "Đã tạo chi nhánh, đang chờ admin duyệt");
    onSaved();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-800 to-blue-500 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-white">
            <Store className="size-5 text-white" />
            {isEdit ? "Sửa chi nhánh" : "Thêm chi nhánh mới"}
          </DialogTitle>
          <DialogClose className="text-white/80 outline-none hover:text-white" aria-label="Đóng">
            <X className="size-5" />
          </DialogClose>
        </div>

        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">
                Tên chi nhánh <span className="text-destructive">*</span>
              </Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Đường dẫn (slug)</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                autoComplete="off"
                placeholder="Để trống để tự sinh"
                className="h-9"
              />
              {isEdit && (
                <p className="text-xs text-muted-foreground">Đổi tối đa 3 lần/180 ngày, cách nhau tối thiểu 60 ngày.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {isEdit && (
              <div className="space-y-1.5">
                <Label className="font-semibold">Số điện thoại</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" className="h-9" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="font-semibold">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className="h-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold">
              Địa chỉ <span className="text-destructive">*</span>
            </Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" className="h-9" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">
                Tỉnh/Thành phố <span className="text-destructive">*</span>
              </Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="off" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Quận/Huyện</Label>
              <Input value={district} onChange={(e) => setDistrict(e.target.value)} autoComplete="off" className="h-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Vị trí trên bản đồ</Label>
              <button
                type="button"
                onClick={handleUseMyLocation}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                <MapPin className="size-3.5" />
                Vị trí của tôi
              </button>
            </div>
            <BranchLocationMap
              latitude={latitude}
              longitude={longitude}
              onChange={(lat, lng) => {
                setLatitude(lat);
                setLongitude(lng);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold">Mô tả</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} autoComplete="off" className="h-9" />
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isHidden}
                onChange={(e) => setIsHidden(e.target.checked)}
                className="size-4 rounded border-input"
              />
              Ẩn chi nhánh này khỏi trang đặt sân công khai
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="h-10 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
            Hủy
          </DialogClose>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 gap-1.5 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
          >
            <Check className="size-4" />
            {isEdit ? "Cập nhật" : "Tạo chi nhánh"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/branches/branch-form-dialog.tsx
git commit -m "feat(web): add BranchFormDialog (create/edit, map, slug/email/district/phone/isHidden)"
```

---

### Task 10: `branch-images-dialog.tsx` and `delete-branch-dialog.tsx`

**Files:**
- Create: `apps/web/src/app/owner/branches/branch-images-dialog.tsx`
- Create: `apps/web/src/app/owner/branches/delete-branch-dialog.tsx`

**Interfaces:**
- Consumes: `BranchListItem` (Task 2), existing image proxy routes (`POST`/`DELETE /api/venues/mine/[venueId]/images...`, unchanged).
- Produces: both dialogs — consumed by `branch-actions.tsx` (Task 11).

- [ ] **Step 1: Implement `branch-images-dialog.tsx`**

Create `apps/web/src/app/owner/branches/branch-images-dialog.tsx` (logic moved from the now-deleted `venue-images-section.tsx`, wrapped in a controlled dialog instead of a page section):

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Images, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { VenueImage } from "../types";

export function BranchImagesDialog({
  open,
  onOpenChange,
  venueId,
  images,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  images: VenueImage[];
  onSaved: () => void;
}) {
  const [items, setItems] = useState(images);
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (next) setItems(images);
    onOpenChange(next);
  }

  async function handleAdd() {
    setError(null);
    const response = await fetch(`/api/venues/mine/${venueId}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: newUrl }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setError(data?.message ?? "URL không hợp lệ");
      return;
    }
    setItems((prev) => [...prev, data as VenueImage]);
    setNewUrl("");
    onSaved();
  }

  async function handleRemove(imageId: string) {
    const response = await fetch(`/api/venues/mine/${venueId}/images/${imageId}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("Không thể xoá ảnh, vui lòng thử lại.");
      return;
    }
    setItems((prev) => prev.filter((image) => image.id !== imageId));
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-800 to-blue-500 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-white">
            <Images className="size-5 text-white" />
            Ảnh chi nhánh
          </DialogTitle>
          <DialogClose className="text-white/80 outline-none hover:text-white" aria-label="Đóng">
            <X className="size-5" />
          </DialogClose>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">
          {items.length === 0 && <p className="text-sm text-muted-foreground">Chưa có ảnh nào.</p>}
          <ul className="flex flex-col gap-2">
            {items.map((image) => (
              <li key={image.id} className="flex items-center justify-between gap-2">
                <a href={image.url} target="_blank" rel="noreferrer" className="truncate text-sm underline">
                  {image.url}
                </a>
                <Button type="button" variant="outline" size="icon-sm" aria-label="Xoá ảnh" onClick={() => handleRemove(image.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="space-y-2">
            <Label htmlFor="newImageUrl">Thêm URL ảnh</Label>
            <div className="flex gap-2">
              <Input id="newImageUrl" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} className="h-9" />
              <Button type="button" onClick={handleAdd} className="h-9">
                Thêm
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Implement `delete-branch-dialog.tsx`**

Create `apps/web/src/app/owner/branches/delete-branch-dialog.tsx` (confirm-dialog chrome mirrors `deactivate-staff-dialog.tsx`; the 409 case gets a longer, specific message per the spec):

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { BranchListItem } from "./types";

export function DeleteBranchDialog({
  open,
  onOpenChange,
  venue,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venue: BranchListItem;
  onSaved: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    const response = await fetch(`/api/venues/mine/${venue.id}`, { method: "DELETE" });
    setSubmitting(false);
    if (!response.ok) {
      if (response.status === 409) {
        toast.error(
          'Chi nhánh đã có lịch sử đặt sân, không thể xoá. Dùng "Sửa" → Ẩn để ẩn khỏi trang công khai thay thế.',
        );
      } else {
        toast.error("Không thể xoá chi nhánh, vui lòng thử lại.");
      }
      onOpenChange(false);
      return;
    }
    toast.success("Đã xoá chi nhánh");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm p-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/40">
            <AlertTriangle className="size-8 text-red-500" />
          </div>
          <DialogTitle className="text-lg font-bold">Xoá chi nhánh?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Xoá <span className="font-semibold text-foreground">{venue.name}</span>? Hành động này không thể hoàn tác.
          </p>
        </div>
        <div className="mt-5 flex justify-center gap-3">
          <DialogClose className="rounded-lg border bg-muted/60 px-5 py-2 text-sm font-medium hover:bg-muted">
            Hủy
          </DialogClose>
          <Button onClick={handleConfirm} disabled={submitting} className="bg-red-600 px-5 text-white hover:bg-red-700">
            Xoá
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/owner/branches/branch-images-dialog.tsx apps/web/src/app/owner/branches/delete-branch-dialog.tsx
git commit -m "feat(web): add BranchImagesDialog and DeleteBranchDialog"
```

---

### Task 11: `branch-actions.tsx`, `branch-card.tsx`, `branch-row.tsx`

**Files:**
- Create: `apps/web/src/app/owner/branches/branch-actions.tsx`
- Create: `apps/web/src/app/owner/branches/branch-card.tsx`
- Create: `apps/web/src/app/owner/branches/branch-row.tsx`

**Interfaces:**
- Consumes: `BranchFormDialog` (Task 9), `BranchImagesDialog`/`DeleteBranchDialog` (Task 10), `publicUrl`/`formatMoney` (Task 3), the `set-default` proxy (Task 4).
- Produces: `BranchActions`, `BranchCard`, `BranchRow` — consumed by `page.tsx` (Task 12).

**Interface note:** `BranchActions` is shared by both layouts specifically to avoid duplicating the 3-dialog wiring (edit/images/delete) in two places — same reasoning as `PricingRuleRow` embedding its own dialogs rather than lifting them to the parent.

- [ ] **Step 1: Implement `branch-actions.tsx`**

Create `apps/web/src/app/owner/branches/branch-actions.tsx`:

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Images, Pencil, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BranchFormDialog } from "./branch-form-dialog";
import { BranchImagesDialog } from "./branch-images-dialog";
import { DeleteBranchDialog } from "./delete-branch-dialog";
import type { BranchListItem } from "./types";

export function BranchActions({ venue, onSaved }: { venue: BranchListItem; onSaved: () => void }) {
  const [imagesOpen, setImagesOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [settingDefault, setSettingDefault] = useState(false);

  async function handleSetDefault() {
    setSettingDefault(true);
    const response = await fetch(`/api/venues/mine/${venue.id}/set-default`, { method: "POST" });
    setSettingDefault(false);
    if (!response.ok) {
      toast.error("Không thể đặt làm mặc định, vui lòng thử lại.");
      return;
    }
    toast.success("Đã đặt làm chi nhánh mặc định");
    onSaved();
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!venue.isDefault && (
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Đặt làm mặc định"
          disabled={settingDefault}
          onClick={handleSetDefault}
          className="border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
        >
          <Star className="size-3.5" />
        </Button>
      )}
      <BranchFormDialog
        mode="edit"
        venue={venue}
        onSaved={onSaved}
        trigger={
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Sửa chi nhánh"
            className="border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/40"
          >
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Quản lý ảnh"
        onClick={() => setImagesOpen(true)}
        className="border-input text-muted-foreground hover:bg-muted"
      >
        <Images className="size-3.5" />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label="Xoá chi nhánh"
        onClick={() => setDeleteOpen(true)}
        className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
      >
        <Trash2 className="size-3.5" />
      </Button>

      <BranchImagesDialog
        open={imagesOpen}
        onOpenChange={setImagesOpen}
        venueId={venue.id}
        images={venue.images}
        onSaved={onSaved}
      />
      <DeleteBranchDialog open={deleteOpen} onOpenChange={setDeleteOpen} venue={venue} onSaved={onSaved} />
    </div>
  );
}
```

- [ ] **Step 2: Implement `branch-card.tsx`**

Create `apps/web/src/app/owner/branches/branch-card.tsx`:

```tsx
import { Mail, MapPin, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, publicUrl } from "./branch-format";
import { BranchActions } from "./branch-actions";
import type { BranchListItem } from "./types";

export function BranchCard({ venue, onSaved }: { venue: BranchListItem; onSaved: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{venue.name}</h3>
              {venue.isDefault && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400">
                  MẶC ĐỊNH
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{publicUrl(venue.slug)}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2 text-center text-xs">
          <div>
            <p className="font-semibold">{venue.courtsCount}</p>
            <p className="text-muted-foreground">Sân</p>
          </div>
          <div>
            <p className="font-semibold">{venue.bookingsThisMonth}</p>
            <p className="text-muted-foreground">Booking tháng</p>
          </div>
          <div>
            <p className="font-semibold">{formatMoney(venue.revenueThisMonth)}</p>
            <p className="text-muted-foreground">DT tháng</p>
          </div>
        </div>

        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            {venue.address || "Chưa có địa chỉ"}
          </span>
          <span className="flex items-center gap-1.5">
            <Phone className="size-3.5 shrink-0" />
            {venue.phone || "Chưa có SĐT"}
          </span>
          {venue.email && (
            <span className="flex items-center gap-1.5">
              <Mail className="size-3.5 shrink-0" />
              {venue.email}
            </span>
          )}
        </div>

        <BranchActions venue={venue} onSaved={onSaved} />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Implement `branch-row.tsx`**

Create `apps/web/src/app/owner/branches/branch-row.tsx` (same data, single-line layout for list view):

```tsx
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, publicUrl } from "./branch-format";
import { BranchActions } from "./branch-actions";
import type { BranchListItem } from "./types";

export function BranchRow({ venue, onSaved }: { venue: BranchListItem; onSaved: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{venue.name}</h3>
            {venue.isDefault && (
              <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400">
                MẶC ĐỊNH
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {publicUrl(venue.slug)} · {venue.address || "Chưa có địa chỉ"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4 text-sm">
          <span>
            <span className="font-semibold">{venue.courtsCount}</span> sân
          </span>
          <span>
            <span className="font-semibold">{venue.bookingsThisMonth}</span> booking
          </span>
          <span className="font-semibold text-blue-600 dark:text-blue-400">
            {formatMoney(venue.revenueThisMonth)}
          </span>
        </div>

        <BranchActions venue={venue} onSaved={onSaved} />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/owner/branches/branch-actions.tsx apps/web/src/app/owner/branches/branch-card.tsx apps/web/src/app/owner/branches/branch-row.tsx
git commit -m "feat(web): add BranchActions, BranchCard, BranchRow"
```

---

### Task 12: `page.tsx` — wire everything together, remove the old stub pages

**Files:**
- Modify: `apps/web/src/app/owner/branches/page.tsx` (full rewrite)
- Modify: `apps/web/src/app/owner/page.tsx` (fix dead link)
- Remove: `apps/web/src/app/owner/branches/new/` (whole dir)
- Remove: `apps/web/src/app/owner/branches/[id]/` (whole dir)

**Interfaces:**
- Consumes: every component from Tasks 3, 6, 7, 9, 11.

- [ ] **Step 1: Rewrite `page.tsx`**

Replace `apps/web/src/app/owner/branches/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { filterBranches, sortBranches, countByTab } from "./branch-format";
import { BranchMetrics } from "./branch-metrics";
import { BranchFilters } from "./branch-filters";
import { BranchFormDialog } from "./branch-form-dialog";
import { BranchCard } from "./branch-card";
import { BranchRow } from "./branch-row";
import type { BranchListItem, BranchTab, BranchSort } from "./types";

const VIEW_MODE_STORAGE_KEY = "branches-view-mode";

export default function OwnerBranchesPage() {
  const router = useRouter();

  const [allItems, setAllItems] = useState<BranchListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<BranchTab>("active");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<BranchSort>("default");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    if (localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "list") {
      setViewMode("list");
    }
  }, []);

  function handleViewModeChange(mode: "grid" | "list") {
    setViewMode(mode);
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadBranches = useCallback(() => {
    fetch("/api/venues/mine").then(async (res) => {
      if (res.status === 401) {
        router.push("/login?returnTo=%2Fowner%2Fbranches");
        return;
      }
      if (!res.ok) {
        setLoadError("Không tải được dữ liệu.");
        return;
      }
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) {
        setAllItems(data);
        setLoadError(null);
      } else {
        setLoadError("Không tải được dữ liệu.");
      }
    });
  }, [router]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const displayItems = sortBranches(
    filterBranches(allItems ?? [], { tab, search: debouncedSearch }),
    sort,
  );
  const counts = countByTab(allItems ?? []);

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Chi nhánh</h1>
        <BranchFormDialog
          mode="create"
          onSaved={loadBranches}
          trigger={
            <Button type="button" className="h-10 gap-2 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700">
              <Plus className="size-4" />
              Thêm chi nhánh mới
            </Button>
          }
        />
      </div>

      {loadError && (
        <div className="rounded-xl border border-input bg-card p-6 text-center text-sm text-muted-foreground">
          {loadError}
        </div>
      )}

      {!loadError && allItems && (
        <>
          <BranchMetrics items={allItems} />
          <BranchFilters
            tab={tab}
            search={search}
            sort={sort}
            viewMode={viewMode}
            counts={counts}
            onTabChange={setTab}
            onSearchChange={setSearch}
            onSortChange={setSort}
            onViewModeChange={handleViewModeChange}
          />

          {displayItems.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              {allItems.length === 0 ? "Bạn chưa có chi nhánh nào." : "Không tìm thấy chi nhánh phù hợp."}
            </p>
          )}

          {viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayItems.map((venue) => (
                <BranchCard key={venue.id} venue={venue} onSaved={loadBranches} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {displayItems.map((venue) => (
                <BranchRow key={venue.id} venue={venue} onSaved={loadBranches} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Remove the old sub-routes**

```bash
rm -rf "apps/web/src/app/owner/branches/new" "apps/web/src/app/owner/branches/[id]"
```

- [ ] **Step 3: Fix the dead link in `apps/web/src/app/owner/page.tsx`**

Change:
```tsx
          <Link href="/owner/branches/new" className="text-primary underline">
            Tạo chi nhánh mới
          </Link>{" "}
```
to:
```tsx
          <Link href="/owner/branches" className="text-primary underline">
            Tạo chi nhánh mới
          </Link>{" "}
```

- [ ] **Step 4: Remove dead `createVenueSchema`/`updateVenueSchema`**

In `apps/web/src/lib/schemas.ts`, delete these two blocks (their only real consumers were the pages just removed):

```ts
export const createVenueSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên địa điểm'),
  address: z.string().min(1, 'Vui lòng nhập địa chỉ'),
  city: z.string().min(1, 'Vui lòng nhập thành phố'),
  description: z.string().optional(),
});
export type CreateVenueInput = z.infer<typeof createVenueSchema>;

export const updateVenueSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên địa điểm').optional(),
  address: z.string().min(1, 'Vui lòng nhập địa chỉ').optional(),
  city: z.string().min(1, 'Vui lòng nhập thành phố').optional(),
  description: z.string().optional(),
  phone: z.string().optional(),
});
export type UpdateVenueInput = z.infer<typeof updateVenueSchema>;
```

In `apps/web/src/lib/schemas.test.ts`:
- Remove `createVenueSchema,` and `updateVenueSchema,` from the import block at the top.
- Remove the `describe('createVenueSchema', ...)` block and the `describe('updateVenueSchema', ...)` block (everything between the start of `describe('createVenueSchema'` and the start of `describe('addVenueImageSchema'`, exclusive of the latter).

- [ ] **Step 5: Type-check and test**

Run (from `apps/web`): `npx tsc --noEmit -p . && npm test`
Expected: type-check exits 0; all Vitest tests pass (schemas.test.ts no longer references the removed exports, branch-format.test.ts passes).

- [ ] **Step 6: Production build**

Run (from `apps/web`): `npm run build`
Expected: build succeeds with no new errors — this is the step most likely to surface a Leaflet/SSR issue if Task 8's `ssr: false` dynamic import isn't wired correctly, since `next build` prerenders every route.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/owner/branches/page.tsx apps/web/src/app/owner/page.tsx apps/web/src/lib/schemas.ts apps/web/src/lib/schemas.test.ts
git add -u apps/web/src/app/owner/branches
git commit -m "feat(web): wire up the full /owner/branches page, remove old sub-routes and dead venue schemas"
```

---

### Task 13: Manual browser verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Use the `run` skill (or `npm run dev` from `apps/web` if no project-specific script exists) to start the app, then log in as an existing owner test account.

- [ ] **Step 2: Walk the golden path**

1. Go to `/owner/branches` — 4 metric cards render.
2. Click "+ Thêm chi nhánh mới" — dialog opens; fill Tên/Địa chỉ/Tỉnh-Thành phố, click the map to drop a pin, click "Vị trí của tôi" (grant/deny browser permission and confirm both paths behave — success moves the pin, denial shows a toast). Submit → toast "Đã tạo chi nhánh...", new card appears, "Chi nhánh" metric increments.
3. Toggle grid⇄list — layout switches; reload the page — selection persists (localStorage).
4. Filter tabs Hoạt động/Đã ẩn/Tất cả and search by name/address/city — results match.
5. Click the star icon on a non-default branch — it becomes default (badge moves), the previous default loses its badge.
6. Click Sửa on a branch, tick "Ẩn chi nhánh này", save — it moves to the "Đã ẩn" tab.
7. Click Ảnh — add and remove an image URL, close the dialog, confirm the change persisted (reopen).
8. Click Xoá on a branch with no bookings — it disappears. Click Xoá on a branch known to have booking history (or create one via `/owner/bookings` first) — toast shows the "dùng Ẩn thay thế" message, branch remains.
9. Edit a branch's slug — confirm the public URL text on the card updates.
10. Confirm `/owner` dashboard's empty-state link (if reachable with zero venues on a fresh test account) goes to `/owner/branches`, not a 404.

- [ ] **Step 2: Report results**

Note any deviation from expected behavior found during manual verification. If everything matches, no code changes needed — this task is a checkpoint, not expected to produce commits.

---

## Full-suite check (after Task 13)

Run (from `apps/web`): `npx tsc --noEmit -p . && npm test && npm run build`
Run (from `apps/api`): `npm test && npm run test:e2e` (unrelated to this plan's changes, but confirms nothing cross-cutting broke)
Expected: everything green — this is the acceptance bar for the whole plan.
