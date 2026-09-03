# Revenue Reports Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/owner/revenue` page (replacing the `ComingSoon` placeholder) against the now-live `GET /reports/revenue` and `GET /reports/revenue/export` backend endpoints, per the approved frontend design spec.

**Architecture:** A client-component page under `apps/web/src/app/owner/revenue/`, following the exact file-per-responsibility pattern already used by `apps/web/src/app/owner/customers/`: a `types.ts`, a pure `revenue-format.ts` helper module (unit-tested), one presentational component per spec section (filter bar, metric cards, line chart, transactions table), and a thin `page.tsx` that owns fetch/state and wires them together. Two new Next.js route-handler proxies forward to the backend — one plain JSON passthrough (mirrors `apps/web/src/app/api/customers/route.ts`), one byte-for-byte CSV passthrough (new pattern, nothing like it exists yet in this codebase since no prior feature streams a non-JSON file through a route handler).

**Tech Stack:** Next.js 16 (App Router, route handlers), React client components, recharts (`LineChart`, already a dependency), Tailwind + the existing shadcn-style `components/ui/*` primitives, Vitest for unit tests.

## Global Constraints

- Source of truth: [docs/superpowers/specs/2026-09-03-revenue-reports-frontend-design.md](../specs/2026-09-03-revenue-reports-frontend-design.md). Backend is already live (see [2026-09-03-revenue-reports-module-backend.md](./2026-09-03-revenue-reports-module-backend.md), fully implemented and merged) — response shape is exactly `RevenueReport` from `apps/api/src/reports/reports.service.ts`.
- No pagination, no client-side caching layer, no new shadcn components — everything needed (`Card`, `Table`, `Button`, `Input`, `Label`) already exists in `apps/web/src/components/ui/`.
- Venue scope via the existing global `useBranch()` (`apps/web/src/lib/branch-context.tsx`) — no local venue picker.
- `formatDateTime` must use **UTC** getters, not local getters — the API returns `paidAt` via `.toISOString()`, and reading it back with UTC getters keeps the displayed clock time identical to what was stored, independent of the browser/test-runner's local timezone. (Do not "fix" this to local getters — that would make the unit test's expected output runner-dependent.)
- `apps/web/AGENTS.md` warns this repo's Next.js has local modifications — read `apps/web/node_modules/next/dist/docs/` before writing route handlers if anything below doesn't match what you expect from stock Next.js.
- All commands below assume the working directory is `apps/web/`.

---

## File Structure

```
apps/web/src/app/owner/revenue/types.ts                    (NEW)
apps/web/src/app/owner/revenue/revenue-format.ts            (NEW)
apps/web/src/app/owner/revenue/revenue-format.test.ts       (NEW)
apps/web/src/app/api/reports/revenue/route.ts                (NEW)
apps/web/src/app/api/reports/revenue/export/route.ts         (NEW)
apps/web/src/app/owner/revenue/revenue-filter-bar.tsx        (NEW)
apps/web/src/app/owner/revenue/revenue-metrics.tsx           (NEW)
apps/web/src/app/owner/revenue/revenue-line-chart.tsx        (NEW)
apps/web/src/app/owner/revenue/revenue-transactions-table.tsx (NEW)
apps/web/src/app/owner/revenue/page.tsx                      (MODIFY — replace ComingSoon)
```

---

### Task 1: Types and pure format helpers

**Files:**
- Create: `apps/web/src/app/owner/revenue/types.ts`
- Create: `apps/web/src/app/owner/revenue/revenue-format.ts`
- Test: `apps/web/src/app/owner/revenue/revenue-format.test.ts`

**Interfaces:**
- Produces: `RevenueSummary`, `RevenueTransaction`, `DateRange` (types); `formatDateTime(iso: string): string`, `formatMoney(value: number): string`, `formatChangePercent(value: number | null): string`, `defaultDateRange(now?: Date): DateRange`, `buildRevenueQuery(params: { venueId?: string; from: string; to: string }): string` — all consumed by Tasks 3 and 4.

- [ ] **Step 1: Create the types file**

Create `apps/web/src/app/owner/revenue/types.ts`:

```ts
export interface RevenueTransaction {
  id: string;
  transactionCode: string;
  customerName: string;
  customerPhone: string;
  paidAt: string;
  amount: number;
  status: "paid";
}

export interface RevenueSummary {
  currentPeriod: {
    revenue: number;
    transactionCount: number;
    avgPerTransaction: number;
  };
  previousPeriod: { revenue: number };
  changeAmount: number;
  changePercent: number | null;
  revenueByDay: { date: string; revenue: number }[];
  transactions: RevenueTransaction[];
}

export interface DateRange {
  from: string;
  to: string;
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/web/src/app/owner/revenue/revenue-format.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/web && npm test -- revenue-format` (Vitest matches by filename substring)
Expected: FAIL — `Cannot find module './revenue-format'`.

