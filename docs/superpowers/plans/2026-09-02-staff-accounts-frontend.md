# Staff Accounts Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the owner "Tài khoản" screen at `/owner/accounts` (role metric cards, role tabs, search, staff table, add/edit dialogs, reset-password and deactivate actions) on top of the already-implemented Staff API.

**Architecture:** Client-component page under `app/owner/accounts/` fetches from thin `/api/staff*` proxy routes (`fetchApi` → `toNextResponse`). No venue scope (staff belong to the owner, not a venue). All filtering/search/counting happens client-side over a single unfiltered `GET /staff` fetch (backend can't filter by `role=owner`, and per-owner staff lists are small). Pure formatting/filtering helpers are unit-tested (vitest); UI components are verified by typecheck + a final manual drive of the real screen.

**Tech Stack:** Next.js 16 (modified — see constraints), React 19, TypeScript, Tailwind v4, shadcn-style UI (`@base-ui/react`), lucide-react, sonner, vitest.

## Global Constraints

- **Modified Next.js:** this repo ships a customized Next.js. Before writing any route handler or page, READ the relevant guide under `apps/web/node_modules/next/dist/docs/` (per `apps/web/AGENTS.md`). Route handlers use `{ params }: { params: Promise<{…}> }` and `await params`. Do not remove the agent block Next writes into `AGENTS.md`.
- **All API access goes through `/api/*` proxy routes** using `fetchApi` + `toNextResponse` (never call the backend directly from client code). On upstream 401 in a *mutating* proxy (POST/PATCH), call `clearAuthCookies()`; GET proxies omit it — the client redirects to login on 401 itself.
- **No `components/ui/select`** exists in this repo — dropdowns use a native `<select>` styled with a local `SELECT_CLASS` constant (see Task 5).
- **No pagination** for `GET /staff` — the backend returns the full array (spec backend §5), unlike Customers.
- **Role dropdown excludes "Chủ sân"** — `POST/PATCH /staff` only accept `staffRole` ∈ `manager|cashier|staff` (backend spec §5-6); the frontend spec documents this deviation from `docs/spec/09-tai-khoan.md` in its §2.
- **Conventions:** Vietnamese labels; icons from `lucide-react`; toasts via `sonner`; reuse `@/components/ui/*` and `cn` from `@/lib/utils`; on client 401 → `router.push("/login?returnTo=%2Fowner%2Faccounts")`.
- **Working directory:** all commands run from `apps/web` unless noted.

---

### Task 1: Types + pure helpers, with unit tests

**Files:**
- Create: `apps/web/src/app/owner/accounts/types.ts`
- Create: `apps/web/src/app/owner/accounts/staff-format.ts`
- Test: `apps/web/src/app/owner/accounts/staff-format.test.ts`

**Interfaces:**
- Produces (consumed by every later task):
  - `StaffRole`, `AccountRole`, `AccountStatus`, `StaffListItem`, `RoleTab` (in `types.ts`)
  - `avatarInitials(fullName: string): string`
  - `avatarColor(name: string): string`
  - `roleKey(item: Pick<StaffListItem, "role" | "staffRole">): AccountRole`
  - `roleLabel(item: Pick<StaffListItem, "role" | "staffRole">): string`
  - `roleBadgeClasses(item: Pick<StaffListItem, "role" | "staffRole">): string`
  - `filterStaff(items: StaffListItem[], opts: { roleTab: RoleTab; search: string }): StaffListItem[]`
  - `countByRole(items: StaffListItem[]): Record<AccountRole, number>`

- [ ] **Step 1: Create `types.ts`**

```ts
// apps/web/src/app/owner/accounts/types.ts
export type StaffRole = "manager" | "cashier" | "staff";
export type AccountRole = "owner" | StaffRole;
export type AccountStatus =
  | "pending_verification"
  | "pending_approval"
  | "active"
  | "rejected"
  | "suspended";

export interface StaffListItem {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  role: "owner" | "staff";
  staffRole: StaffRole | null;
  status: AccountStatus;
}

export type RoleTab = "all" | "owner" | StaffRole;
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/src/app/owner/accounts/staff-format.test.ts
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
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/web && npx vitest run src/app/owner/accounts/staff-format.test.ts`
Expected: FAIL — `./staff-format` module not found.

- [ ] **Step 4: Implement `staff-format.ts`**

```ts
// apps/web/src/app/owner/accounts/staff-format.ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run src/app/owner/accounts/staff-format.test.ts`
Expected: PASS (all `describe` blocks).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/owner/accounts/types.ts apps/web/src/app/owner/accounts/staff-format.ts apps/web/src/app/owner/accounts/staff-format.test.ts
git commit -m "feat(web/accounts): add staff types and pure formatting helpers"
```

---

### Task 2: API proxy routes

Four thin forwarders to the backend Staff API (spec §4).

**Files:**
- Create: `apps/web/src/app/api/staff/route.ts`
- Create: `apps/web/src/app/api/staff/[id]/route.ts`
- Create: `apps/web/src/app/api/staff/[id]/deactivate/route.ts`
- Create: `apps/web/src/app/api/staff/[id]/reset-password/route.ts`

**Interfaces:**
- Consumes: `fetchApi` (`@/lib/fetch-api`), `toNextResponse` (`@/lib/proxy-response`), `clearAuthCookies` (`@/lib/auth-cookies`).
- Produces: `GET /api/staff`, `POST /api/staff`, `PATCH /api/staff/:id`, `POST /api/staff/:id/deactivate`, `POST /api/staff/:id/reset-password`.

- [ ] **Step 1: Create the list + create route**

Per spec §4.1, `GET` forwards with **no query string** — filtering/search happens client-side.

```ts
// apps/web/src/app/api/staff/route.ts
import { NextRequest } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { clearAuthCookies } from "@/lib/auth-cookies";
import { toNextResponse } from "@/lib/proxy-response";

export async function GET() {
  const upstream = await fetchApi("/staff");
  return toNextResponse(upstream);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetchApi("/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: Create the update route**

```ts
// apps/web/src/app/api/staff/[id]/route.ts
import { NextRequest } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { clearAuthCookies } from "@/lib/auth-cookies";
import { toNextResponse } from "@/lib/proxy-response";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const upstream = await fetchApi(`/staff/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 3: Create the deactivate route**

```ts
// apps/web/src/app/api/staff/[id]/deactivate/route.ts
import { NextRequest } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { clearAuthCookies } from "@/lib/auth-cookies";
import { toNextResponse } from "@/lib/proxy-response";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const upstream = await fetchApi(`/staff/${id}/deactivate`, { method: "POST" });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 4: Create the reset-password route**

```ts
// apps/web/src/app/api/staff/[id]/reset-password/route.ts
import { NextRequest } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { clearAuthCookies } from "@/lib/auth-cookies";
import { toNextResponse } from "@/lib/proxy-response";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const upstream = await fetchApi(`/staff/${id}/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/staff
git commit -m "feat(web/accounts): add proxy routes for staff API"
```

---

### Task 3: Presentational pieces — metric cards + filters

**Files:**
- Create: `apps/web/src/app/owner/accounts/staff-metrics.tsx`
- Create: `apps/web/src/app/owner/accounts/staff-filters.tsx`

**Interfaces:**
- Consumes: `AccountRole`, `RoleTab` (Task 1 types).
- Produces: `StaffMetrics({ counts: Record<AccountRole, number> })`, `StaffFilters({ roleTab, search, onRoleTabChange, onSearchChange })`.

- [ ] **Step 1: Create `staff-metrics.tsx`**

```tsx
// apps/web/src/app/owner/accounts/staff-metrics.tsx
import { Crown, ShieldCheck, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AccountRole } from "./types";

const CARD_STYLES = {
  purple: "bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  amber: "bg-amber-100 text-amber-500 dark:bg-amber-950/40 dark:text-amber-400",
  green: "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400",
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
  value: number;
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

export function StaffMetrics({ counts }: { counts: Record<AccountRole, number> }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <MetricCard icon={Crown} color="purple" label="Chủ sân" value={counts.owner} />
      <MetricCard icon={ShieldCheck} color="blue" label="Quản lý" value={counts.manager} />
      <MetricCard icon={Wallet} color="amber" label="Thu ngân" value={counts.cashier} />
      <MetricCard icon={Users} color="green" label="Nhân viên" value={counts.staff} />
    </div>
  );
}
```

- [ ] **Step 2: Create `staff-filters.tsx`**

```tsx
// apps/web/src/app/owner/accounts/staff-filters.tsx
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RoleTab } from "./types";

const TABS: { value: RoleTab; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "owner", label: "Chủ sân" },
  { value: "manager", label: "Quản lý" },
  { value: "cashier", label: "Thu ngân" },
  { value: "staff", label: "Nhân viên" },
];

export function StaffFilters({
  roleTab,
  search,
  onRoleTabChange,
  onSearchChange,
}: {
  roleTab: RoleTab;
  search: string;
  onRoleTabChange: (tab: RoleTab) => void;
  onSearchChange: (search: string) => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => {
            const active = roleTab === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => onRoleTabChange(t.value)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium",
                  active
                    ? "bg-blue-600 text-white"
                    : "border text-muted-foreground hover:bg-muted",
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm tên, SĐT, email..."
            className="h-9 w-56 border-0 px-0 focus-visible:ring-0"
          />
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/owner/accounts/staff-metrics.tsx apps/web/src/app/owner/accounts/staff-filters.tsx
git commit -m "feat(web/accounts): add staff metric cards and filters"
```

---

### Task 4: Staff table

**Files:**
- Create: `apps/web/src/app/owner/accounts/staff-table.tsx`

**Interfaces:**
- Consumes: `StaffListItem`, `AccountStatus` (Task 1); `avatarInitials`, `avatarColor`, `roleLabel`, `roleBadgeClasses` (Task 1); `StaffFormDialog` (Task 5, mode `"edit"`); `ResetPasswordDialog`, `DeactivateStaffDialog` (Task 6).
- Produces: `StaffTable({ items: StaffListItem[]; onSaved: () => void })`.

This task's row actions embed the Task 5/6 dialogs directly (same pattern as `pricing-rules-tab.tsx`'s row-level delete dialog) — so it's written *after* Tasks 5 and 6 exist. Do Tasks 5 and 6 before this one, or stub the two imports with a `// TODO(Task 6)` comment and come back — **do not leave the stub**; finish Tasks 5–6 first, then write this file for real.

- [ ] **Step 1: Create `staff-table.tsx`**

```tsx
// apps/web/src/app/owner/accounts/staff-table.tsx
import { useState } from "react";
import { Ban, KeyRound, Pencil } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { avatarColor, avatarInitials, roleBadgeClasses, roleLabel } from "./staff-format";
import { StaffFormDialog } from "./staff-form-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { DeactivateStaffDialog } from "./deactivate-staff-dialog";
import type { AccountStatus, StaffListItem } from "./types";

const STATUS_META: Record<AccountStatus, { label: string; cls: string }> = {
  active: {
    label: "Hoạt động",
    cls: "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  },
  suspended: {
    label: "Đã khoá",
    cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  pending_verification: {
    label: "Chờ xác thực",
    cls: "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  },
  pending_approval: {
    label: "Chờ duyệt",
    cls: "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  },
  rejected: {
    label: "Bị từ chối",
    cls: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400",
  },
};

export function StaffTable({
  items,
  onSaved,
}: {
  items: StaffListItem[];
  onSaved: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead>TÀI KHOẢN</TableHead>
              <TableHead>SĐT</TableHead>
              <TableHead>EMAIL</TableHead>
              <TableHead>VAI TRÒ</TableHead>
              <TableHead>TRẠNG THÁI</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  Chưa có tài khoản nào.
                </TableCell>
              </TableRow>
            )}
            {items.map((item) => (
              <StaffRow key={item.id} item={item} onSaved={onSaved} />
            ))}
          </TableBody>
        </Table>
        <div className="border-t px-4 py-3 text-sm text-muted-foreground">
          {items.length} tài khoản
        </div>
      </CardContent>
    </Card>
  );
}

function StaffRow({ item, onSaved }: { item: StaffListItem; onSaved: () => void }) {
  const [resetOpen, setResetOpen] = useState(false);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const status = STATUS_META[item.status];

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <span
            className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${avatarColor(item.fullName)}`}
          >
            {avatarInitials(item.fullName)}
          </span>
          <span className="font-semibold">{item.fullName}</span>
        </div>
      </TableCell>
      <TableCell>{item.phone ?? "—"}</TableCell>
      <TableCell>{item.email ?? "—"}</TableCell>
      <TableCell>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeClasses(item)}`}
        >
          {roleLabel(item)}
        </span>
      </TableCell>
      <TableCell>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}
        >
          {status.label}
        </span>
      </TableCell>
      <TableCell className="text-right">
        {item.role === "staff" && (
          <div className="flex justify-end gap-1.5">
            <StaffFormDialog
              mode="edit"
              staff={item}
              onSaved={onSaved}
              trigger={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Sửa nhân viên"
                  className="border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/40"
                >
                  <Pencil className="size-3.5" />
                </Button>
              }
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label="Đặt lại mật khẩu"
              onClick={() => setResetOpen(true)}
              className="border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
            >
              <KeyRound className="size-3.5" />
            </Button>
            <ResetPasswordDialog
              open={resetOpen}
              onOpenChange={setResetOpen}
              staffId={item.id}
              staffName={item.fullName}
            />
            {item.status !== "suspended" && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label="Vô hiệu hoá"
                  onClick={() => setDeactivateOpen(true)}
                  className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Ban className="size-3.5" />
                </Button>
                <DeactivateStaffDialog
                  open={deactivateOpen}
                  onOpenChange={setDeactivateOpen}
                  staffId={item.id}
                  staffName={item.fullName}
                  onSaved={onSaved}
                />
              </>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 2: Typecheck**

This will fail until Tasks 5–6 exist (`staff-form-dialog`, `reset-password-dialog`, `deactivate-staff-dialog` not found yet) — expected at this point.

Run: `cd apps/web && npx tsc --noEmit`
Expected: errors only about the 3 missing modules; no other errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/accounts/staff-table.tsx
git commit -m "feat(web/accounts): add staff table (depends on Task 5-6 dialogs)"
```

---

### Task 5: Add/edit staff dialog

**Files:**
- Create: `apps/web/src/app/owner/accounts/staff-form-dialog.tsx`

**Interfaces:**
- Consumes: `StaffListItem`, `StaffRole` (Task 1).
- Produces: `StaffFormDialog` accepting either `{ mode: "create"; trigger; onSaved }` or `{ mode: "edit"; staff: StaffListItem; trigger; onSaved }`.

- [ ] **Step 1: Create `staff-form-dialog.tsx`**

```tsx
// apps/web/src/app/owner/accounts/staff-form-dialog.tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Mail, Phone, User, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { StaffListItem, StaffRole } from "./types";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: "staff", label: "Nhân viên" },
  { value: "cashier", label: "Thu ngân" },
  { value: "manager", label: "Quản lý" },
];

interface CreateProps {
  mode: "create";
  trigger: React.ReactElement;
  onSaved: () => void;
}
interface EditProps {
  mode: "edit";
  staff: StaffListItem;
  trigger: React.ReactElement;
  onSaved: () => void;
}

export function StaffFormDialog(props: CreateProps | EditProps) {
  const { trigger, onSaved, mode } = props;
  const isEdit = mode === "edit";
  const staff = props.mode === "edit" ? props.staff : undefined;

  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [staffRole, setStaffRole] = useState<StaffRole>("staff");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFullName(staff?.fullName ?? "");
    setPhone(staff?.phone ?? "");
    setEmail(staff?.email ?? "");
    setStaffRole(staff?.staffRole ?? "staff");
    setPassword("");
  }, [open]);

  async function handleSubmit() {
    if (!fullName.trim() || !phone.trim()) {
      toast.error("Vui lòng nhập họ tên và số điện thoại");
      return;
    }
    if (!isEdit && password.trim().length < 6) {
      toast.error("Mật khẩu tối thiểu 6 ký tự");
      return;
    }

    setSubmitting(true);
    const body = isEdit
      ? {
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          staffRole,
        }
      : {
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          staffRole,
          password,
        };
    const response = await fetch(isEdit ? `/api/staff/${staff!.id}` : "/api/staff", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      if (isEdit && response.status === 404) {
        // Stale id (row belonged to a list snapshot that's no longer valid) —
        // can't normally happen since ids come from our own loaded list, but
        // per spec §7 close the dialog and resync rather than leave it stuck.
        onSaved();
        setOpen(false);
      }
      return;
    }
    toast.success(isEdit ? "Đã cập nhật nhân viên" : "Đã thêm nhân viên");
    onSaved();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-600 to-cyan-400 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-white">
            <UserPlus className="size-5 text-white" />
            {isEdit ? "Sửa nhân viên" : "Thêm nhân viên"}
          </DialogTitle>
          <DialogClose className="text-white/80 outline-none hover:text-white" aria-label="Đóng">
            <X className="size-5" />
          </DialogClose>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">
                Họ và tên <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
                <User className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="h-9 border-0 px-0 focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">
                Số điện thoại <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
                <Phone className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0901 234 567"
                  className="h-9 border-0 px-0 focus-visible:ring-0"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">Email</Label>
              <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
                <Mail className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="h-9 border-0 px-0 focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">
                Vai trò <span className="text-destructive">*</span>
              </Label>
              <select
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value as StaffRole)}
                className={SELECT_CLASS}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label className="font-semibold">
                Mật khẩu <span className="text-destructive">*</span>
              </Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className="h-9"
              />
            </div>
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
            Lưu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: errors only about `./reset-password-dialog` / `./deactivate-staff-dialog` not existing yet if `staff-table.tsx` (Task 4) was already created — none from this file itself.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/accounts/staff-form-dialog.tsx
git commit -m "feat(web/accounts): add add/edit staff dialog"
```

---

### Task 6: Reset-password and deactivate dialogs

**Files:**
- Create: `apps/web/src/app/owner/accounts/reset-password-dialog.tsx`
- Create: `apps/web/src/app/owner/accounts/deactivate-staff-dialog.tsx`

**Interfaces:**
- Produces:
  - `ResetPasswordDialog({ open, onOpenChange, staffId, staffName })` — controlled dialog (parent owns `open` state, per `StaffRow` in Task 4).
  - `DeactivateStaffDialog({ open, onOpenChange, staffId, staffName, onSaved })` — controlled dialog.

- [ ] **Step 1: Create `reset-password-dialog.tsx`**

```tsx
// apps/web/src/app/owner/accounts/reset-password-dialog.tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, KeyRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";

export function ResetPasswordDialog({
  open,
  onOpenChange,
  staffId,
  staffName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string;
  staffName: string;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) setNewPassword("");
  }, [open]);

  async function handleSubmit() {
    if (newPassword.trim().length < 6) {
      toast.error("Mật khẩu tối thiểu 6 ký tự");
      return;
    }
    setSubmitting(true);
    const response = await fetch(`/api/staff/${staffId}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      // Stale id (spec §7): close rather than leave the dialog stuck — no
      // list reload needed here, this dialog never changes table data.
      if (response.status === 404) {
        onOpenChange(false);
      }
      return;
    }
    toast.success("Đã đặt lại mật khẩu");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-gradient-to-r from-amber-600 to-orange-400 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold text-white">
            <KeyRound className="size-5 text-white" />
            Đặt lại mật khẩu
          </DialogTitle>
          <DialogClose className="text-white/80 outline-none hover:text-white" aria-label="Đóng">
            <X className="size-5" />
          </DialogClose>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">
          <p className="text-sm text-muted-foreground">
            Đặt lại mật khẩu cho <span className="font-semibold text-foreground">{staffName}</span>
          </p>
          <div className="space-y-1.5">
            <Label className="font-semibold">
              Mật khẩu mới <span className="text-destructive">*</span>
            </Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Tối thiểu 6 ký tự"
              className="h-9"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="h-10 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
            Hủy
          </DialogClose>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 gap-1.5 rounded-xl bg-amber-600 px-4 font-medium text-white hover:bg-amber-700"
          >
            <Check className="size-4" />
            Xác nhận
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create `deactivate-staff-dialog.tsx`**

