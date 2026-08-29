# Dashboard Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/owner/dashboard` `ComingSoon` stub with a real page showing the owner's daily stats, a 30-day revenue line chart, a per-court revenue bar chart, and a recent-bookings list, all sourced from the already-built `GET /dashboard/summary` backend endpoint.

**Architecture:** A client-fetched Next.js page (`page.tsx`) loads `/api/dashboard/summary` once on mount and passes the response down as props to four small presentational components (stat cards, two `recharts` charts, recent-bookings list). A one-line BFF proxy route forwards to the backend, matching every other proxy route in this codebase.

**Tech Stack:** Next.js App Router (client components), `recharts` (new dependency — first real chart library in this repo, replacing the ad-hoc CSS-bar approach used on `/admin/stats`), Tailwind v4, Vitest for the one pure-logic unit test.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-30-dashboard-frontend-design.md` (frontend) and `docs/superpowers/specs/2026-08-25-dashboard-design.md` (backend API this consumes — already implemented and merged).
- No venue-switcher wiring — always call `/dashboard/summary` with no `venueId`, aggregating all of the owner's venues (`BranchSwitcher` has no shared state to read; see frontend spec §3).
- No new UI-kit primitives (no `Table` component) — recent bookings render as a `Card` list, same pattern as `apps/web/src/app/owner/venues/[id]/bookings-section.tsx`.
- Chart colors: fixed `#2563eb` (matches the sidebar's active-link blue) for both charts — `recharts` renders SVG and does not respond to Tailwind `dark:` classes.
- Revenue chart: if every one of the 30 `revenueByDay` entries is 0, show "Chưa có dữ liệu" instead of a flat line.
- Court revenue chart: hide the whole card if `revenueByCourt` is empty (owner has no courts yet).
- No automated tests for pages/components — this codebase only unit-tests pure logic under `apps/web/src/lib/*.test.ts` (confirmed: no `*.test.tsx` exists anywhere in `apps/web/src`). Verification for UI work is manual, via a running dev server.
- `recharts@^3.10.1` — confirmed via `npm view recharts version peerDependencies` to declare `react: "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0"`, compatible with this repo's React 19.2.8.
- `Tooltip`'s `formatter`/`labelFormatter` props in `recharts@3` are typed with a generic `ValueType | undefined` / `ReactNode` parameter — an explicitly-typed `(value: number) => ...` arrow function does **not** type-check against them (verified locally with `npx tsc --noEmit`). Leave the parameter untyped (so it's inferred contextually) and `Number(value)`/`String(label)`-cast inside the function body instead — see Task 2 Step 4.

---

## Task 1: `getGreeting` time-of-day helper

**Files:**
- Create: `apps/web/src/lib/greeting.ts`
- Test: `apps/web/src/lib/greeting.test.ts`

**Interfaces:**
- Produces: `getGreeting(now: Date): string` — consumed by Task 2's `page.tsx`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/greeting.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getGreeting } from './greeting';

