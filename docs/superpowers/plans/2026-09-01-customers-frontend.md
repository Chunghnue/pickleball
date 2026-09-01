# Customers Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the owner "Khách hàng" screen at `/owner/customers` (metric cards, tier tabs, search, paginated table, add-customer dialog, detail modal with a working "Đặt sân cho khách này") on top of the Customers API.

**Architecture:** Client-component page under `app/owner/customers/` fetches from thin `/api/*` proxy routes (`fetchApi` → `toNextResponse`). Venue scope via the global `useBranch()` selector. Pure formatting/query helpers are unit-tested (vitest); UI components are verified by typecheck + a final manual drive of the real screen. The "book for this customer" action reuses `QuickBookDialog`, extended with a prefilled-customer mode and a standalone date/venue picker.

**Tech Stack:** Next.js 16 (modified — see constraints), React 19, TypeScript, Tailwind v4, shadcn-style UI, lucide-react, sonner, vitest.

## Global Constraints

- **Modified Next.js:** This repo ships a customized Next.js. Before writing any route handler or page, READ the relevant guide under `apps/web/node_modules/next/dist/docs/` (per `apps/web/AGENTS.md`). Route handlers use `{ params }: { params: Promise<{…}> }` and `await params`; read query via `request.nextUrl.searchParams`. Do not remove the agent block Next writes into `AGENTS.md`.
- **All API access goes through `/api/*` proxy routes** using `fetchApi` + `toNextResponse` (never call the backend directly from client code). On upstream 401 in a proxy, call `clearAuthCookies()` (mutations) — GET proxies may omit it; the client redirects to login on 401.
- **Venue scope:** `useBranch()` → `selectedVenueId`. Pass `venueId` to the API only when `selectedVenueId !== ALL_BRANCHES_ID` (`"all"`); otherwise omit (aggregate all venues).
- **Conventions:** Vietnamese labels; currency via `new Intl.NumberFormat("vi-VN")` then `…đ`; icons from `lucide-react`; toasts via `sonner`; reuse `@/components/ui/*` and `cn` from `@/lib/utils`; on client 401 → `router.push("/login?returnTo=%2Fowner%2Fcustomers")`.
- **Working directory:** all commands run from `apps/web` unless noted.

---

### Task 1: Pure helpers (formatting + query) with unit tests

Testable pure functions the UI depends on. Fully TDD.

**Files:**
- Create: `apps/web/src/app/owner/customers/types.ts`
- Create: `apps/web/src/app/owner/customers/customer-format.ts`
- Test: `apps/web/src/app/owner/customers/customer-format.test.ts`

**Interfaces:**
- Produces (types consumed by every later task):
  - `CustomerKind`, `CustomerTier`, `CustomerListItem`, `CustomerListResponse`, `CustomerSummary`, `CustomerDetail` (in `types.ts`)
  - `avatarInitials(fullName: string): string`
  - `tierLabel(tier: CustomerTier): string`
  - `tierClasses(tier: CustomerTier): string`
  - `formatShortDate(value: string | null): string`
  - `buildCustomersQuery(params: { venueId?: string; tier: CustomerTier | "all"; search: string; page: number; pageSize?: number }): string`

- [ ] **Step 1: Create `types.ts`**

```ts
// apps/web/src/app/owner/customers/types.ts
export type CustomerKind = "registered" | "walkin";
export type CustomerTier = "new" | "regular" | "vip";

export interface CustomerListItem {
  kind: CustomerKind;
  id: string;
  fullName: string;
  phone: string | null;
  totalBookings: number;
  totalSpent: number;
  lastBookingAt: string | null;
  tier: CustomerTier;
  customerCode: string;
}

export interface CustomerListResponse {
  items: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CustomerSummary {
  totalCustomers: number;
  vipCustomers: number;
  totalBookings: number;
  totalSpent: number;
}

export interface CustomerDetail extends CustomerListItem {
  email?: string;
  address?: string;
  note?: string;
  joinedAt: string;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// apps/web/src/app/owner/customers/customer-format.test.ts
import { describe, it, expect } from "vitest";
import {
  avatarInitials,
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/web && npm test -- customer-format`
Expected: FAIL — cannot resolve `./customer-format`.

- [ ] **Step 4: Implement the helpers**