```tsx
// apps/web/src/app/owner/accounts/deactivate-staff-dialog.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";

export function DeactivateStaffDialog({
  open,
  onOpenChange,
  staffId,
  staffName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffId: string;
  staffName: string;
  onSaved: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    const response = await fetch(`/api/staff/${staffId}/deactivate`, { method: "POST" });
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      // Stale id (spec §7): close and resync instead of leaving the confirm
      // dialog stuck on a row that no longer matches the backend.
      if (response.status === 404) {
        onOpenChange(false);
        onSaved();
      }
      return;
    }
    toast.success("Đã vô hiệu hoá tài khoản");
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
          <DialogTitle className="text-lg font-bold">Vô hiệu hoá tài khoản?</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Vô hiệu hoá <span className="font-semibold text-foreground">{staffName}</span>? Nhân
            viên này sẽ không thể đăng nhập.
          </p>
        </div>
        <div className="mt-5 flex justify-center gap-3">
          <DialogClose className="rounded-lg border bg-muted/60 px-5 py-2 text-sm font-medium hover:bg-muted">
            Hủy
          </DialogClose>
          <Button
            onClick={handleConfirm}
            disabled={submitting}
            className="bg-red-600 px-5 text-white hover:bg-red-700"
          >
            Vô hiệu hoá
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors (Tasks 1, 5, 6 now all exist, satisfying `staff-table.tsx`'s imports from Task 4).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/owner/accounts/reset-password-dialog.tsx apps/web/src/app/owner/accounts/deactivate-staff-dialog.tsx
git commit -m "feat(web/accounts): add reset-password and deactivate dialogs"
```