describe('getGreeting', () => {
  it('returns the morning greeting before 11:00', () => {
    expect(getGreeting(new Date(2026, 7, 30, 10, 59))).toBe('Chào buổi sáng!');
  });

  it('returns the midday greeting starting at 11:00', () => {
    expect(getGreeting(new Date(2026, 7, 30, 11, 0))).toBe('Chào buổi trưa!');
  });

  it('returns the midday greeting just before 13:00', () => {
    expect(getGreeting(new Date(2026, 7, 30, 12, 59))).toBe('Chào buổi trưa!');
  });

  it('returns the afternoon greeting starting at 13:00', () => {
    expect(getGreeting(new Date(2026, 7, 30, 13, 0))).toBe('Chào buổi chiều!');
  });

  it('returns the afternoon greeting just before 18:00', () => {
    expect(getGreeting(new Date(2026, 7, 30, 17, 59))).toBe('Chào buổi chiều!');
  });

  it('returns the evening greeting starting at 18:00', () => {
    expect(getGreeting(new Date(2026, 7, 30, 18, 0))).toBe('Chào buổi tối!');
  });

  it('returns the evening greeting late at night', () => {
    expect(getGreeting(new Date(2026, 7, 30, 23, 30))).toBe('Chào buổi tối!');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/web`): `npm test -- greeting.test.ts`
Expected: FAIL — `Cannot find module './greeting'`.

- [ ] **Step 3: Implement `getGreeting`**

Create `apps/web/src/lib/greeting.ts`:

```ts
export function getGreeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 11) return 'Chào buổi sáng!';
  if (hour < 13) return 'Chào buổi trưa!';
  if (hour < 18) return 'Chào buổi chiều!';
  return 'Chào buổi tối!';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/web`): `npm test -- greeting.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/greeting.ts apps/web/src/lib/greeting.test.ts
git commit -m "feat(web): add time-of-day greeting helper for the owner dashboard"
```

---

## Task 2: Dashboard page

**Files:**
- Modify: `apps/web/package.json` (+ `apps/web/package-lock.json`, via `npm install`)
- Create: `apps/web/src/app/api/dashboard/summary/route.ts`
- Modify: `apps/web/src/app/owner/venues/[id]/bookings-section.tsx`
- Create: `apps/web/src/app/owner/dashboard/stat-cards.tsx`
- Create: `apps/web/src/app/owner/dashboard/revenue-chart.tsx`
- Create: `apps/web/src/app/owner/dashboard/court-revenue-chart.tsx`
- Create: `apps/web/src/app/owner/dashboard/recent-bookings.tsx`
- Modify: `apps/web/src/app/owner/dashboard/page.tsx` (currently `ComingSoon` stub)

**Interfaces:**
- Consumes: `getGreeting(now: Date): string` (Task 1); backend response shape from `GET /dashboard/summary` (`docs/superpowers/specs/2026-08-25-dashboard-design.md` §3): `{ todayBookingsCount, todayRevenue, courts: { active, total }, newCustomersThisMonth, revenueByDay: { date, revenue }[], revenueByCourt: { courtId, courtName, revenue }[], recentBookings: { id, customerName, customerPhone, courtName, date, startTime, endTime, totalPrice, status }[] }`.
- Produces: `StatCards`, `RevenueChart`, `CourtRevenueChart`, `RecentBookings` (all default-exported-free named exports, each taking its own typed props slice of the summary) and the real `/owner/dashboard` page — final consumer-facing artifact of both Dashboard plans.

- [ ] **Step 1: Add the `recharts` dependency**

Run (from `apps/web`): `npm install recharts@^3.10.1`
Expected: `apps/web/package.json` gains a `"recharts": "^3.10.1"` entry under `dependencies` (alphabetically between `"react-hook-form"` and `"shadcn"`), `apps/web/package-lock.json` updates accordingly.

- [ ] **Step 2: Add the proxy route**

Create `apps/web/src/app/api/dashboard/summary/route.ts`:

```ts
import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET() {
  const upstream = await fetchApi('/dashboard/summary');
  return toNextResponse(upstream);
}
```

- [ ] **Step 3: Export `BookingStatus` and `STATUS_LABEL` from `bookings-section.tsx`**

In `apps/web/src/app/owner/venues/[id]/bookings-section.tsx`, change:

```ts
type BookingStatus = "confirmed" | "cancelled" | "completed";
```

to:

```ts
export type BookingStatus = "confirmed" | "cancelled" | "completed";
```

and change:

```ts
const STATUS_LABEL: Record<BookingStatus, string> = {
```

to:

```ts
export const STATUS_LABEL: Record<BookingStatus, string> = {
```

(Only these two lines change — everything else in the file, including its own internal usage of `BookingStatus`/`STATUS_LABEL`, keeps working unchanged.)

- [ ] **Step 4: Create `stat-cards.tsx`**

Create `apps/web/src/app/owner/dashboard/stat-cards.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatCardsProps {
  todayBookingsCount: number;
  todayRevenue: number;
  courts: { active: number; total: number };
  newCustomersThisMonth: number;
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export function StatCards({
  todayBookingsCount,
  todayRevenue,
  courts,
  newCustomersThisMonth,
}: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Đơn đặt hôm nay
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{todayBookingsCount}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Doanh thu hôm nay
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            {currencyFormatter.format(todayRevenue)} đ
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Sân hoạt động
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">
            {courts.active}/{courts.total}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">
            Khách mới tháng này
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{newCustomersThisMonth}</p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Create `revenue-chart.tsx`**

Create `apps/web/src/app/owner/dashboard/revenue-chart.tsx`:

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
        <CardTitle className="text-sm text-muted-foreground">
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
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Create `court-revenue-chart.tsx`**

Create `apps/web/src/app/owner/dashboard/court-revenue-chart.tsx`:

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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CourtRevenueChartProps {
  revenueByCourt: { courtId: string; courtName: string; revenue: number }[];
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export function CourtRevenueChart({ revenueByCourt }: CourtRevenueChartProps) {
  if (revenueByCourt.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">
          Doanh thu theo sân
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: Math.max(revenueByCourt.length * 48, 96) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueByCourt} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                tickFormatter={(value: number) => currencyFormatter.format(value)}
              />
              <YAxis type="category" dataKey="courtName" width={100} />
              <Tooltip
                formatter={(value) => [
                  `${currencyFormatter.format(Number(value))} đ`,
                  "Doanh thu",
                ]}
              />
              <Bar dataKey="revenue" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 7: Create `recent-bookings.tsx`**

Create `apps/web/src/app/owner/dashboard/recent-bookings.tsx`:

```tsx
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function RecentBookings({ recentBookings }: RecentBookingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">
          Đặt lịch gần nhất
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {recentBookings.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có lịch đặt nào.</p>
        )}
        {recentBookings.map((booking) => (
          <Card key={booking.id}>
            <CardContent className="flex flex-col gap-1 pt-6 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                {booking.customerName} · {booking.customerPhone ?? "Chưa có"}
              </p>
              <p>{booking.courtName}</p>
              <p>
                {booking.date} · {booking.startTime}–{booking.endTime}
              </p>
              <p>
                {currencyFormatter.format(booking.totalPrice)}đ ·{" "}
                {STATUS_LABEL[booking.status]}
              </p>
            </CardContent>
          </Card>
        ))}
        <Link
          href="/owner/bookings"
          className={buttonVariants({ variant: "outline", size: "sm" }) + " self-start"}
        >
          Xem tất cả
        </Link>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 8: Replace the `page.tsx` stub with the real Dashboard page**

Replace the contents of `apps/web/src/app/owner/dashboard/page.tsx` (currently `import { ComingSoon } from "@/components/coming-soon"; export default function OwnerDashboardPage() { return <ComingSoon title="Dashboard" />; }`) with:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  { href: "/owner", label: "Quản lý sân" },
  { href: "/owner/bookings", label: "Tạo lịch đặt" },
  { href: "/owner/customers", label: "Thêm khách" },
  { href: "/owner/revenue", label: "Báo cáo" },
  { href: "/owner/settings", label: "Cài đặt" },
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
    <main className="mx-auto flex max-w-5xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{getGreeting(new Date())}</h1>
        <Link href="/owner/bookings" className={buttonVariants()}>
          Đặt sân mới
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            {action.label}
          </Link>
        ))}
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
          <RevenueChart revenueByDay={summary.revenueByDay} />
          <CourtRevenueChart revenueByCourt={summary.revenueByCourt} />
          <RecentBookings recentBookings={summary.recentBookings} />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 9: Run the unit test suite**

Run (from `apps/web`): `npm test`
Expected: PASS (all suites, including Task 1's `greeting.test.ts`).

- [ ] **Step 10: Verify the build succeeds**

Run (from `apps/web`): `npm run build`
Expected: build succeeds, route table includes `ƒ /owner/dashboard` and `ƒ /api/dashboard/summary`, no TypeScript errors. (The `Tooltip formatter`/`labelFormatter` typing noted in Global Constraints has already been verified to compile — if you see a type error there, re-check that `value`/`label` are left untyped rather than annotated `number`/`string`.)

- [ ] **Step 11: Manually verify against the running backend**

With Postgres + MailHog up (`docker compose up -d` at the repo root) and both `apps/api` (`npm run start:dev`) and `apps/web` (`npm run dev`) dev servers running, log in as an owner with at least one venue/court/booking/payment fixture and confirm:

1. `/owner/dashboard` loads without redirecting to login, greeting text matches the current time of day.
2. The 4 stat cards render with real numbers matching what's in the database.
3. The revenue line chart renders (or shows "Chưa có dữ liệu" if there's no paid revenue in the last 30 days).
4. The court revenue bar chart renders one bar per court, sorted by revenue descending (or the whole card is absent if the owner has no courts).
5. Recent bookings render as a card list with customer/court/time/price/status, and "Xem tất cả" navigates to `/owner/bookings`.
6. The 5 quick-action links and the "Đặt sân mới" button navigate to their target routes.
7. Toggling dark mode keeps both charts legible (fixed blue color, not tied to a `dark:` class).

Report the result of each of these 7 checks before proceeding to commit.

- [ ] **Step 12: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/src/app/api/dashboard/summary/route.ts "apps/web/src/app/owner/venues/[id]/bookings-section.tsx" apps/web/src/app/owner/dashboard
git commit -m "feat(web): build the owner dashboard page (stat cards, revenue charts, recent bookings)"
```

---

## Self-Review Notes

- **Spec coverage:** frontend spec §2 proxy route (Task 2 Step 2), §3 no-venueId scoping (Task 2 Step 8 fetch call has no `venueId` param — matches), §4 file structure (Task 2 Steps 1–8 create exactly the files listed), §5 loading/401 handling (Task 2 Step 8), §6 all 6 layout sections — header/greeting (Step 8), quick actions (Step 8), stat cards (Step 4), revenue chart incl. empty-state (Step 5), court revenue chart incl. hide-when-empty (Step 6), recent bookings incl. `STATUS_LABEL` reuse (Steps 3, 7) — §7 testing (Task 1 unit test; Task 2 Step 11 manual checklist). §8 out-of-scope items (venue switcher, new `Table` primitive, configurable chart range, separate error state, stub destination pages) are correctly absent from both tasks.
- **Type consistency:** `DashboardSummary` (Task 2 Step 8) field names/shapes match the props each component declares (`StatCardsProps`, `RevenueChartProps`, `CourtRevenueChartProps`, `RecentBookingsProps` in Steps 4–7) and match the backend's actual response shape from `docs/superpowers/specs/2026-08-25-dashboard-design.md` §3. `BookingStatus`/`STATUS_LABEL` are exported once (Step 3) and imported identically by both `recent-bookings.tsx` (Step 7) and `page.tsx` (Step 8).
- **Placeholder scan:** no TBD/TODO; every step has runnable code or an exact command with expected output.