```ts
// apps/web/src/app/owner/customers/customer-format.ts
import type { CustomerTier } from "./types";

export function avatarInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

const TIER_LABELS: Record<CustomerTier, string> = {
  new: "Mới",
  regular: "Thường xuyên",
  vip: "VIP",
};

const TIER_CLASSES: Record<CustomerTier, string> = {
  new: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  regular: "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  vip: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
};

export function tierLabel(tier: CustomerTier): string {
  return TIER_LABELS[tier];
}

export function tierClasses(tier: CustomerTier): string {
  return TIER_CLASSES[tier];
}

export function formatShortDate(value: string | null): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
}

export function buildCustomersQuery(params: {
  venueId?: string;
  tier: CustomerTier | "all";
  search: string;
  page: number;
  pageSize?: number;
}): string {
  const sp = new URLSearchParams();
  if (params.venueId) sp.set("venueId", params.venueId);
  if (params.tier !== "all") sp.set("tier", params.tier);
  const search = params.search.trim();
  if (search) sp.set("search", search);
  sp.set("page", String(params.page));
  sp.set("pageSize", String(params.pageSize ?? 20));
  return sp.toString();
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npm test -- customer-format`
Expected: PASS (all describe blocks green).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/owner/customers/types.ts apps/web/src/app/owner/customers/customer-format.ts apps/web/src/app/owner/customers/customer-format.test.ts
git commit -m "feat(web/customers): add customer types and pure formatting/query helpers"
```

---

### Task 2: API proxy routes

Four thin forwarders to the backend Customers API.

**Files:**
- Create: `apps/web/src/app/api/customers/route.ts`
- Create: `apps/web/src/app/api/customers/summary/route.ts`
- Create: `apps/web/src/app/api/customers/[kind]/[id]/route.ts`
- Create: `apps/web/src/app/api/customer-contacts/route.ts`

**Interfaces:**
- Consumes: `fetchApi`, `toNextResponse`, `clearAuthCookies`.
- Produces: `GET /api/customers`, `GET /api/customers/summary`, `GET /api/customers/:kind/:id`, `POST /api/customer-contacts`.

- [ ] **Step 1: Create the list route (forwards querystring)**

```ts
// apps/web/src/app/api/customers/route.ts
import { NextRequest } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { toNextResponse } from "@/lib/proxy-response";

export async function GET(request: NextRequest) {
  const qs = request.nextUrl.searchParams.toString();
  const upstream = await fetchApi(`/customers${qs ? `?${qs}` : ""}`);
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: Create the summary route**

```ts
// apps/web/src/app/api/customers/summary/route.ts
import { NextRequest } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { toNextResponse } from "@/lib/proxy-response";

export async function GET(request: NextRequest) {
  const qs = request.nextUrl.searchParams.toString();
  const upstream = await fetchApi(`/customers/summary${qs ? `?${qs}` : ""}`);
  return toNextResponse(upstream);
}
```

- [ ] **Step 3: Create the detail route**

```ts
// apps/web/src/app/api/customers/[kind]/[id]/route.ts
import { NextRequest } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { toNextResponse } from "@/lib/proxy-response";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  const upstream = await fetchApi(`/customers/${kind}/${id}`);
  return toNextResponse(upstream);
}
```

- [ ] **Step 4: Create the create-contact route**

```ts
// apps/web/src/app/api/customer-contacts/route.ts
import { NextRequest } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { clearAuthCookies } from "@/lib/auth-cookies";
import { toNextResponse } from "@/lib/proxy-response";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetchApi("/customer-contacts", {
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
git add apps/web/src/app/api/customers apps/web/src/app/api/customer-contacts
git commit -m "feat(web/customers): add proxy routes for customers API"
```

---

### Task 3: Presentational pieces — tier badge + metric cards

**Files:**
- Create: `apps/web/src/app/owner/customers/tier-badge.tsx`
- Create: `apps/web/src/app/owner/customers/customer-metrics.tsx`

**Interfaces:**
- Consumes: `CustomerTier`, `CustomerSummary` (Task 1); `tierLabel`, `tierClasses` (Task 1).
- Produces: `<TierBadge tier />`, `<CustomerMetrics summary />`.

- [ ] **Step 1: Create the tier badge**

```tsx
// apps/web/src/app/owner/customers/tier-badge.tsx
import { tierClasses, tierLabel } from "./customer-format";
import type { CustomerTier } from "./types";

export function TierBadge({ tier }: { tier: CustomerTier }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tierClasses(tier)}`}
    >
      {tierLabel(tier)}
    </span>
  );
}
```

- [ ] **Step 2: Create the metric cards** (mirrors `dashboard/stat-cards.tsx`)

```tsx
// apps/web/src/app/owner/customers/customer-metrics.tsx
import { CalendarCheck, Crown, Users, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CustomerSummary } from "./types";