---

### Task 7: Wire the page + replace the placeholder

**Files:**
- Modify (replace): `apps/web/src/app/owner/accounts/page.tsx`

**Interfaces:**
- Consumes: all Task 1–6 components/helpers.

- [ ] **Step 1: Replace the placeholder page**

```tsx
// apps/web/src/app/owner/accounts/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { countByRole, filterStaff } from "./staff-format";
import { StaffMetrics } from "./staff-metrics";
import { StaffFilters } from "./staff-filters";
import { StaffTable } from "./staff-table";
import { StaffFormDialog } from "./staff-form-dialog";
import type { RoleTab, StaffListItem } from "./types";

export default function OwnerAccountsPage() {
  const router = useRouter();

  const [allItems, setAllItems] = useState<StaffListItem[] | null>(null);
  const [loadError, setLoadError] = useState<"forbidden" | "other" | null>(null);
  const [roleTab, setRoleTab] = useState<RoleTab>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const loadStaff = useCallback(() => {
    fetch("/api/staff").then(async (res) => {
      if (res.status === 401) {
        router.push("/login?returnTo=%2Fowner%2Faccounts");
        return;
      }
      if (res.status === 403) {
        setLoadError("forbidden");
        return;
      }
      if (!res.ok) {
        setLoadError("other");
        return;
      }
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) {
        setAllItems(data);
        setLoadError(null);
      } else {
        setLoadError("other");
      }
    });
  }, [router]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const displayItems = filterStaff(allItems ?? [], { roleTab, search: debouncedSearch });
  const counts = countByRole(allItems ?? []);

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Tài khoản</h1>
        <StaffFormDialog
          mode="create"
          onSaved={loadStaff}
          trigger={
            <Button
              type="button"
              className="h-10 gap-2 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
            >
              <UserPlus className="size-4" />
              Thêm nhân viên
            </Button>
          }
        />
      </div>

      {loadError === "forbidden" && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          Bạn không có quyền truy cập trang này.
        </div>
      )}
      {loadError === "other" && (
        <div className="rounded-xl border border-input bg-card p-6 text-center text-sm text-muted-foreground">
          Không tải được dữ liệu.
        </div>
      )}

      {!loadError && allItems && (
        <>
          <StaffMetrics counts={counts} />
          <StaffFilters
            roleTab={roleTab}
            search={search}
            onRoleTabChange={setRoleTab}
            onSearchChange={setSearch}
          />
          <StaffTable items={displayItems} onSaved={loadStaff} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no type errors.

Run: `cd apps/web && npx eslint src/app/owner/accounts src/app/api/staff`
Expected: `react-hooks/set-state-in-effect` errors on the reset-on-open effects in `staff-form-dialog.tsx` (Task 5) and `reset-password-dialog.tsx` (Task 6) — this is an accepted, pre-existing pattern already present in `apps/web/src/app/owner/customers/add-customer-dialog.tsx` (verify with `npx eslint src/app/owner/customers/add-customer-dialog.tsx` — it fails the same way). Do not try to fix or suppress it; it matches the codebase's established convention for "reset form fields when a dialog opens." No other errors should appear. (The repo's full `npm run lint` also reports pre-existing unrelated errors in `app-shell.tsx`/`branch-context.tsx` — ignore those too, out of scope for this plan.)

- [ ] **Step 3: Run the unit test suite**

Run: `cd apps/web && npm test`
Expected: PASS, including the new `staff-format.test.ts` suite from Task 1.

- [ ] **Step 4: Drive the real screen**

Use the **`run`/`verify` skill** (or start both dev servers — `cd apps/api && npm run start:dev`, `cd apps/web && npm run dev`) to load `/owner/accounts` as a logged-in owner and confirm end-to-end. Demo accounts already exist (`owner@demo.com` / `demo1234`, plus `manager@demo.com`, `cashier@demo.com`, `staff@demo.com` — same password):

1. Metric cards show 1 Chủ sân + counts matching the seeded staff; role tabs switch and re-filter the table (including the "Chủ sân" tab, showing exactly the owner row); metric cards do NOT change when switching tabs.
2. Search by phone/email narrows results across all roles.
3. "+ Thêm nhân viên" creates a new staff row (appears immediately, no reload); duplicate phone shows the conflict toast; role dropdown only offers Nhân viên/Thu ngân/Quản lý.
4. Pencil icon edits an existing staff row's name/role; the owner row itself has no action icons.
5. Key icon resets a staff member's password; log out and log back in as that staff member (by phone) with the new password to confirm it took effect.
6. Ban icon deactivates a staff member (with confirmation) → status badge flips to "Đã khoá", action icons disappear except none remain; attempt to log in as that account → rejected.
7. Log in as `cashier@demo.com` (operational tier) and navigate directly to `/owner/accounts` → see the "Bạn không có quyền truy cập trang này" message, not a crash.

Record what you observed. If anything fails, stop and fix before committing.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/owner/accounts/page.tsx
git commit -m "feat(web/accounts): wire up the Tài khoản screen"
```