- [ ] **Step 4: Implement the helpers**

Create `apps/web/src/app/owner/revenue/revenue-format.ts`:

```ts
import type { DateRange } from "./types";

const moneyFormatter = new Intl.NumberFormat("vi-VN");

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}`;
}

export function formatMoney(value: number): string {
  return `${moneyFormatter.format(value)} đ`;
}

export function formatChangePercent(value: number | null): string {
  if (value === null) return "N/A";
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatDateForQuery(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function defaultDateRange(now: Date = new Date()): DateRange {
  const to = formatDateForQuery(now);
  const fromDate = new Date(now);
  fromDate.setDate(fromDate.getDate() - 29);
  return { from: formatDateForQuery(fromDate), to };
}

export function buildRevenueQuery(params: {
  venueId?: string;
  from: string;
  to: string;
}): string {
  const sp = new URLSearchParams();
  if (params.venueId) sp.set("venueId", params.venueId);
  sp.set("from", params.from);
  sp.set("to", params.to);
  return sp.toString();
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npm test -- revenue-format`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/owner/revenue/types.ts apps/web/src/app/owner/revenue/revenue-format.ts apps/web/src/app/owner/revenue/revenue-format.test.ts
git commit -m "feat(web): add Revenue Reports types and pure format helpers"
```

---

### Task 2: API route proxies

**Files:**
- Create: `apps/web/src/app/api/reports/revenue/route.ts`
- Create: `apps/web/src/app/api/reports/revenue/export/route.ts`

**Interfaces:**
- Consumes: `fetchApi` from `@/lib/fetch-api`, `toNextResponse` from `@/lib/proxy-response` (JSON route only).
- Produces: `GET /api/reports/revenue?venueId=&from=&to=` (JSON passthrough), `GET /api/reports/revenue/export?venueId=&from=&to=` (CSV byte passthrough) — both consumed by Task 4's `page.tsx`.

No unit-test harness exists for Next.js route handlers in this codebase (none of the existing `apps/web/src/app/api/**/route.ts` files have a companion test) — these are verified manually in Task 4 once the page can actually call them end-to-end.

- [ ] **Step 1: Create the JSON passthrough route**

Create `apps/web/src/app/api/reports/revenue/route.ts`:

```ts
import { NextRequest } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { toNextResponse } from "@/lib/proxy-response";

export async function GET(request: NextRequest) {
  const qs = request.nextUrl.searchParams.toString();
  const upstream = await fetchApi(`/reports/revenue${qs ? `?${qs}` : ""}`);
  return toNextResponse(upstream);
}
```

This is byte-identical in structure to `apps/web/src/app/api/customers/route.ts` — same forwarding pattern, different upstream path.

- [ ] **Step 2: Create the CSV passthrough route**

Create `apps/web/src/app/api/reports/revenue/export/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { fetchApi } from "@/lib/fetch-api";

export async function GET(request: NextRequest) {
  const qs = request.nextUrl.searchParams.toString();
  const upstream = await fetchApi(`/reports/revenue/export${qs ? `?${qs}` : ""}`);
  const body = await upstream.arrayBuffer();
  return new NextResponse(body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") ?? "text/csv",
      "Content-Disposition": upstream.headers.get("Content-Disposition") ?? "attachment",
    },
  });
}
```

This can't reuse `toNextResponse` (it assumes a JSON body). If the upstream call fails auth (401), the backend's exception filter returns a JSON error body with `Content-Type: application/json` instead of CSV — the code above forwards whatever `Content-Type` the upstream actually sent, so that error still arrives as valid JSON, not mislabeled as CSV.

- [ ] **Step 3: Confirm both compile**

Run: `cd apps/web && npm run build`
Expected: exits 0. (The page that actually calls these routes doesn't exist until Task 4, so this only checks the route files themselves type-check — full behavioral verification happens in Task 4 Step 4.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/reports/revenue/route.ts apps/web/src/app/api/reports/revenue/export/route.ts
git commit -m "feat(web): add /api/reports/revenue and /api/reports/revenue/export proxy routes"
```

---

### Task 3: Presentational components

**Files:**
- Create: `apps/web/src/app/owner/revenue/revenue-filter-bar.tsx`
- Create: `apps/web/src/app/owner/revenue/revenue-metrics.tsx`
- Create: `apps/web/src/app/owner/revenue/revenue-line-chart.tsx`
- Create: `apps/web/src/app/owner/revenue/revenue-transactions-table.tsx`

**Interfaces:**
- Consumes: `RevenueSummary`/`RevenueTransaction`/`DateRange` (Task 1's `types.ts`), `formatMoney`/`formatChangePercent`/`formatDateTime` (Task 1's `revenue-format.ts`); `Card`/`CardContent`/`CardHeader`/`CardTitle` from `@/components/ui/card`; `Table*` from `@/components/ui/table`; `Button` from `@/components/ui/button`; `Input` from `@/components/ui/input`; `Label` from `@/components/ui/label`.
- Produces: `RevenueFilterBar({ appliedRange: DateRange; onApply: (range: DateRange) => void; exportHref: string })`, `RevenueMetrics({ summary: RevenueSummary })`, `RevenueLineChart({ revenueByDay: { date: string; revenue: number }[] })`, `RevenueTransactionsTable({ transactions: RevenueTransaction[] })` — all consumed by Task 4's `page.tsx`.

This repo has no component-test harness (same gap noted in the frontend design spec's own Testing section) — these are verified visually in Task 4 Step 4 once wired into a real page.

- [ ] **Step 1: Create the filter bar**

Create `apps/web/src/app/owner/revenue/revenue-filter-bar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Download, Filter } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DateRange } from "./types";

export function RevenueFilterBar({
  appliedRange,
  onApply,
  exportHref,
}: {
  appliedRange: DateRange;
  onApply: (range: DateRange) => void;
  exportHref: string;
}) {
  const [draftFrom, setDraftFrom] = useState(appliedRange.from);
  const [draftTo, setDraftTo] = useState(appliedRange.to);

  const isInvalid = !draftFrom || !draftTo || draftFrom > draftTo;

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="revenue-from">Từ ngày</Label>
          <Input
            id="revenue-from"
            type="date"
            value={draftFrom}
            onChange={(e) => setDraftFrom(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="revenue-to">Đến ngày</Label>
          <Input
            id="revenue-to"
            type="date"
            value={draftTo}
            onChange={(e) => setDraftTo(e.target.value)}
          />
        </div>
        <Button
          type="button"
          onClick={() => onApply({ from: draftFrom, to: draftTo })}
          disabled={isInvalid}
          className="gap-2"
        >
          <Filter className="size-4" />
          Lọc
        </Button>
      </div>
      <a href={exportHref} className={buttonVariants({ variant: "outline", className: "gap-2" })}>
        <Download className="size-4" />
        Xuất báo cáo
      </a>
    </div>
  );
}
```

Note: link-styled-as-button uses `buttonVariants({...})` applied directly to an `<a>` (the pattern already used in `apps/web/src/app/page.tsx` and `apps/web/src/app/owner/dashboard/page.tsx`), not a `<Button asChild>` — this codebase's `Button` wraps `@base-ui/react/button`, which doesn't support the Radix-style `asChild` slot prop.

- [ ] **Step 2: Create the metric cards**

Create `apps/web/src/app/owner/revenue/revenue-metrics.tsx`:

```tsx
import { ArrowLeftRight, Receipt, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatChangePercent, formatMoney } from "./revenue-format";
import type { RevenueSummary } from "./types";

const CARD_STYLES = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  green: "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  pink: "bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400",
} as const;

function MetricCard({
  icon: Icon,
  color,
  label,
  value,
  badge,
}: {
  icon: typeof Wallet;
  color: keyof typeof CARD_STYLES;
  label: string;
  value: string;
  badge?: { text: string; positive: boolean };
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
          <div className="flex items-center gap-2">
            <p className="text-xl font-bold">{value}</p>
            {badge && (
              <span
                className={
                  badge.positive
                    ? "text-xs font-semibold text-green-600 dark:text-green-400"
                    : "text-xs font-semibold text-red-600 dark:text-red-400"
                }
              >
                {badge.text}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function RevenueMetrics({ summary }: { summary: RevenueSummary }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <MetricCard
        icon={Wallet}
        color="green"
        label="Doanh thu kỳ này"
        value={formatMoney(summary.currentPeriod.revenue)}
        badge={{
          text: formatChangePercent(summary.changePercent),
          positive: summary.changeAmount >= 0,
        }}
      />
      <MetricCard
        icon={Receipt}
        color="blue"
        label="Số giao dịch"
        value={String(summary.currentPeriod.transactionCount)}
      />
      <MetricCard
        icon={TrendingUp}
        color="amber"
        label="Trung bình/giao dịch"
        value={formatMoney(summary.currentPeriod.avgPerTransaction)}
      />
      <MetricCard
        icon={ArrowLeftRight}
        color="pink"
        label="So kỳ trước"
        value={formatMoney(summary.changeAmount)}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create the line chart**

Create `apps/web/src/app/owner/revenue/revenue-line-chart.tsx`:

```tsx
"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RevenueLineChartProps {
  revenueByDay: { date: string; revenue: number }[];
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

export function RevenueLineChart({ revenueByDay }: RevenueLineChartProps) {
  const hasRevenue = revenueByDay.some((day) => day.revenue > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <TrendingUp className="size-4" />
          Doanh thu theo ngày
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasRevenue && (
          <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Chưa có dữ liệu
          </p>
        )}
        {hasRevenue && (
          <div style={{ height: 256 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={shortDate} />
                <YAxis
                  tickFormatter={(value: number) => currencyFormatter.format(value)}
                  width={80}
                />
                <Tooltip
                  labelFormatter={(label) => shortDate(String(label))}
                  formatter={(value) => [
                    `${currencyFormatter.format(Number(value))} đ`,
                    "Doanh thu",
                  ]}
                />
                <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create the transactions table**

Create `apps/web/src/app/owner/revenue/revenue-transactions-table.tsx`:

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, formatMoney } from "./revenue-format";
import type { RevenueTransaction } from "./types";

export function RevenueTransactionsTable({
  transactions,
}: {
  transactions: RevenueTransaction[];
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">Danh sách giao dịch ({transactions.length})</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              <TableHead>MÃ GD</TableHead>
              <TableHead>KHÁCH HÀNG</TableHead>
              <TableHead>THỜI GIAN</TableHead>
              <TableHead>SỐ TIỀN</TableHead>
              <TableHead>TRẠNG THÁI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Chưa có giao dịch nào.
                </TableCell>
              </TableRow>
            )}
            {transactions.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.transactionCode}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-semibold">{t.customerName}</span>
                    <span className="text-xs text-muted-foreground">{t.customerPhone}</span>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(t.paidAt)}
                </TableCell>
                <TableCell className="font-semibold text-green-600 dark:text-green-400">
                  {formatMoney(t.amount)}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-600 dark:bg-green-950/40 dark:text-green-400">
                    Đã thanh toán
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Confirm it compiles**

Run: `cd apps/web && npm run build`
Expected: exits 0. (Nothing imports these components yet, so this only confirms each file type-checks in isolation; Task 4 wires them together.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/owner/revenue/revenue-filter-bar.tsx apps/web/src/app/owner/revenue/revenue-metrics.tsx apps/web/src/app/owner/revenue/revenue-line-chart.tsx apps/web/src/app/owner/revenue/revenue-transactions-table.tsx
git commit -m "feat(web): add Revenue Reports filter bar, metrics, line chart, and transactions table"
```

---

### Task 4: Wire up the page and verify end-to-end

**Files:**
- Modify: `apps/web/src/app/owner/revenue/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–3 (`RevenueFilterBar`, `RevenueMetrics`, `RevenueLineChart`, `RevenueTransactionsTable`, `buildRevenueQuery`, `defaultDateRange`, `DateRange`, `RevenueSummary`); `useBranch`/`ALL_BRANCHES_ID` from `@/lib/branch-context`; `useRouter` from `next/navigation`.
- Produces: the finished `/owner/revenue` page — nothing downstream depends on this (leaf of the plan).

- [ ] **Step 1: Read the current placeholder**

`apps/web/src/app/owner/revenue/page.tsx` currently contains:

```tsx
import { ComingSoon } from "@/components/coming-soon";

export default function OwnerRevenuePage() {
  return <ComingSoon title="Doanh thu" />;
}
```

- [ ] **Step 2: Replace it with the real page**

Replace the entire contents of `apps/web/src/app/owner/revenue/page.tsx` with:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ALL_BRANCHES_ID, useBranch } from "@/lib/branch-context";
import { RevenueFilterBar } from "./revenue-filter-bar";
import { RevenueMetrics } from "./revenue-metrics";
import { RevenueLineChart } from "./revenue-line-chart";
import { RevenueTransactionsTable } from "./revenue-transactions-table";
import { buildRevenueQuery, defaultDateRange } from "./revenue-format";
import type { DateRange, RevenueSummary } from "./types";

export default function OwnerRevenuePage() {
  const router = useRouter();
  const { selectedVenueId } = useBranch();

  const [appliedRange, setAppliedRange] = useState<DateRange>(() => defaultDateRange());
  const [data, setData] = useState<RevenueSummary | null>(null);
  const [error, setError] = useState(false);

  const venueParam = selectedVenueId === ALL_BRANCHES_ID ? undefined : selectedVenueId;

  const loadReport = useCallback(() => {
    const qs = buildRevenueQuery({
      venueId: venueParam,
      from: appliedRange.from,
      to: appliedRange.to,
    });
    fetch(`/api/reports/revenue?${qs}`)
      .then((res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner%2Frevenue");
          return null;
        }
        if (!res.ok) {
          setError(true);
          return null;
        }
        setError(false);
        return res.json();
      })
      .then((json) => json && setData(json))
      .catch(() => setError(true));
  }, [venueParam, appliedRange, router]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const exportQs = buildRevenueQuery({
    venueId: venueParam,
    from: appliedRange.from,
    to: appliedRange.to,
  });

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div>
        <h1 className="text-2xl font-bold">Doanh thu</h1>
      </div>

      <RevenueFilterBar
        appliedRange={appliedRange}
        onApply={setAppliedRange}
        exportHref={`/api/reports/revenue/export?${exportQs}`}
      />

      {error && (
        <p className="text-sm text-destructive">Không tải được dữ liệu. Vui lòng thử lại.</p>
      )}

      {data && (
        <>
          <RevenueMetrics summary={data} />
          <RevenueLineChart revenueByDay={data.revenueByDay} />
          <RevenueTransactionsTable transactions={data.transactions} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Build and lint**

Run: `cd apps/web && npm run build`
Expected: exits 0, no TypeScript errors.

Run: `npm run lint`
Expected: exits 0, no errors.

- [ ] **Step 4: Manual end-to-end verification**

This is the real acceptance test for the whole plan — there's no component-test harness in this repo, so every prior "confirm it compiles" step only proved the code type-checks, not that it behaves correctly. Use the `run` skill (or `npm run dev` directly) to start both the API (`apps/api`, already running against the same Postgres used by the e2e tests — see `docker-compose.yml` at the repo root) and the web app, then in a browser:

1. Log in as an owner that has at least one venue with paid bookings (reuse a seeded/dev account, or create paid bookings via the API the same way `test/reports-revenue.e2e-spec.ts` does, against the dev DB instead of the test DB).
2. Go to `/owner/revenue`. Confirm: page loads with the last 30 days pre-filled in "Từ ngày"/"Đến ngày", 4 metric cards show real numbers, the line chart renders (or shows "Chưa có dữ liệu" if the dev account has no revenue in the last 30 days), and the transactions table lists rows with correct code/name/phone/time/amount and a green "Đã thanh toán" badge.
3. Change "Từ ngày"/"Đến ngày" to a narrower range and click "Lọc" — confirm the metrics/chart/table update and the "Lọc" button is disabled while `to < from`.
4. Switch the global branch selector (sidebar) to a specific venue, then to "Tất cả chi nhánh" — confirm the report reloads and scopes correctly both times.
5. Click "Xuất báo cáo" — confirm a `.csv` file downloads (not a JSON error), and opening it in a text editor / Excel shows the Vietnamese header row without garbled characters (confirms the BOM survived the two proxy hops) and rows matching what's on screen.
6. Pick a date range with zero transactions — confirm the empty states ("Chưa có dữ liệu" on the chart, "Chưa có giao dịch nào" in the table) render instead of a crash.
7. Log out and hit `/owner/revenue` directly — confirm redirect to `/login?returnTo=%2Fowner%2Frevenue`.

If any step fails, the bug is in `page.tsx`'s wiring or one of the Task 2/3 files — fix it there, not by changing the already-tested backend.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/owner/revenue/page.tsx
git commit -m "feat(web): wire up the /owner/revenue page"
```

---

## Self-Review Notes

- **Spec coverage:** §1 (route/scope), §2 (deviations: merged status column, line chart, no local venue picker — Task 3/4 embody these directly, no separate "Trạng thái"/"Thanh toán" split), §3 (filter bar), §3.4 (metrics), §3.5 (line chart), §3.6 (table), §3.7 (CSV export via plain `<a>`), §3.8 (page wiring), §4 (route proxies), §5 (validation: disabled Lọc button, 401 redirect, error state), §6 (testing: unit tests for pure helpers in Task 1, manual verification in Task 4) are all covered by a task above.
- **Placeholder scan:** none — every step has runnable code or an exact command.
- **Type consistency:** `RevenueSummary`/`RevenueTransaction`/`DateRange` (Task 1) are imported unchanged by every component in Tasks 3–4; `buildRevenueQuery`'s parameter shape matches how `page.tsx` calls it in both the fetch and the export `href`.
