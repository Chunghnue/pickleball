# Dashboard Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the already-working `/owner/dashboard` page to match the user-provided reference screenshot: icon badges on stat cards, a bar chart for daily revenue, a donut chart for per-court revenue, and a real table for recent bookings — with no changes to data fetching, the API, or venue scoping.

**Architecture:** Pure presentational rewrite of the 4 existing Dashboard components plus one new reusable `Table` UI primitive (Tailwind-only, no new dependency). `recharts` is already installed (added in the prior Dashboard-frontend plan) — this only swaps which chart primitives (`Line`→`Bar`, horizontal `Bar`→`Pie`) each component renders.

**Tech Stack:** Next.js App Router (client components), `recharts` (already a dependency), `lucide-react` (already a dependency, new icons), Tailwind v4.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-30-dashboard-visual-refresh-design.md` (this refresh) and `docs/superpowers/specs/2026-08-30-dashboard-frontend-design.md` (base page — data fetching, loading/401, venue scope, quick-action targets all unchanged, do not touch).
- No new npm dependencies — `recharts` and `lucide-react` are already present.
- No API/backend changes — same `DashboardSummary` shape as before.
- Status labels stay as `STATUS_LABEL` from `apps/web/src/app/owner/venues/[id]/bookings-section.tsx` ("Đã xác nhận"/"Đã huỷ"/"Hoàn thành") — do **not** change to "Đã đặt" from the reference image (see spec §7.2 rationale: consistency with the real booking-management screen).
- No floating chat button — explicitly out of scope (spec §8).
- No automated tests for this task — this codebase only unit-tests pure logic (`apps/web/src/lib/*.test.ts`); this is pure UI/styling. Verify manually via a running dev server, compared directly against the reference screenshot, in both light and dark mode.
- Recent-bookings table has exactly 5 columns per the reference image: Khách hàng, Sân, Thời gian, Giá, Trạng thái — **no date column** (the reference image's "THỜI GIAN" cell shows only `HH:MM:SS - HH:MM:SS`, no date; this is an intentional scope decision already approved, not an oversight).
- Recharts typing gotcha (carried over from the base plan): `Tooltip`'s `formatter`/`labelFormatter` props must have their `value`/`label` parameter left untyped (inferred contextually) and cast inside the function body (`Number(value)`/`String(label)`) — an explicit `(value: number) => ...` annotation fails `tsc`. Verified locally for this plan's `Pie`/`Cell` and `Bar radius` usage too — both compile cleanly with `npx tsc --noEmit`.

---

## Task 1: `Table` UI primitive

**Files:**
- Create: `apps/web/src/components/ui/table.tsx`

**Interfaces:**
- Produces: `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` — consumed by Task 2's `recent-bookings.tsx`.

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/ui/table.tsx`:

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("border-b transition-colors hover:bg-muted/50", className)}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-3 text-left align-middle text-xs font-semibold uppercase text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("p-3 align-middle", className)}
      {...props}
    />
  )
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }
```

- [ ] **Step 2: Verify it compiles**

Run (from `apps/web`): `npx tsc --noEmit -p tsconfig.json`
Expected: no errors (nothing imports this file yet, so this just confirms the file itself is syntactically/typewise valid).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/table.tsx
git commit -m "feat(web): add Table UI primitive"
```

---

## Task 2: Apply the visual refresh

**Files:**
- Modify: `apps/web/src/app/owner/dashboard/page.tsx`
- Modify: `apps/web/src/app/owner/dashboard/stat-cards.tsx`
- Modify: `apps/web/src/app/owner/dashboard/revenue-chart.tsx`
- Modify: `apps/web/src/app/owner/dashboard/court-revenue-chart.tsx`
- Modify: `apps/web/src/app/owner/dashboard/recent-bookings.tsx`

**Interfaces:**
- Consumes: `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` (Task 1); existing `DashboardSummary` shape, `STATUS_LABEL`/`BookingStatus` from `bookings-section.tsx` (unchanged, already exported from the base plan).
- Produces: the final visual state of `/owner/dashboard` — no further consumers.

- [ ] **Step 1: Replace `stat-cards.tsx` with icon-badge cards**

Replace the contents of `apps/web/src/app/owner/dashboard/stat-cards.tsx`:

```tsx
import { CalendarCheck, MapPin, Users, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardsProps {
  todayBookingsCount: number;
  todayRevenue: number;
  courts: { active: number; total: number };
  newCustomersThisMonth: number;
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

const CARD_STYLES = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  green: "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  pink: "bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400",
} as const;

function StatCard({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: typeof CalendarCheck;
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

export function StatCards({
  todayBookingsCount,
  todayRevenue,
  courts,
  newCustomersThisMonth,
}: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard
        icon={CalendarCheck}
        color="blue"
        label="Đơn đặt hôm nay"
        value={String(todayBookingsCount)}
      />
      <StatCard
        icon={Wallet}
        color="green"
        label="Doanh thu hôm nay"
        value={`${currencyFormatter.format(todayRevenue)} đ`}
      />
      <StatCard
        icon={MapPin}
        color="amber"
        label="Sân hoạt động"
        value={`${courts.active}/${courts.total}`}
      />
      <StatCard
        icon={Users}
        color="pink"
        label="Khách mới tháng này"
        value={String(newCustomersThisMonth)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Switch `revenue-chart.tsx` from `LineChart` to `BarChart`**

Replace the contents of `apps/web/src/app/owner/dashboard/revenue-chart.tsx`:

```tsx
"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface RevenueChartProps {
  revenueByDay: { date: string; revenue: number }[];
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

export function RevenueChart({ revenueByDay }: RevenueChartProps) {
  const hasRevenue = revenueByDay.some((day) => day.revenue > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <BarChart3 className="size-4" />
          Doanh thu 30 ngày gần nhất
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
              <BarChart data={revenueByDay}>
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
                <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Switch `court-revenue-chart.tsx` from horizontal `BarChart` to a donut `PieChart`**

Replace the contents of `apps/web/src/app/owner/dashboard/court-revenue-chart.tsx`:

```tsx
"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CourtRevenueChartProps {
  revenueByCourt: { courtId: string; courtName: string; revenue: number }[];
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");
const COURT_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#0891b2"];

export function CourtRevenueChart({ revenueByCourt }: CourtRevenueChartProps) {
  if (revenueByCourt.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <PieChartIcon className="size-4" />
          Doanh thu theo sân
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={revenueByCourt}
                dataKey="revenue"
                nameKey="courtName"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {revenueByCourt.map((entry, index) => (
                  <Cell
                    key={entry.courtId}
                    fill={COURT_COLORS[index % COURT_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [
                  `${currencyFormatter.format(Number(value))} đ`,
                  "Doanh thu",
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
          {revenueByCourt.map((court, index) => (
            <div key={court.courtId} className="flex items-center gap-1.5 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: COURT_COLORS[index % COURT_COLORS.length] }}
              />
              <span className="text-muted-foreground">{court.courtName}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Rewrite `recent-bookings.tsx` to use the `Table` primitive**

Replace the contents of `apps/web/src/app/owner/dashboard/recent-bookings.tsx`:

```tsx
import Link from "next/link";
import { Clock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STATUS_LABEL, type BookingStatus } from "@/app/owner/venues/[id]/bookings-section";

interface RecentBooking {
  id: string;
  customerName: string;
  customerPhone: string | null;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  status: BookingStatus;
}

interface RecentBookingsProps {
  recentBookings: RecentBooking[];
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");
const COURT_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#0891b2"];

function colorForCourt(courtName: string): string {
  let hash = 0;
  for (let i = 0; i < courtName.length; i++) {
    hash = (hash * 31 + courtName.charCodeAt(i)) % COURT_COLORS.length;
  }
  return COURT_COLORS[hash];
}

const STATUS_BADGE_CLASS: Record<BookingStatus, string> = {
  confirmed: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  cancelled: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  completed: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400",
};

export function RecentBookings({ recentBookings }: RecentBookingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-4" />
          Đặt lịch gần nhất
        </CardTitle>
        <CardAction>
          <Link
            href="/owner/bookings"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Xem tất cả
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Khách hàng</TableHead>
              <TableHead>Sân</TableHead>
              <TableHead>Thời gian</TableHead>
              <TableHead className="text-right">Giá</TableHead>
              <TableHead>Trạng thái</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentBookings.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Chưa có lịch đặt nào.
                </TableCell>
              </TableRow>
            )}
            {recentBookings.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell>
                  <p className="font-medium">{booking.customerName}</p>
                  <p className="text-sm text-muted-foreground">
                    {booking.customerPhone ?? "Chưa có"}
                  </p>
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: colorForCourt(booking.courtName) }}
                    />
                    {booking.courtName}
                  </span>
                </TableCell>
                <TableCell>
                  {booking.startTime}–{booking.endTime}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {currencyFormatter.format(booking.totalPrice)}đ
                </TableCell>
                <TableCell>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE_CLASS[booking.status]}`}
                  >
                    {STATUS_LABEL[booking.status]}
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

- [ ] **Step 5: Update `page.tsx` — background, 2-column chart grid, emoji, icons**

Replace the contents of `apps/web/src/app/owner/dashboard/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarPlus,
  MapPin,
  Plus,
  Settings,
  UserPlus,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getGreeting } from "@/lib/greeting";
import type { BookingStatus } from "@/app/owner/venues/[id]/bookings-section";
import { StatCards } from "./stat-cards";
import { RevenueChart } from "./revenue-chart";
import { CourtRevenueChart } from "./court-revenue-chart";
import { RecentBookings } from "./recent-bookings";

interface DashboardSummary {
  todayBookingsCount: number;
  todayRevenue: number;
  courts: { active: number; total: number };
  newCustomersThisMonth: number;
  revenueByDay: { date: string; revenue: number }[];
  revenueByCourt: { courtId: string; courtName: string; revenue: number }[];
  recentBookings: {
    id: string;
    customerName: string;
    customerPhone: string | null;
    courtName: string;
    date: string;
    startTime: string;
    endTime: string;
    totalPrice: number;
    status: BookingStatus;
  }[];
}

const QUICK_ACTIONS = [
  { href: "/owner", label: "Quản lý sân", icon: MapPin },
  { href: "/owner/bookings", label: "Tạo lịch đặt", icon: CalendarPlus },
  { href: "/owner/customers", label: "Thêm khách", icon: UserPlus },
  { href: "/owner/revenue", label: "Báo cáo", icon: BarChart3 },
  { href: "/owner/settings", label: "Cài đặt", icon: Settings },
];

export default function OwnerDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/dashboard/summary");
      if (response.status === 401) {
        router.push("/login?returnTo=%2Fowner%2Fdashboard");
        return;
      }
      const data = await response.json().catch(() => null);
      setSummary(data);
    }
    load();
  }, [router]);

  return (
    <main className="mx-auto flex max-w-5xl flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{getGreeting(new Date())} 👋</h1>
        <Link href="/owner/bookings" className={buttonVariants()}>
          <Plus />
          Đặt sân mới
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Icon />
              {action.label}
            </Link>
          );
        })}
      </div>

      {summary === null && <p>Đang tải...</p>}

      {summary !== null && (
        <>
          <StatCards
            todayBookingsCount={summary.todayBookingsCount}
            todayRevenue={summary.todayRevenue}
            courts={summary.courts}
            newCustomersThisMonth={summary.newCustomersThisMonth}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <RevenueChart revenueByDay={summary.revenueByDay} />
            <CourtRevenueChart revenueByCourt={summary.revenueByCourt} />
          </div>
          <RecentBookings recentBookings={summary.recentBookings} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Run the unit test suite**

Run (from `apps/web`): `npm test`
Expected: PASS (all suites — this task touches no pure-logic files, so the count is unchanged from before).

- [ ] **Step 7: Verify the build succeeds**

Run (from `apps/web`): `npm run build`
Expected: build succeeds, no TypeScript errors. If you see a `Tooltip formatter`/`labelFormatter` type error, re-check that `value`/`label` are left untyped rather than annotated (see Global Constraints).

- [ ] **Step 8: Manually verify against the running backend, compared to the reference image**

With Postgres up and both `apps/api` and `apps/web` dev servers running, and an owner account with venue/court/booking/payment fixtures (see the base Dashboard-frontend plan's fixture approach if none exist), log in as that owner and confirm on `/owner/dashboard`:

1. Page background is a soft gray/muted tone, not pure white, with white cards standing out on top of it.
2. Greeting ends with a 👋 emoji; "Đặt sân mới" button shows a `+` icon before the label.
3. All 5 quick-action pills show an icon before their label.
4. Each of the 4 stat cards shows a colored icon badge (blue/green/amber/pink) to the left of its label/value.
5. "Doanh thu 30 ngày gần nhất" has a small bar-chart icon before its title and renders as a bar chart (one bar per day), not a line.
6. "Doanh thu theo sân" has a small pie-chart icon before its title and renders as a donut chart with a colored dot + court name legend below it (or the whole card is absent if the owner has no courts).
7. "Đặt lịch gần nhất" has a small clock icon before its title and renders as a real table with 5 column headers (Khách hàng/Sân/Thời gian/Giá/Trạng thái), a colored dot next to each court name, and a colored status badge — "Xem tất cả" sits in the card header (top-right), not below the list.
8. Toggle dark mode: page background, cards, chart colors, and badges all remain legible.

Report the result of each of these 8 checks before proceeding to commit.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/owner/dashboard
git commit -m "feat(web): restyle owner dashboard to match reference (icon stat cards, bar/donut charts, bookings table)"
```

---

## Self-Review Notes

- **Spec coverage:** §2 background + 2-col grid (Task 2 Step 5), §3 header/quick-action icons (Task 2 Step 5), §4 stat card icon badges + colors (Task 2 Step 1), §5 bar chart + `BarChart3` title icon (Task 2 Step 2), §6 donut chart + custom legend + `PieChart as PieChartIcon` title icon (Task 2 Step 3), §7.1 `Table` primitive (Task 1), §7.2 `Clock` title icon + table columns/status colors/court-dot hash/"Xem tất cả" placement/empty-state row (Task 2 Step 4). Caught during self-review: the first draft only added the donut chart's title icon per an earlier, incomplete reading of the spec — fixed by adding matching `BarChart3`/`Clock` title icons to the other two cards, and the spec itself was corrected to state this explicitly for all three (see spec commit "add missing card-title icons"). §8 (no API/venue-scope/testing-convention changes, no chat button) and §9 (manual-only verification) are respected — no task touches `page.tsx`'s data-fetching logic, `greeting.ts`, or adds any test file.
- **Type consistency:** `DashboardSummary`, `RecentBooking`, `BookingStatus` shapes are unchanged from the base plan and match exactly across `page.tsx` (Step 5) and `recent-bookings.tsx` (Step 4). `COURT_COLORS` is defined independently in `court-revenue-chart.tsx` (Step 3) and `recent-bookings.tsx` (Step 4) — intentionally duplicated per spec §7.2 ("2 biểu đồ độc lập", colors don't need to match between the donut and the table's court dots), not a DRY violation to fix.
- **Placeholder scan:** no TBD/TODO; every step has runnable code or an exact command with expected output.