const currencyFormatter = new Intl.NumberFormat("vi-VN");

const CARD_STYLES = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  green: "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  pink: "bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400",
} as const;

function MetricCard({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: typeof Users;
  color: keyof typeof CARD_STYLES;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${CARD_STYLES[color]}`}
        >
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function CustomerMetrics({ summary }: { summary: CustomerSummary }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <MetricCard icon={Users} color="blue" label="Tổng khách" value={String(summary.totalCustomers)} />
      <MetricCard icon={Crown} color="amber" label="Khách VIP" value={String(summary.vipCustomers)} />
      <MetricCard icon={CalendarCheck} color="green" label="Tổng lượt đặt" value={String(summary.totalBookings)} />
      <MetricCard
        icon={Wallet}
        color="pink"
        label="Tổng doanh thu"
        value={`${currencyFormatter.format(summary.totalSpent)} đ`}
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/owner/customers/tier-badge.tsx apps/web/src/app/owner/customers/customer-metrics.tsx
git commit -m "feat(web/customers): add tier badge and metric cards"
```

---

### Task 4: Filters + table

**Files:**
- Create: `apps/web/src/app/owner/customers/customer-filters.tsx`
- Create: `apps/web/src/app/owner/customers/customer-table.tsx`

**Interfaces:**
- Consumes: `CustomerListItem`, `CustomerTier` (Task 1); `avatarInitials`, `formatShortDate` (Task 1); `<TierBadge>` (Task 3).
- Produces:
  - `<CustomerFilters tier search onTierChange onSearchChange />`
  - `<CustomerTable items page pageSize total onOpenDetail onPrev onNext />`

- [ ] **Step 1: Create the filters**

```tsx
// apps/web/src/app/owner/customers/customer-filters.tsx
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CustomerTier } from "./types";

const TABS: { value: CustomerTier | "all"; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "vip", label: "VIP" },
  { value: "regular", label: "Thường xuyên" },
  { value: "new", label: "Mới" },
];

export function CustomerFilters({
  tier,
  search,
  onTierChange,
  onSearchChange,
}: {
  tier: CustomerTier | "all";
  search: string;
  onTierChange: (tier: CustomerTier | "all") => void;
  onSearchChange: (search: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onTierChange(t.value)}
            className={cn(
              "h-9 rounded-lg px-3 text-sm font-medium",
              tier === t.value
                ? "bg-blue-600 text-white"
                : "border text-muted-foreground hover:bg-muted",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Tìm theo tên hoặc SĐT..."
          className="h-9 w-56 border-0 px-0 focus-visible:ring-0"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the table**

```tsx
// apps/web/src/app/owner/customers/customer-table.tsx
import { Eye } from "lucide-react";
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
import { avatarInitials, formatShortDate } from "./customer-format";
import { TierBadge } from "./tier-badge";
import type { CustomerListItem } from "./types";

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export function CustomerTable({
  items,
  page,
  pageSize,
  total,
  onOpenDetail,
  onPrev,
  onNext,
}: {
  items: CustomerListItem[];
  page: number;
  pageSize: number;
  total: number;
  onOpenDetail: (item: CustomerListItem) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead className="w-10">#</TableHead>
              <TableHead>Khách hàng</TableHead>
              <TableHead>SĐT</TableHead>
              <TableHead>Lượt đặt</TableHead>
              <TableHead>Tổng tiền</TableHead>
              <TableHead>Lần cuối</TableHead>
              <TableHead>Loại</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Chưa có khách hàng nào.
                </TableCell>
              </TableRow>
            )}
            {items.map((item, index) => (
              <TableRow key={`${item.kind}-${item.id}`}>
                <TableCell className="text-muted-foreground">
                  {(page - 1) * pageSize + index + 1}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {avatarInitials(item.fullName)}
                    </span>
                    <span className="font-medium">{item.fullName}</span>
                  </div>
                </TableCell>
                <TableCell>{item.phone ?? "—"}</TableCell>
                <TableCell>{item.totalBookings}</TableCell>
                <TableCell className="font-medium">
                  {currencyFormatter.format(item.totalSpent)}đ
                </TableCell>
                <TableCell>{formatShortDate(item.lastBookingAt)}</TableCell>
                <TableCell>
                  <TierBadge tier={item.tier} />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Xem chi tiết"
                    onClick={() => onOpenDetail(item)}
                  >
                    <Eye className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
          <span>
            Hiển thị {from}–{to} / {total}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onPrev} disabled={page <= 1}>
              Trước
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onNext}
              disabled={page * pageSize >= total}
            >
              Sau
            </Button>
          </div>
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
git add apps/web/src/app/owner/customers/customer-filters.tsx apps/web/src/app/owner/customers/customer-table.tsx
git commit -m "feat(web/customers): add filter tabs, search and paginated table"
```

---

### Task 5: Add-customer + detail dialogs

**Files:**
- Create: `apps/web/src/app/owner/customers/add-customer-dialog.tsx`
- Create: `apps/web/src/app/owner/customers/customer-detail-dialog.tsx`

**Interfaces:**
- Consumes: `Dialog*` from `@/components/ui/dialog`, `Input`, `Label`, `Button`; `getSubmitErrorMessage`; `CustomerDetail`, `CustomerListItem` (Task 1); `<TierBadge>`, `avatarInitials`, `formatShortDate`.
- Produces:
  - `<AddCustomerDialog open onOpenChange onCreated />` — POSTs `/api/customer-contacts`.
  - `<CustomerDetailDialog open onOpenChange target onBookForCustomer />` — fetches detail, exposes book action.

- [ ] **Step 1: Create the add-customer dialog**

```tsx
// apps/web/src/app/owner/customers/add-customer-dialog.tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";

export function AddCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setFullName("");
      setPhone("");
      setEmail("");
      setAddress("");
      setNote("");
    }
  }, [open]);

  async function handleSubmit() {
    if (!fullName.trim() || !phone.trim()) {
      toast.error("Vui lòng nhập họ tên và số điện thoại");
      return;
    }
    setSubmitting(true);
    const response = await fetch("/api/customer-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        note: note.trim() || undefined,
      }),
    });
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success("Đã thêm khách hàng");
    onCreated();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Thêm khách hàng</DialogTitle>
        <div className="flex flex-col gap-3 py-2">
          <Field label="Họ và tên" required>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn A" />
          </Field>
          <Field label="Số điện thoại" required>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0901 234 567" />
          </Field>
          <Field label="Email">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
          </Field>
          <Field label="Địa chỉ">
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Ghi chú">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sở thích, yêu cầu đặc biệt..." />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <DialogClose className="h-10 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
            Hủy
          </DialogClose>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
          >
            Lưu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create the detail dialog**