---

## Spec Coverage Check

- **§4 route proxies** → Task 2 (list+create, update, deactivate, reset-password).
- **§5.1 types** → Task 1. **§5.2 pure helpers** → Task 1. **§5.3 metrics** → Task 3. **§5.4 filters** → Task 3. **§5.5 table** → Task 4. **§5.6 form dialog** → Task 5. **§5.7 deactivate dialog** → Task 6. **§5.8 reset-password dialog** → Task 6. **§5.9 page orchestration** → Task 7.
- **§2 deviations from the survey doc** (no "Chủ sân" role option, client-side "Chủ sân" tab filter, no actions on the owner row, no reactivate) → Task 5 (role dropdown), Task 1 `filterStaff` (owner tab), Task 4 `StaffRow` (`item.role === "staff"` guard), Task 6 (no reactivate button exists).
- **§6 route guard gap** → Task 7 Step 1 (`loadError === "forbidden"` handling) + Step 4 scenario 7 (manual verification with a cashier account).
- **§7 validation** → required-field/min-length checks in Task 5 (`handleSubmit`) and Task 6 (`ResetPasswordDialog`); 409 handling via `getSubmitErrorMessage` in both; 404 (stale id) closes the dialog and resyncs in Task 5 (`StaffFormDialog`, edit mode) and Task 6 (both dialogs).
- **§8 testing** → Task 1 unit tests (`avatarInitials`, `avatarColor`, `roleKey`, `roleLabel`, `roleBadgeClasses`, `filterStaff`, `countByRole`); manual drive in Task 7 Step 4.
- **§9 out of scope** (owner-section-wide route guard, reactivation, self-service staff, audit log) — not built, matches spec.