```tsx
// apps/web/src/app/owner/customers/customer-detail-dialog.tsx
"use client";

import { useEffect, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { avatarInitials, formatShortDate } from "./customer-format";
import { TierBadge } from "./tier-badge";
import type { CustomerDetail, CustomerKind } from "./types";

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export function CustomerDetailDialog({
  open,
  onOpenChange,
  target,
  onBookForCustomer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: { kind: CustomerKind; id: string } | null;
  onBookForCustomer: (customer: CustomerDetail) => void;
}) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);

  useEffect(() => {
    if (!open || !target) {
      setDetail(null);
      return;
    }
    setDetail(null);
    fetch(`/api/customers/${target.kind}/${target.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDetail(data));
  }, [open, target]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle>Chi tiết khách hàng</DialogTitle>
        {detail === null ? (
          <p className="py-6 text-center text-muted-foreground">Đang tải...</p>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-full bg-muted text-base font-semibold">
                {avatarInitials(detail.fullName)}
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold">{detail.fullName}</p>
                  <TierBadge tier={detail.tier} />
                </div>
                <p className="text-sm text-muted-foreground">{detail.phone ?? "—"}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Lượt đặt" value={String(detail.totalBookings)} />
              <Stat label="Tổng chi tiêu" value={`${currencyFormatter.format(detail.totalSpent)}đ`} />
            </div>

            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <Info label="Lần đặt cuối" value={formatShortDate(detail.lastBookingAt)} />
              <Info label="Mã KH" value={detail.customerCode} />
              <Info label="Ngày tham gia" value={formatShortDate(detail.joinedAt)} />
              {detail.note && <Info label="Ghi chú" value={detail.note} />}
            </dl>

            <Button
              type="button"
              onClick={() => onBookForCustomer(detail)}
              className="h-10 w-full gap-2 rounded-xl bg-green-600 font-medium text-white hover:bg-green-700"
            >
              <CalendarPlus className="size-4" />
              Đặt sân cho khách này
            </Button>
          </div>
        )}
        <div className="flex justify-end">
          <DialogClose className="h-10 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
            Đóng
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/owner/customers/add-customer-dialog.tsx apps/web/src/app/owner/customers/customer-detail-dialog.tsx
git commit -m "feat(web/customers): add add-customer and detail dialogs"
```

---

### Task 6: Extend QuickBookDialog for prefilled customer + standalone date/venue

Add optional capabilities without changing existing calendar behavior.

**Files:**
- Modify: `apps/web/src/app/owner/bookings/quick-book-dialog.tsx`

**Interfaces:**
- Consumes: `CustomerKind` (Task 1).
- Produces (new optional props on `QuickBookDialogProps`):
  - `prefillCustomer?: { kind: CustomerKind; id: string; fullName: string; phone: string }`
  - `editableDate?: boolean`
  - `venues?: { id: string; name: string }[]`
  - `onVenueChange?: (venueId: string) => void`

- [ ] **Step 1: Add imports and extend the props type**

At the top of `quick-book-dialog.tsx`, add the import:

```ts
import type { CustomerKind } from "../customers/types";
```

Extend `QuickBookDialogProps` (add the four optional fields):

```ts
interface QuickBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  date: string;
  courts: Court[];
  initialCourtId?: string;
  initialHour?: string;
  maxDurationHours?: number;
  onCreated: (booking: OwnerBooking) => void;
  prefillCustomer?: { kind: CustomerKind; id: string; fullName: string; phone: string };
  editableDate?: boolean;
  venues?: { id: string; name: string }[];
  onVenueChange?: (venueId: string) => void;
}
```

- [ ] **Step 2: Destructure new props and add local date state**

Update the function signature destructuring to include `prefillCustomer, editableDate, venues, onVenueChange`. After the existing `useState` declarations, add local date state seeded from the `date` prop:

```ts
  const [bookingDate, setBookingDate] = useState(date);
```

In the existing `useEffect` that runs on `open`, add `setBookingDate(date);` and, when a customer is prefilled, seed the name/phone fields:

```ts
    setBookingDate(date);
    setFullName(prefillCustomer?.fullName ?? "");
    setPhone(prefillCustomer?.phone ?? "");
```

(Replace the current `setFullName("")` / `setPhone("")` lines with the two above.) Also add `date` and `prefillCustomer` to the effect's dependency array.

Then add a **separate** effect (below the open-effect) that re-seeds court + start time when the venue changes in standalone mode. Without this, switching venue leaves a stale `courtId` from the previous venue's court list:

```ts
  // standalone (customers screen): when the selected venue's courts change,
  // re-seed the court and its first start-time. Gated to editableDate so the
  // calendar's QuickBookDialog is unaffected.
  useEffect(() => {
    if (!open || !editableDate) return;
    const first = activeCourts[0];
    setCourtId(first?.id ?? "");
    setStartTime(
      first
        ? buildHourAxis([
            { id: first.id, status: first.status, openTime: first.openTime, closeTime: first.closeTime },
          ])[0] ?? ""
        : "",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);
```

- [ ] **Step 3: Send the correct customer field on submit**

In `handleSubmit`, replace the request body's customer field and use `bookingDate`:

```ts
    const customerPayload = prefillCustomer
      ? prefillCustomer.kind === "registered"
        ? { customerId: prefillCustomer.id }
        : { customerContactId: prefillCustomer.id }
      : { newCustomer: { fullName: fullName.trim(), phone: phone.trim() } };

    const response = await fetch(`/api/venues/mine/${venueId}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courtId,
        date: bookingDate,
        startTime,
        endTime,
        note: note.trim() || undefined,
        ...customerPayload,
      }),
    });
```

- [ ] **Step 4: Make name/phone read-only when prefilled**

On the two `Input`s (`qb-name`, `qb-phone`), add `disabled={Boolean(prefillCustomer)}` so a chosen customer cannot be edited.

- [ ] **Step 5: Render an optional venue select + date input (standalone mode)**

Immediately above the existing court `<div className="space-y-1.5">` (the "Sân" field), add a venue selector shown only when multiple venues are provided:

```tsx
          {editableDate && venues && venues.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="qb-venue">Chi nhánh</Label>
              <select
                id="qb-venue"
                value={venueId}
                onChange={(e) => onVenueChange?.(e.target.value)}
                className={SELECT_CLASS}
              >
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          )}
```

Then make the date editable: in the "Giờ bắt đầu / Thời lượng" grid, add a date field when `editableDate` is set. Insert this block just before that grid:

```tsx
          {editableDate && (
            <div className="space-y-1.5">
              <Label htmlFor="qb-date">Ngày</Label>
              <input
                id="qb-date"
                type="date"
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                className={SELECT_CLASS}
              />
            </div>
          )}
```

- [ ] **Step 6: Typecheck and confirm calendar usage is unchanged**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors. The bookings page (`page.tsx`) passes none of the new props, so its behavior is unchanged (`bookingDate` defaults to the `date` prop; `prefillCustomer` undefined → `newCustomer` path).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/owner/bookings/quick-book-dialog.tsx
git commit -m "feat(web/bookings): support prefilled customer and standalone date/venue in QuickBookDialog"
```

---

### Task 7: Wire the page + replace the placeholder

Assemble everything into `page.tsx` and drive the real screen.

**Files:**
- Modify (replace): `apps/web/src/app/owner/customers/page.tsx`

**Interfaces:**
- Consumes: all Task 1–6 components/helpers; `useBranch`, `ALL_BRANCHES_ID`; `QuickBookDialog`; `Court` type from `../types`.

- [ ] **Step 1: Replace the placeholder page**

```tsx
// apps/web/src/app/owner/customers/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBranch, ALL_BRANCHES_ID } from "@/lib/branch-context";
import { QuickBookDialog } from "@/app/owner/bookings/quick-book-dialog";
import type { Court } from "@/app/owner/types";
import { buildCustomersQuery } from "./customer-format";
import { CustomerMetrics } from "./customer-metrics";
import { CustomerFilters } from "./customer-filters";
import { CustomerTable } from "./customer-table";
import { AddCustomerDialog } from "./add-customer-dialog";
import { CustomerDetailDialog } from "./customer-detail-dialog";
import type {
  CustomerDetail,
  CustomerKind,
  CustomerListItem,
  CustomerListResponse,
  CustomerSummary,
  CustomerTier,
} from "./types";

const PAGE_SIZE = 20;

interface VenueOption {
  id: string;
  name: string;
}

interface BookingState {
  customer: CustomerDetail;
  venueId: string;
  courts: Court[];
}

export default function OwnerCustomersPage() {
  const router = useRouter();
  const { selectedVenueId } = useBranch();

  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [list, setList] = useState<CustomerListResponse | null>(null);
  const [tier, setTier] = useState<CustomerTier | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<{ kind: CustomerKind; id: string } | null>(null);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [booking, setBooking] = useState<BookingState | null>(null);

  const venueParam = selectedVenueId === ALL_BRANCHES_ID ? undefined : selectedVenueId;

  useEffect(() => {
    fetch("/api/venues/mine")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setVenues(Array.isArray(data) ? data : []));
  }, []);

  // debounce search + reset to page 1 on filter change
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [tier, debouncedSearch, selectedVenueId]);

  const loadSummary = useCallback(() => {
    const qs = new URLSearchParams();
    if (venueParam) qs.set("venueId", venueParam);
    fetch(`/api/customers/summary${qs.toString() ? `?${qs}` : ""}`)
      .then((res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner%2Fcustomers");
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => data && setSummary(data));
  }, [venueParam, router]);

  const loadList = useCallback(() => {
    const qs = buildCustomersQuery({
      venueId: venueParam,
      tier,
      search: debouncedSearch,
      page,
      pageSize: PAGE_SIZE,
    });
    fetch(`/api/customers?${qs}`)
      .then((res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner%2Fcustomers");
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => data && setList(data));
  }, [venueParam, tier, debouncedSearch, page, router]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  function refreshAll() {
    loadSummary();
    loadList();
  }

  async function handleBookForCustomer(customer: CustomerDetail) {
    const venueId = venueParam ?? venues[0]?.id;
    if (!venueId) return;
    const courts = await fetch(`/api/venues/mine/${venueId}/courts`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => (Array.isArray(data) ? (data as Court[]) : []));
    setDetailTarget(null);
    setBooking({ customer, venueId, courts });
  }

  async function changeBookingVenue(venueId: string) {
    const courts = await fetch(`/api/venues/mine/${venueId}/courts`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => (Array.isArray(data) ? (data as Court[]) : []));
    setBooking((current) => (current ? { ...current, venueId, courts } : current));
  }

  const items: CustomerListItem[] = list?.items ?? [];
  const total = list?.total ?? 0;

  function todayString(): string {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${m}-${d}`;
  }

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Khách hàng</h1>
        <Button
          type="button"
          onClick={() => setAddOpen(true)}
          className="h-10 gap-2 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
        >
          <UserPlus className="size-4" />
          Thêm khách
        </Button>
      </div>

      {summary && <CustomerMetrics summary={summary} />}

      <CustomerFilters
        tier={tier}
        search={search}
        onTierChange={setTier}
        onSearchChange={setSearch}
      />

      <CustomerTable
        items={items}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onOpenDetail={(item) => setDetailTarget({ kind: item.kind, id: item.id })}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />

      <AddCustomerDialog open={addOpen} onOpenChange={setAddOpen} onCreated={refreshAll} />

      <CustomerDetailDialog
        open={detailTarget !== null}
        onOpenChange={(open) => !open && setDetailTarget(null)}
        target={detailTarget}
        onBookForCustomer={handleBookForCustomer}
      />

      <QuickBookDialog
        open={booking !== null}
        onOpenChange={(open) => !open && setBooking(null)}
        venueId={booking?.venueId ?? ""}
        date={todayString()}
        courts={booking?.courts ?? []}
        editableDate
        venues={venues}
        onVenueChange={changeBookingVenue}
        prefillCustomer={
          booking
            ? {
                kind: booking.customer.kind,
                id: booking.customer.id,
                fullName: booking.customer.fullName,
                phone: booking.customer.phone ?? "",
              }
            : undefined
        }
        onCreated={() => {
          setBooking(null);
          refreshAll();
        }}
      />
    </main>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd apps/web && npx tsc --noEmit && npm run lint`
Expected: no type errors; lint clean (fix any unused-import / hook-deps warnings the linter flags).

- [ ] **Step 3: Drive the real screen**

Use the **superpowers-adjacent `run` skill** (or start the dev server) to load `/owner/customers` as a logged-in owner and confirm end-to-end:
1. Metric cards populate; tabs switch (VIP/Mới) and re-filter the table; metric cards do NOT change with the tab.
2. Search by phone narrows results; pagination Trước/Sau works and disables at the edges.
3. "Thêm khách" creates a contact (appears in the list; duplicate phone shows the conflict toast).
4. Eye icon opens the detail modal with stats, Mã KH, Ngày tham gia.
5. "Đặt sân cho khách này" opens the booking dialog with the name/phone locked, a date picker (and venue select if multiple venues); submitting creates a booking and the customer's Lượt đặt/Tổng tiền update after refresh.

Record what you observed. If anything fails, stop and fix before committing.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/owner/customers/page.tsx
git commit -m "feat(web/customers): wire up the Khách hàng screen"
```

---

## Spec Coverage Check

- **§3 proxy routes** → Task 2 (list, summary, detail, create-contact).
- **§4.1 types** → Task 1. **§4.2 tier badge** → Task 3. **§4.3 metrics** → Task 3. **§4.4 filters** → Task 4. **§4.5 table + pagination** → Task 4. **§4.6 add dialog** → Task 5. **§4.7 detail dialog** → Task 5. **§4.8 page orchestration** → Task 7.
- **§5 prefill booking** → Task 6 (QuickBookDialog extension) + Task 7 (page wiring: venue resolution, courts load, date default).
- **§6 UI validation** → search trim/debounce (Task 7), pagination edge disabling (Task 4), required fields + 409 (Task 5), 401 redirect (Task 7).
- **§7 testing** → Task 1 unit tests (avatarInitials, tierLabel, formatShortDate, buildCustomersQuery); manual drive in Task 7 Step 3.
- **§2 modified-Next.js** → Global Constraints + Task 2 route pattern (`Promise` params, `nextUrl.searchParams`).
- **Out of scope (spec §8):** edit/delete customer, export, per-booking history, manual VIP — not built.
