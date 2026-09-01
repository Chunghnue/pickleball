# Pricing Frontend ("Bảng giá" page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build [2026-09-01-pricing-frontend-design.md](../specs/2026-09-01-pricing-frontend-design.md) — replace the `ComingSoon` stub at `apps/web/src/app/owner/pricing/page.tsx` with the real "Bảng giá" page (summary cards, "Bảng giá" tab, "Đặt cố định" tab), wired to the already-shipped Pricing/Recurring-Schedules backend.

**Architecture:** Bottom-up build order — pure helpers and types first, then leaf dialog components (no dependencies on other new pricing files), then the two tab components that compose those dialogs, then `page.tsx` last, wiring everything together with the venue/court scoping logic from the design spec §2. Data fetching follows the `apps/web/src/app/owner/customers/` module exactly: plain `fetch` through Next.js proxy routes (`fetchApi` + `toNextResponse`), `useCallback`-wrapped loaders + `useEffect`, no react-query. Every "+ Thêm..."/"Sao chép" dialog is a self-contained `trigger`-prop component managing its own `open` state (matching `CourtFormDialog`); only the schedule detail dialog is externally controlled by `page.tsx` (matching `CustomerDetailDialog`), since it's opened by clicking a dynamic table row rather than a single static button.

**Tech Stack:** Next.js 16 (App Router), React 19, react-hook-form + zod (`@hookform/resolvers/zod`), Tailwind, shadcn-style primitives in `src/components/ui/`, Vitest for pure-function unit tests, `sonner` for toasts.

## Global Constraints

- Vietnamese UI copy throughout, matching existing style.
- Only build fields the backend actually supports — no "Loại sân", no "Đơn vị" other than giờ, no separate "Phút/buổi" field, no manual "ID Khách hàng" input (see design spec §0).
- No new UI primitives (no Badge/Select/Checkbox/Tabs component) — this codebase's convention is raw `<select>` with a shared `SELECT_CLASS` string, plain `<span>` pills for badges, and manual pill-buttons for tabs. Don't introduce a component library abstraction for a single page.
- Read `apps/web/AGENTS.md` before writing any Next.js code in this plan — this project pins a **non-standard** Next.js version with breaking changes from the version most training data assumes; check `node_modules/next/dist/docs/` for anything that looks unfamiliar (e.g. `params: Promise<...>` in route handlers, the `Button`'s `render`/`nativeButton` props) rather than assuming older-Next.js behavior.
- Read query params via `new URLSearchParams(window.location.search)` inside a `useEffect` (matching `apps/web/src/app/owner/bookings/page.tsx`), **not** `useSearchParams()` from `next/navigation` — avoids that hook's Suspense-boundary requirement, and this codebase already has an established alternative.
- No component tests — only pure-function unit tests (Vitest), matching `customer-format.test.ts`. UI correctness is verified by running the dev server and clicking through the real flow (Task 10).

---

## File Structure

Create:
- `apps/web/src/app/owner/pricing/types.ts`
- `apps/web/src/app/owner/pricing/pricing-format.ts`
- `apps/web/src/app/owner/pricing/pricing-format.test.ts`
- `apps/web/src/app/api/venues/mine/[venueId]/pricing-summary/route.ts`
- `apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/pricing-rules/route.ts`
- `apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/pricing-rules/[ruleId]/route.ts`
- `apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/pricing-rules/copy-from/[sourceCourtId]/route.ts`
- `apps/web/src/app/api/venues/mine/[venueId]/recurring-schedules/route.ts`
- `apps/web/src/app/api/venues/mine/[venueId]/recurring-schedules/[id]/route.ts`
- `apps/web/src/app/api/venues/mine/[venueId]/recurring-schedules/[id]/cancel/route.ts`
- `apps/web/src/app/owner/pricing/customer-selector.tsx`
- `apps/web/src/app/owner/pricing/pricing-rule-form-dialog.tsx`
- `apps/web/src/app/owner/pricing/copy-pricing-dialog.tsx`
- `apps/web/src/app/owner/pricing/pricing-rules-tab.tsx`
- `apps/web/src/app/owner/pricing/recurring-schedule-form-dialog.tsx`
- `apps/web/src/app/owner/pricing/recurring-schedule-detail-dialog.tsx`
- `apps/web/src/app/owner/pricing/recurring-schedules-tab.tsx`
- `apps/web/src/app/owner/pricing/pricing-metrics.tsx`

Modify:
- `apps/web/src/lib/schemas.ts` — add `createPricingRuleSchema`/`updatePricingRuleSchema`/`createRecurringScheduleSchema`
- `apps/web/src/app/owner/pricing/page.tsx` — replace the `ComingSoon` stub

Note on dynamic-route naming: `apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/` **already exists** (used by court CRUD/images). Next.js forbids two different dynamic-segment names as siblings at the same folder depth, so the new `pricing-rules` routes nest under that existing `[id]` segment (reusing its name for "court id"), and use `[ruleId]`/`[sourceCourtId]` for the deeper segments to avoid colliding with the outer `id`.

---

### Task 1: Types, zod schemas, `pricing-format.ts` (TDD)

**Files:**
- Create: `apps/web/src/app/owner/pricing/types.ts`
- Create: `apps/web/src/app/owner/pricing/pricing-format.ts`
- Create: `apps/web/src/app/owner/pricing/pricing-format.test.ts`
- Modify: `apps/web/src/lib/schemas.ts`

**Interfaces:**
- Produces: all types/schemas consumed by every later task in this plan.

- [ ] **Step 1: Write `types.ts`**

```ts
export interface PricingRule {
  id: string;
  courtId: string;
  name: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  price: number;
  priority: number;
  advanceBookingHours: number | null;
  advancePrice: number | null;
  validFrom: string | null;
  validTo: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PricingSummary {
  pricingRulesCount: number;
  activeRecurringSchedulesCount: number;
  estimatedMonthlyRecurringRevenue: number;
}

export type RecurringScheduleStatus = "active" | "cancelled";

export interface RecurringSchedule {
  id: string;
  courtId: string;
  customerId: string | null;
  customerContactId: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  pricePerSession: number;
  discountPercent: number | null;
  validFrom: string;
  validTo: string;
  note: string | null;
  autoRenew: boolean;
  status: RecurringScheduleStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringScheduleListItem extends RecurringSchedule {
  occurrenceCount: number;
}

export type OccurrenceStatus = "confirmed" | "cancelled" | "completed";

export interface RecurringScheduleOccurrence {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: OccurrenceStatus;
  totalPrice: number;
}

export interface RecurringScheduleDetail {
  schedule: RecurringSchedule;
  occurrences: RecurringScheduleOccurrence[];
}

export interface CreateRecurringScheduleResult {
  schedule: RecurringSchedule;
  generatedCount: number;
  conflictingDates: string[];
}
```

- [ ] **Step 2: Write the failing tests for `pricing-format.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  dayLabel,
  formatDaysOfWeek,
  formatMoney,
  formatShortDate,
  sessionPriceAfterDiscount,
} from "./pricing-format";

describe("dayLabel", () => {
  it("maps 0-6 to T2..CN", () => {
    expect(dayLabel(0)).toBe("T2");
    expect(dayLabel(6)).toBe("CN");
  });
});

describe("formatDaysOfWeek", () => {
  it("sorts and joins day labels", () => {
    expect(formatDaysOfWeek([4, 0, 2])).toBe("T2, T4, T6");
  });
  it("returns an empty string for an empty array", () => {
    expect(formatDaysOfWeek([])).toBe("");
  });
});

describe("formatMoney", () => {
  it("formats with vi-VN thousands separators and a đ suffix", () => {
    expect(formatMoney(150000)).toBe("150.000đ");
  });
});

describe("formatShortDate", () => {
  it("formats a YYYY-MM-DD date as dd/MM/yyyy", () => {
    expect(formatShortDate("2026-08-25")).toBe("25/08/2026");
  });
  it("returns an em dash for null", () => {
    expect(formatShortDate(null)).toBe("—");
  });
});

describe("sessionPriceAfterDiscount", () => {
  it("applies a percent discount and rounds to 2 decimals", () => {
    expect(sessionPriceAfterDiscount(100000, 10)).toBe(90000);
  });
  it("returns the full price when discount is null", () => {
    expect(sessionPriceAfterDiscount(100000, null)).toBe(100000);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run pricing-format`
Expected: FAIL — `Cannot find module './pricing-format'`.

- [ ] **Step 4: Implement `pricing-format.ts`**

```ts
export const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function dayLabel(day: number): string {
  return DAY_LABELS[day] ?? "—";
}

export function formatDaysOfWeek(days: number[]): string {
  return [...days]
    .sort((a, b) => a - b)
    .map((day) => dayLabel(day))
    .join(", ");
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export function formatMoney(value: number): string {
  return `${currencyFormatter.format(value)}đ`;
}

export function formatShortDate(value: string | null): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  if (!y || !m || !d) return "—";
  return `${d}/${m}/${y}`;
}

export function sessionPriceAfterDiscount(
  pricePerSession: number,
  discountPercent: number | null,
): number {
  return Math.round(pricePerSession * (1 - (discountPercent ?? 0) / 100) * 100) / 100;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run pricing-format`
Expected: PASS — all 8 tests green.

- [ ] **Step 6: Add the zod schemas**

Append to `apps/web/src/lib/schemas.ts` (reuses the existing `TIME_PATTERN` const already defined near the top of the file):

```ts
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const pricingRuleBaseSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên khung giá'),
  daysOfWeek: z
    .array(z.coerce.number().int().min(0).max(6))
    .min(1, 'Chọn ít nhất 1 thứ áp dụng'),
  startTime: z.string().regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)'),
  endTime: z.string().regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)'),
  price: z.coerce.number().min(0.01, 'Giá phải lớn hơn 0'),
  priority: z.coerce.number().int('Phải là số nguyên').optional(),
  advanceBookingHours: z.coerce.number().int('Phải là số nguyên').min(1).optional(),
  advancePrice: z.coerce.number().min(0.01, 'Giá phải lớn hơn 0').optional(),
  validFrom: z
    .string()
    .regex(DATE_PATTERN, 'Định dạng ngày không hợp lệ')
    .optional()
    .or(z.literal('')),
  validTo: z
    .string()
    .regex(DATE_PATTERN, 'Định dạng ngày không hợp lệ')
    .optional()
    .or(z.literal('')),
});

export const createPricingRuleSchema = pricingRuleBaseSchema.refine(
  (data) => data.startTime < data.endTime,
  { message: 'Giờ bắt đầu phải trước giờ kết thúc', path: ['endTime'] },
);
export type CreatePricingRuleInput = z.infer<typeof createPricingRuleSchema>;

export const updatePricingRuleSchema = pricingRuleBaseSchema.partial().refine(
  (data) => !data.startTime || !data.endTime || data.startTime < data.endTime,
  { message: 'Giờ bắt đầu phải trước giờ kết thúc', path: ['endTime'] },
);
export type UpdatePricingRuleInput = z.infer<typeof updatePricingRuleSchema>;

const recurringScheduleBaseSchema = z.object({
  courtId: z.string().min(1, 'Vui lòng chọn sân'),
  dayOfWeek: z.coerce.number().int().min(0).max(6),
  startTime: z.string().regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)'),
  endTime: z.string().regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)'),
  pricePerSession: z.coerce.number().min(0.01, 'Giá phải lớn hơn 0'),
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  validFrom: z.string().regex(DATE_PATTERN, 'Định dạng ngày không hợp lệ'),
  validTo: z.string().regex(DATE_PATTERN, 'Định dạng ngày không hợp lệ'),
  note: z.string().optional(),
  autoRenew: z.boolean().optional(),
});

export const createRecurringScheduleSchema = recurringScheduleBaseSchema
  .refine((data) => data.startTime < data.endTime, {
    message: 'Giờ bắt đầu phải trước giờ kết thúc',
    path: ['endTime'],
  })
  .refine((data) => data.validFrom <= data.validTo, {
    message: 'Từ ngày phải trước hoặc bằng đến ngày',
    path: ['validTo'],
  });
export type CreateRecurringScheduleInput = z.infer<typeof createRecurringScheduleSchema>;
```

- [ ] **Step 7: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `schemas.ts`, `types.ts`, or `pricing-format.ts`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/owner/pricing/types.ts apps/web/src/app/owner/pricing/pricing-format.ts apps/web/src/app/owner/pricing/pricing-format.test.ts apps/web/src/lib/schemas.ts
git commit -m "feat(web/pricing): add types, zod schemas, and format helpers"
```

---

### Task 2: Proxy routes

**Files:**
- Create: `apps/web/src/app/api/venues/mine/[venueId]/pricing-summary/route.ts`
- Create: `apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/pricing-rules/route.ts`
- Create: `apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/pricing-rules/[ruleId]/route.ts`
- Create: `apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/pricing-rules/copy-from/[sourceCourtId]/route.ts`
- Create: `apps/web/src/app/api/venues/mine/[venueId]/recurring-schedules/route.ts`
- Create: `apps/web/src/app/api/venues/mine/[venueId]/recurring-schedules/[id]/route.ts`
- Create: `apps/web/src/app/api/venues/mine/[venueId]/recurring-schedules/[id]/cancel/route.ts`

**Interfaces:**
- Produces: `GET /api/venues/mine/:venueId/pricing-summary`, `GET|POST /api/venues/mine/:venueId/courts/:id/pricing-rules`, `PATCH|DELETE /api/venues/mine/:venueId/courts/:id/pricing-rules/:ruleId`, `POST /api/venues/mine/:venueId/courts/:id/pricing-rules/copy-from/:sourceCourtId`, `GET|POST /api/venues/mine/:venueId/recurring-schedules`, `GET /api/venues/mine/:venueId/recurring-schedules/:id`, `POST /api/venues/mine/:venueId/recurring-schedules/:id/cancel` — all thin passthroughs to the NestJS API, same shape as `apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/route.ts`.

- [ ] **Step 1: `pricing-summary/route.ts`**

```ts
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await params;
  const upstream = await fetchApi(`/venues/mine/${venueId}/pricing-summary`);
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: `courts/[id]/pricing-rules/route.ts`**

```ts
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string }> },
) {
  const { venueId, id } = await params;
  const upstream = await fetchApi(`/venues/mine/${venueId}/courts/${id}/pricing-rules`);
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string }> },
) {
  const { venueId, id } = await params;
  const body = await request.json();
  const upstream = await fetchApi(`/venues/mine/${venueId}/courts/${id}/pricing-rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 3: `courts/[id]/pricing-rules/[ruleId]/route.ts`**

```ts
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string; ruleId: string }> },
) {
  const { venueId, id, ruleId } = await params;
  const body = await request.json();
  const upstream = await fetchApi(
    `/venues/mine/${venueId}/courts/${id}/pricing-rules/${ruleId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string; ruleId: string }> },
) {
  const { venueId, id, ruleId } = await params;
  const upstream = await fetchApi(
    `/venues/mine/${venueId}/courts/${id}/pricing-rules/${ruleId}`,
    { method: 'DELETE' },
  );
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 4: `courts/[id]/pricing-rules/copy-from/[sourceCourtId]/route.ts`**

```ts
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string; sourceCourtId: string }> },
) {
  const { venueId, id, sourceCourtId } = await params;
  const upstream = await fetchApi(
    `/venues/mine/${venueId}/courts/${id}/pricing-rules/copy-from/${sourceCourtId}`,
    { method: 'POST' },
  );
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 5: `recurring-schedules/route.ts`**

```ts
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await params;
  const upstream = await fetchApi(`/venues/mine/${venueId}/recurring-schedules`);
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await params;
  const body = await request.json();
  const upstream = await fetchApi(`/venues/mine/${venueId}/recurring-schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 6: `recurring-schedules/[id]/route.ts`**

```ts
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string }> },
) {
  const { venueId, id } = await params;
  const upstream = await fetchApi(`/venues/mine/${venueId}/recurring-schedules/${id}`);
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 7: `recurring-schedules/[id]/cancel/route.ts`**

```ts
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string }> },
) {
  const { venueId, id } = await params;
  const upstream = await fetchApi(
    `/venues/mine/${venueId}/recurring-schedules/${id}/cancel`,
    { method: 'POST' },
  );
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 8: Build to verify no route conflicts**

Run: `cd apps/web && npm run build`
Expected: build succeeds — this specifically catches Next.js dynamic-route naming conflicts (e.g. two different segment names at the same depth), which `tsc` alone would not catch.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/api/venues/mine/\[venueId\]/pricing-summary apps/web/src/app/api/venues/mine/\[venueId\]/courts/\[id\]/pricing-rules apps/web/src/app/api/venues/mine/\[venueId\]/recurring-schedules
git commit -m "feat(web/pricing): add proxy routes for pricing-rules and recurring-schedules"
```

---

### Task 3: `CustomerSelector`

**Files:**
- Create: `apps/web/src/app/owner/pricing/customer-selector.tsx`

**Interfaces:**
- Consumes: `GET /api/customers?search=` (existing, returns `CustomerListResponse`), `CustomerListItem`/`CustomerKind` from `../customers/types` (cross-folder type-only import — already an established precedent, e.g. `bookings/page.tsx` imports `CustomerKind` from `../customers/types`)
- Produces: `CustomerSelection` type (`{ label: string; payload: {customerId} | {customerContactId} | {newCustomer: {fullName, phone}} }`) and `CustomerSelector` component — used by Task 7's `RecurringScheduleFormDialog`. The `payload` shape is spread directly into a POST body by the consumer.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { Search, User, UserPlus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CustomerListItem } from "../customers/types";

export interface CustomerSelection {
  label: string;
  payload:
    | { customerId: string }
    | { customerContactId: string }
    | { newCustomer: { fullName: string; phone: string } };
}

export function CustomerSelector({
  value,
  onChange,
}: {
  value: CustomerSelection | null;
  onChange: (value: CustomerSelection | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerListItem[]>([]);
  const [newFullName, setNewFullName] = useState("");
  const [newPhone, setNewPhone] = useState("");

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/customers?search=${encodeURIComponent(trimmed)}&page=1&pageSize=5`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => setResults(data?.items ?? []));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-input px-2.5 py-2">
        <div className="flex items-center gap-2">
          <User className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{value.label}</span>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Bỏ chọn khách hàng"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm khách có sẵn theo tên hoặc SĐT..."
          className="h-9 border-0 px-0 focus-visible:ring-0"
        />
      </div>
      {results.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-lg border">
          {results.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <button
                type="button"
                onClick={() =>
                  onChange({
                    label: `${item.fullName} · ${item.phone ?? ""}`,
                    payload:
                      item.kind === "registered"
                        ? { customerId: item.id }
                        : { customerContactId: item.id },
                  })
                }
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span>{item.fullName}</span>
                <span className="text-muted-foreground">{item.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-1.5 rounded-lg border border-dashed p-3">
        <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <UserPlus className="size-3.5" />
          Hoặc thêm khách mới
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={newFullName}
            onChange={(e) => setNewFullName(e.target.value)}
            placeholder="Họ tên"
            className="h-9"
          />
          <Input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="SĐT"
            className="h-9"
          />
        </div>
        <button
          type="button"
          disabled={!newFullName.trim() || !newPhone.trim()}
          onClick={() =>
            onChange({
              label: `${newFullName.trim()} · ${newPhone.trim()} (mới)`,
              payload: {
                newCustomer: { fullName: newFullName.trim(), phone: newPhone.trim() },
              },
            })
          }
          className="text-sm font-medium text-blue-600 disabled:cursor-not-allowed disabled:text-muted-foreground"
        >
          Dùng khách mới này
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `customer-selector.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/pricing/customer-selector.tsx
git commit -m "feat(web/pricing): add CustomerSelector component"
```

---

### Task 4: `PricingRuleFormDialog`

**Files:**
- Create: `apps/web/src/app/owner/pricing/pricing-rule-form-dialog.tsx`

**Interfaces:**
- Consumes: `createPricingRuleSchema`/`updatePricingRuleSchema` (Task 1), `DAY_LABELS` (Task 1's `pricing-format.ts`), `getSubmitErrorMessage` (existing `@/lib/error-message`), `cn` (existing `@/lib/utils`), `PricingRule` type (Task 1)
- Produces: `PricingRuleFormDialog` — self-contained `trigger`-prop dialog (mirrors `CourtFormDialog`), used by Task 6's `PricingRulesTab`.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { toast } from "sonner";
import type { z } from "zod";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createPricingRuleSchema,
  updatePricingRuleSchema,
  type CreatePricingRuleInput,
  type UpdatePricingRuleInput,
} from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { DAY_LABELS } from "./pricing-format";
import type { PricingRule } from "./types";

interface CreateProps {
  mode: "create";
  trigger: React.ReactElement;
  venueId: string;
  courtId: string;
  onSaved: (rule: PricingRule) => void;
}

interface EditProps {
  mode: "edit";
  trigger: React.ReactElement;
  venueId: string;
  courtId: string;
  rule: PricingRule;
  onSaved: (rule: PricingRule) => void;
}

function RequiredMark() {
  return <span className="text-destructive">*</span>;
}

const EMPTY_VALUES = {
  name: "",
  daysOfWeek: [] as number[],
  startTime: "17:00",
  endTime: "22:00",
  price: 0,
  priority: undefined,
  advanceBookingHours: undefined,
  advancePrice: undefined,
  validFrom: "",
  validTo: "",
};

function valuesFromRule(rule: PricingRule) {
  return {
    name: rule.name,
    daysOfWeek: rule.daysOfWeek,
    startTime: rule.startTime,
    endTime: rule.endTime,
    price: rule.price,
    priority: rule.priority,
    advanceBookingHours: rule.advanceBookingHours ?? undefined,
    advancePrice: rule.advancePrice ?? undefined,
    validFrom: rule.validFrom ?? "",
    validTo: rule.validTo ?? "",
  };
}

export function PricingRuleFormDialog(props: CreateProps | EditProps) {
  const { trigger, venueId, courtId, onSaved, mode } = props;
  const isEdit = mode === "edit";
  const rule = props.mode === "edit" ? props.rule : undefined;
  const [open, setOpen] = useState(false);

  const form = useForm<
    z.input<typeof createPricingRuleSchema | typeof updatePricingRuleSchema>,
    unknown,
    CreatePricingRuleInput | UpdatePricingRuleInput
  >({
    resolver: zodResolver(isEdit ? updatePricingRuleSchema : createPricingRuleSchema),
    defaultValues: isEdit ? valuesFromRule(rule!) : EMPTY_VALUES,
  });

  useEffect(() => {
    if (open) {
      form.reset(isEdit ? valuesFromRule(rule!) : EMPTY_VALUES);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: CreatePricingRuleInput | UpdatePricingRuleInput) {
    const url = isEdit
      ? `/api/venues/mine/${venueId}/courts/${courtId}/pricing-rules/${rule!.id}`
      : `/api/venues/mine/${venueId}/courts/${courtId}/pricing-rules`;
    const response = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        priority: values.priority || undefined,
        advanceBookingHours: values.advanceBookingHours || undefined,
        advancePrice: values.advancePrice || undefined,
        validFrom: values.validFrom || undefined,
        validTo: values.validTo || undefined,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success(isEdit ? "Đã lưu thay đổi" : "Đã thêm khung giá");
    onSaved(data as PricingRule);
    setOpen(false);
  }

  const { errors } = form.formState;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg gap-0 p-0">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle className="text-lg font-semibold">
            {isEdit ? "Sửa khung giá" : "Thêm khung giá mới"}
          </DialogTitle>
          <DialogClose
            className="text-muted-foreground outline-none hover:text-foreground"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </DialogClose>
        </div>

        <form
          id={isEdit ? `pricing-rule-form-${rule!.id}` : "pricing-rule-form-create"}
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-6 py-5"
        >
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">
              Tên khung giá <RequiredMark />
            </Label>
            <Input id="rule-name" placeholder="VD: Buổi tối (17h-22h)" {...form.register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>
              Thứ áp dụng <RequiredMark />
            </Label>
            <Controller
              name="daysOfWeek"
              control={form.control}
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {DAY_LABELS.map((label, day) => {
                    const current = (field.value ?? []) as number[];
                    const checked = current.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          field.onChange(
                            checked ? current.filter((d) => d !== day) : [...current, day],
                          )
                        }
                        className={cn(
                          "flex size-9 items-center justify-center rounded-lg border text-sm font-medium",
                          checked
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-input text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            />
            {errors.daysOfWeek && (
              <p className="text-sm text-destructive">{errors.daysOfWeek.message as string}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rule-start">
                Giờ bắt đầu <RequiredMark />
              </Label>
              <Input id="rule-start" type="time" {...form.register("startTime")} />
              {errors.startTime && (
                <p className="text-sm text-destructive">{errors.startTime.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-end">
                Giờ kết thúc <RequiredMark />
              </Label>
              <Input id="rule-end" type="time" {...form.register("endTime")} />
              {errors.endTime && (
                <p className="text-sm text-destructive">{errors.endTime.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rule-price">
                Giá (đ) <RequiredMark />
              </Label>
              <Input id="rule-price" type="number" step="1000" {...form.register("price")} />
              {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-priority">Ưu tiên</Label>
              <Input id="rule-priority" type="number" {...form.register("priority")} />
              {errors.priority && (
                <p className="text-sm text-destructive">{errors.priority.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rule-advance-hours">Đặt trước (giờ)</Label>
              <Input id="rule-advance-hours" type="number" {...form.register("advanceBookingHours")} />
              {errors.advanceBookingHours && (
                <p className="text-sm text-destructive">{errors.advanceBookingHours.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-advance-price">Giá đặt trước (đ)</Label>
              <Input id="rule-advance-price" type="number" step="1000" {...form.register("advancePrice")} />
              {errors.advancePrice && (
                <p className="text-sm text-destructive">{errors.advancePrice.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rule-from">Từ ngày</Label>
              <Input id="rule-from" type="date" {...form.register("validFrom")} />
              {errors.validFrom && (
                <p className="text-sm text-destructive">{errors.validFrom.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-to">Đến ngày</Label>
              <Input id="rule-to" type="date" {...form.register("validTo")} />
              {errors.validTo && <p className="text-sm text-destructive">{errors.validTo.message}</p>}
            </div>
          </div>
        </form>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="rounded-lg border px-4 py-2 text-sm font-medium">Hủy</DialogClose>
          <Button
            type="submit"
            form={isEdit ? `pricing-rule-form-${rule!.id}` : "pricing-rule-form-create"}
            disabled={form.formState.isSubmitting}
            className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
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

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `pricing-rule-form-dialog.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/pricing/pricing-rule-form-dialog.tsx
git commit -m "feat(web/pricing): add PricingRuleFormDialog"
```

---

### Task 5: `CopyPricingDialog`

**Files:**
- Create: `apps/web/src/app/owner/pricing/copy-pricing-dialog.tsx`

**Interfaces:**
- Consumes: `CourtWithVenueName` from `../types` (existing courts types), `PricingRule` (Task 1)
- Produces: `CopyPricingDialog` — self-contained `trigger`-prop dialog, used by Task 6's `PricingRulesTab`.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { CourtWithVenueName } from "../types";
import type { PricingRule } from "./types";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

export function CopyPricingDialog({
  trigger,
  venueId,
  targetCourtId,
  sourceCandidates,
  onCopied,
}: {
  trigger: React.ReactElement;
  venueId: string;
  targetCourtId: string;
  sourceCandidates: CourtWithVenueName[];
  onCopied: (rules: PricingRule[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sourceCourtId, setSourceCourtId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!sourceCourtId) {
      toast.error("Vui lòng chọn sân nguồn");
      return;
    }
    setSubmitting(true);
    const response = await fetch(
      `/api/venues/mine/${venueId}/courts/${targetCourtId}/pricing-rules/copy-from/${sourceCourtId}`,
      { method: "POST" },
    );
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    const copied = data as PricingRule[];
    toast.success(`Đã sao chép ${copied.length} khung giá`);
    onCopied(copied);
    setSourceCourtId("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-sm gap-0 p-0">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle className="text-lg font-semibold">Sao chép bảng giá</DialogTitle>
          <DialogClose
            className="text-muted-foreground outline-none hover:text-foreground"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </DialogClose>
        </div>
        <div className="space-y-3 px-6 py-5">
          <p className="text-sm text-muted-foreground">
            Sao chép toàn bộ khung giá từ một sân khác sang sân đang chọn.
          </p>
          <select
            value={sourceCourtId}
            onChange={(e) => setSourceCourtId(e.target.value)}
            className={SELECT_CLASS}
          >
            <option value="" disabled>
              -- Chọn sân nguồn --
            </option>
            {sourceCandidates.map((court) => (
              <option key={court.id} value={court.id}>
                {court.venueName} · {court.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="rounded-lg border px-4 py-2 text-sm font-medium">Hủy</DialogClose>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
          >
            <Copy className="size-4" />
            Sao chép
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `copy-pricing-dialog.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/pricing/copy-pricing-dialog.tsx
git commit -m "feat(web/pricing): add CopyPricingDialog"
```

---

### Task 6: `PricingRulesTab`

**Files:**
- Create: `apps/web/src/app/owner/pricing/pricing-rules-tab.tsx`

**Interfaces:**
- Consumes: `PricingRuleFormDialog` (Task 4), `CopyPricingDialog` (Task 5), `formatDaysOfWeek`/`formatMoney` (Task 1), `getSubmitErrorMessage`
- Produces: `PricingRulesTab` component — `props: { venueId, courtsInVenue, selectedCourtId, onCourtChange, rules, onRuleSaved, onRuleDeleted }`, used by Task 10's `page.tsx`.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Copy, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { formatDaysOfWeek, formatMoney } from "./pricing-format";
import { PricingRuleFormDialog } from "./pricing-rule-form-dialog";
import { CopyPricingDialog } from "./copy-pricing-dialog";
import type { CourtWithVenueName } from "../types";
import type { PricingRule } from "./types";

const SELECT_CLASS =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

export function PricingRulesTab({
  venueId,
  courtsInVenue,
  selectedCourtId,
  onCourtChange,
  rules,
  copySourceCandidates,
  onRuleSaved,
  onRuleDeleted,
  onCopied,
}: {
  venueId: string;
  courtsInVenue: CourtWithVenueName[];
  selectedCourtId: string;
  onCourtChange: (courtId: string) => void;
  rules: PricingRule[];
  /** All of the owner's courts across every venue except the one currently
   * selected — `copy-from` is allowed to pull rules from any venue the
   * owner owns, not just this one. Supplied by page.tsx (Task 10), which is
   * the only place with the full cross-venue court list. */
  copySourceCandidates: CourtWithVenueName[];
  onRuleSaved: (rule: PricingRule) => void;
  onRuleDeleted: (ruleId: string) => void;
  onCopied: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = rules.filter((rule) =>
    rule.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedCourtId}
              onChange={(e) => onCourtChange(e.target.value)}
              className={SELECT_CLASS}
            >
              {courtsInVenue.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm tên khung giá..."
                className="h-9 w-48 border-0 px-0 focus-visible:ring-0"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <CopyPricingDialog
              venueId={venueId}
              targetCourtId={selectedCourtId}
              sourceCandidates={copySourceCandidates}
              onCopied={onCopied}
              trigger={
                <Button type="button" variant="outline" className="gap-1.5">
                  <Copy className="size-4" />
                  Sao chép
                </Button>
              }
            />
            <PricingRuleFormDialog
              mode="create"
              venueId={venueId}
              courtId={selectedCourtId}
              onSaved={onRuleSaved}
              trigger={
                <Button type="button" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700">
                  <Plus className="size-4" />
                  Thêm bảng giá
                </Button>
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableHead>TÊN KHUNG GIÁ</TableHead>
                <TableHead>THỨ ÁP DỤNG</TableHead>
                <TableHead>KHUNG GIỜ</TableHead>
                <TableHead>GIÁ</TableHead>
                <TableHead>ĐẶT TRƯỚC</TableHead>
                <TableHead>ƯU TIÊN</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {rules.length === 0
                      ? "Chưa có khung giá nào cho sân này — Tạo khung giá đầu tiên"
                      : "Không tìm thấy khung giá phù hợp"}
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((rule) => (
                <PricingRuleRow
                  key={rule.id}
                  venueId={venueId}
                  courtId={selectedCourtId}
                  rule={rule}
                  onSaved={onRuleSaved}
                  onDeleted={onRuleDeleted}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function PricingRuleRow({
  venueId,
  courtId,
  rule,
  onSaved,
  onDeleted,
}: {
  venueId: string;
  courtId: string;
  rule: PricingRule;
  onSaved: (rule: PricingRule) => void;
  onDeleted: (ruleId: string) => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const response = await fetch(
      `/api/venues/mine/${venueId}/courts/${courtId}/pricing-rules/${rule.id}`,
      { method: "DELETE" },
    );
    setDeleting(false);
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success("Đã xóa khung giá");
    setDeleteOpen(false);
    onDeleted(rule.id);
  }

  return (
    <TableRow>
      <TableCell className="font-medium">{rule.name}</TableCell>
      <TableCell>{formatDaysOfWeek(rule.daysOfWeek)}</TableCell>
      <TableCell>
        {rule.startTime} - {rule.endTime}
      </TableCell>
      <TableCell className="font-semibold text-blue-600 dark:text-blue-400">
        {formatMoney(rule.price)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {rule.advanceBookingHours
          ? `${rule.advanceBookingHours}h → ${formatMoney(rule.advancePrice ?? 0)}`
          : "—"}
      </TableCell>
      <TableCell>{rule.priority}</TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1.5">
          <PricingRuleFormDialog
            mode="edit"
            venueId={venueId}
            courtId={courtId}
            rule={rule}
            onSaved={onSaved}
            trigger={
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Sửa khung giá"
                className="border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/40"
              >
                <Pencil className="size-3.5" />
              </Button>
            }
          />
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Xóa khung giá"
                  className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              }
            />
            <DialogContent className="max-w-sm p-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <Trash2 className="size-11 text-muted-foreground/70" strokeWidth={1.25} />
                <DialogTitle className="text-base font-semibold">
                  Xóa khung giá <span className="text-blue-600">{rule.name}</span>?
                </DialogTitle>
              </div>
              <div className="mt-5 flex gap-3">
                <DialogClose className="flex-1 rounded-lg border bg-muted/60 px-4 py-2 text-sm font-medium hover:bg-muted">
                  Hủy
                </DialogClose>
                <Button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 gap-1.5 bg-red-600 text-white hover:bg-red-700"
                >
                  <Trash2 className="size-4" />
                  Xóa
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </TableCell>
    </TableRow>
  );
}
```

Note: `copySourceCandidates` and `onCopied` are supplied by `page.tsx` (Task 10) — `copySourceCandidates` is every court the owner has *outside* the selected one, across all their venues (not just this venue), since the backend's `copy-from` endpoint allows copying across venues; `page.tsx` is the only place that fetches the full cross-venue court list.

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `pricing-rules-tab.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/pricing/pricing-rules-tab.tsx
git commit -m "feat(web/pricing): add PricingRulesTab"
```

---

### Task 7: `RecurringScheduleFormDialog`

**Files:**
- Create: `apps/web/src/app/owner/pricing/recurring-schedule-form-dialog.tsx`

**Interfaces:**
- Consumes: `CustomerSelector`/`CustomerSelection` (Task 3), `createRecurringScheduleSchema` (Task 1), `DAY_LABELS`/`formatMoney`/`sessionPriceAfterDiscount` (Task 1), `CourtWithVenueName` (existing courts types), `CreateRecurringScheduleResult` (Task 1)
- Produces: `RecurringScheduleFormDialog` — self-contained `trigger`-prop dialog, used by Task 9's `RecurringSchedulesTab`.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  createRecurringScheduleSchema,
  type CreateRecurringScheduleInput,
} from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { DAY_LABELS, formatMoney, sessionPriceAfterDiscount } from "./pricing-format";
import { CustomerSelector, type CustomerSelection } from "./customer-selector";
import type { CourtWithVenueName } from "../types";
import type { CreateRecurringScheduleResult } from "./types";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

function RequiredMark() {
  return <span className="text-destructive">*</span>;
}

function defaultValues(defaultCourtId: string | null) {
  return {
    courtId: defaultCourtId ?? "",
    dayOfWeek: 0,
    startTime: "18:00",
    endTime: "19:00",
    pricePerSession: 0,
    discountPercent: undefined,
    validFrom: "",
    validTo: "",
    note: "",
    autoRenew: false,
  };
}

export function RecurringScheduleFormDialog({
  trigger,
  venueId,
  courtsInVenue,
  defaultCourtId,
  onCreated,
}: {
  trigger: React.ReactElement;
  venueId: string;
  courtsInVenue: CourtWithVenueName[];
  defaultCourtId: string | null;
  onCreated: (result: CreateRecurringScheduleResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState<CustomerSelection | null>(null);

  const form = useForm<
    z.input<typeof createRecurringScheduleSchema>,
    unknown,
    CreateRecurringScheduleInput
  >({
    resolver: zodResolver(createRecurringScheduleSchema),
    defaultValues: defaultValues(defaultCourtId),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultValues(defaultCourtId));
      setCustomer(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultCourtId]);

  const { errors } = form.formState;
  const pricePerSession = form.watch("pricePerSession");
  const discountPercent = form.watch("discountPercent");

  async function onSubmit(values: CreateRecurringScheduleInput) {
    if (!customer) {
      toast.error("Vui lòng chọn khách hàng");
      return;
    }
    const response = await fetch(`/api/venues/mine/${venueId}/recurring-schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        discountPercent: values.discountPercent || undefined,
        note: values.note || undefined,
        ...customer.payload,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    const result = data as CreateRecurringScheduleResult;
    if (result.conflictingDates.length > 0) {
      toast.success(
        `Đã tạo lịch, ${result.generatedCount} buổi được sinh, ${result.conflictingDates.length} buổi bị trùng lịch (${result.conflictingDates.join(", ")}) đã bỏ qua`,
      );
    } else {
      toast.success(`Đã tạo lịch cố định, ${result.generatedCount} buổi được sinh`);
    }
    onCreated(result);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg gap-0 p-0">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle className="text-lg font-semibold">Thêm lịch cố định</DialogTitle>
          <DialogClose
            className="text-muted-foreground outline-none hover:text-foreground"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </DialogClose>
        </div>

        <form
          id="recurring-schedule-form"
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-6 py-5"
        >
          <div className="space-y-1.5">
            <Label>
              Khách hàng <RequiredMark />
            </Label>
            <CustomerSelector value={customer} onChange={setCustomer} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="schedule-court">
              Sân <RequiredMark />
            </Label>
            <select id="schedule-court" className={SELECT_CLASS} {...form.register("courtId")}>
              <option value="" disabled>
                -- Chọn sân --
              </option>
              {courtsInVenue.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </select>
            {errors.courtId && <p className="text-sm text-destructive">{errors.courtId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="schedule-day">
              Thứ trong tuần <RequiredMark />
            </Label>
            <select id="schedule-day" className={SELECT_CLASS} {...form.register("dayOfWeek")}>
              {DAY_LABELS.map((label, day) => (
                <option key={day} value={day}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-start">
                Giờ bắt đầu <RequiredMark />
              </Label>
              <Input id="schedule-start" type="time" {...form.register("startTime")} />
              {errors.startTime && (
                <p className="text-sm text-destructive">{errors.startTime.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-end">
                Giờ kết thúc <RequiredMark />
              </Label>
              <Input id="schedule-end" type="time" {...form.register("endTime")} />
              {errors.endTime && <p className="text-sm text-destructive">{errors.endTime.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-price">
                Giá/buổi (đ) <RequiredMark />
              </Label>
              <Input id="schedule-price" type="number" step="1000" {...form.register("pricePerSession")} />
              {errors.pricePerSession && (
                <p className="text-sm text-destructive">{errors.pricePerSession.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-discount">Giảm %</Label>
              <Input id="schedule-discount" type="number" step="1" {...form.register("discountPercent")} />
              {errors.discountPercent && (
                <p className="text-sm text-destructive">{errors.discountPercent.message}</p>
              )}
            </div>
          </div>

          {Number(pricePerSession) > 0 && (
            <p className="text-sm text-muted-foreground">
              Giá sau giảm:{" "}
              <span className="font-medium text-foreground">
                {formatMoney(
                  sessionPriceAfterDiscount(
                    Number(pricePerSession),
                    discountPercent ? Number(discountPercent) : null,
                  ),
                )}
              </span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-from">
                Từ ngày <RequiredMark />
              </Label>
              <Input id="schedule-from" type="date" {...form.register("validFrom")} />
              {errors.validFrom && (
                <p className="text-sm text-destructive">{errors.validFrom.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-to">
                Đến ngày <RequiredMark />
              </Label>
              <Input id="schedule-to" type="date" {...form.register("validTo")} />
              {errors.validTo && <p className="text-sm text-destructive">{errors.validTo.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="schedule-note">Ghi chú</Label>
            <textarea
              id="schedule-note"
              rows={2}
              placeholder="VD: Đội bóng Anh Tuấn – T3+T5 hàng tuần"
              className="w-full rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none"
              {...form.register("note")}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" {...form.register("autoRenew")} />
            Tự động gia hạn tháng sau
          </label>
        </form>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="rounded-lg border px-4 py-2 text-sm font-medium">Hủy</DialogClose>
          <Button
            type="submit"
            form="recurring-schedule-form"
            disabled={form.formState.isSubmitting}
            className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
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

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `recurring-schedule-form-dialog.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/pricing/recurring-schedule-form-dialog.tsx
git commit -m "feat(web/pricing): add RecurringScheduleFormDialog"
```

---

### Task 8: `RecurringScheduleDetailDialog`

**Files:**
- Create: `apps/web/src/app/owner/pricing/recurring-schedule-detail-dialog.tsx`

**Interfaces:**
- Consumes: `dayLabel`/`formatMoney`/`formatShortDate`/`sessionPriceAfterDiscount` (Task 1), `RecurringScheduleDetail` (Task 1)
- Produces: `RecurringScheduleDetailDialog` — externally-controlled dialog (`open`/`onOpenChange`/`scheduleId` props, mirrors `CustomerDetailDialog`), used by Task 10's `page.tsx`.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { dayLabel, formatMoney, formatShortDate, sessionPriceAfterDiscount } from "./pricing-format";
import type { RecurringScheduleDetail } from "./types";

const OCCURRENCE_STATUS_LABEL: Record<string, string> = {
  confirmed: "Đã xác nhận",
  cancelled: "Đã huỷ",
  completed: "Hoàn thành",
};

export function RecurringScheduleDetailDialog({
  open,
  onOpenChange,
  venueId,
  scheduleId,
  onCancelled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  scheduleId: string | null;
  onCancelled: () => void;
}) {
  const [detail, setDetail] = useState<RecurringScheduleDetail | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    if (!open || !scheduleId) {
      setDetail(null);
      setConfirmCancel(false);
      return;
    }
    setDetail(null);
    fetch(`/api/venues/mine/${venueId}/recurring-schedules/${scheduleId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setDetail(data));
  }, [open, scheduleId, venueId]);

  async function handleCancel() {
    if (!scheduleId) return;
    setCancelling(true);
    const response = await fetch(
      `/api/venues/mine/${venueId}/recurring-schedules/${scheduleId}/cancel`,
      { method: "POST" },
    );
    const data = await response.json().catch(() => null);
    setCancelling(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success("Đã huỷ lịch cố định");
    setConfirmCancel(false);
    onCancelled();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle className="text-lg font-semibold">Chi tiết lịch cố định</DialogTitle>
          <DialogClose
            className="text-muted-foreground outline-none hover:text-foreground"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </DialogClose>
        </div>

        {detail === null ? (
          <p className="px-6 py-12 text-center text-muted-foreground">Đang tải...</p>
        ) : (
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Thứ + khung giờ</p>
                <p className="font-medium">
                  {dayLabel(detail.schedule.dayOfWeek)}, {detail.schedule.startTime} -{" "}
                  {detail.schedule.endTime}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Giá/buổi (sau giảm)</p>
                <p className="font-medium">
                  {formatMoney(
                    sessionPriceAfterDiscount(
                      detail.schedule.pricePerSession,
                      detail.schedule.discountPercent,
                    ),
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Từ ngày - Đến ngày</p>
                <p className="font-medium">
                  {formatShortDate(detail.schedule.validFrom)} -{" "}
                  {formatShortDate(detail.schedule.validTo)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Tự động gia hạn</p>
                <p className="font-medium">{detail.schedule.autoRenew ? "Có" : "Không"}</p>
              </div>
              {detail.schedule.note && (
                <div className="col-span-2">
                  <p className="text-muted-foreground">Ghi chú</p>
                  <p className="font-medium">{detail.schedule.note}</p>
                </div>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-sm font-semibold">
                Các buổi đã sinh ({detail.occurrences.length})
              </p>
              <div className="max-h-52 overflow-y-auto rounded-lg border">
                {detail.occurrences.length === 0 ? (
                  <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                    Chưa có buổi nào
                  </p>
                ) : (
                  <ul className="divide-y">
                    {detail.occurrences.map((occurrence) => (
                      <li
                        key={occurrence.id}
                        className="flex items-center justify-between px-3 py-2 text-sm"
                      >
                        <span>
                          {formatShortDate(occurrence.date)} · {occurrence.startTime}-
                          {occurrence.endTime}
                        </span>
                        <span className="text-muted-foreground">
                          {OCCURRENCE_STATUS_LABEL[occurrence.status] ?? occurrence.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {detail.schedule.status === "active" &&
              (confirmCancel ? (
                <div className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                  <p className="text-sm">Huỷ toàn bộ buổi trong tương lai của lịch này?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmCancel(false)}
                      className="rounded-lg border px-3 py-1.5 text-sm font-medium"
                    >
                      Không
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="bg-red-600 text-white hover:bg-red-700"
                    >
                      Xác nhận huỷ
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmCancel(true)}
                  className="gap-1.5 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400"
                >
                  <Ban className="size-4" />
                  Huỷ lịch cố định
                </Button>
              ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `recurring-schedule-detail-dialog.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/pricing/recurring-schedule-detail-dialog.tsx
git commit -m "feat(web/pricing): add RecurringScheduleDetailDialog"
```

---

### Task 9: `RecurringSchedulesTab` + `PricingMetrics`

**Files:**
- Create: `apps/web/src/app/owner/pricing/recurring-schedules-tab.tsx`
- Create: `apps/web/src/app/owner/pricing/pricing-metrics.tsx`

**Interfaces:**
- Consumes: `RecurringScheduleFormDialog` (Task 7), `dayLabel`/`formatMoney`/`formatShortDate`/`sessionPriceAfterDiscount` (Task 1)
- Produces: `RecurringSchedulesTab` (`props: { venueId, courtsInVenue, defaultCourtId, schedules, onCreated, onOpenDetail }`) and `PricingMetrics` (`props: { summary: PricingSummary }`) — both used by Task 10's `page.tsx`.

- [ ] **Step 1: Write `recurring-schedules-tab.tsx`**

```tsx
"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dayLabel, formatMoney, formatShortDate, sessionPriceAfterDiscount } from "./pricing-format";
import { RecurringScheduleFormDialog } from "./recurring-schedule-form-dialog";
import type { CourtWithVenueName } from "../types";
import type { CreateRecurringScheduleResult, RecurringScheduleListItem } from "./types";

export function RecurringSchedulesTab({
  venueId,
  courtsInVenue,
  defaultCourtId,
  schedules,
  onCreated,
  onOpenDetail,
}: {
  venueId: string;
  courtsInVenue: CourtWithVenueName[];
  defaultCourtId: string | null;
  schedules: RecurringScheduleListItem[];
  onCreated: (result: CreateRecurringScheduleResult) => void;
  onOpenDetail: (scheduleId: string) => void;
}) {
  const courtNameById = new Map(courtsInVenue.map((court) => [court.id, court.name]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <RecurringScheduleFormDialog
          venueId={venueId}
          courtsInVenue={courtsInVenue}
          defaultCourtId={defaultCourtId}
          onCreated={onCreated}
          trigger={
            <Button type="button" className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700">
              <Plus className="size-4" />
              Thêm lịch cố định
            </Button>
          }
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableHead>SÂN</TableHead>
                <TableHead>THỨ + KHUNG GIỜ</TableHead>
                <TableHead>GIÁ/BUỔI</TableHead>
                <TableHead>TỪ - ĐẾN</TableHead>
                <TableHead>SỐ BUỔI</TableHead>
                <TableHead>TRẠNG THÁI</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Chưa có lịch cố định – Khách đặt sân hàng tuần sẽ hiện ở đây
                  </TableCell>
                </TableRow>
              )}
              {schedules.map((schedule) => (
                <TableRow
                  key={schedule.id}
                  className="cursor-pointer"
                  onClick={() => onOpenDetail(schedule.id)}
                >
                  <TableCell className="font-medium">
                    {courtNameById.get(schedule.courtId) ?? "—"}
                  </TableCell>
                  <TableCell>
                    {dayLabel(schedule.dayOfWeek)}, {schedule.startTime} - {schedule.endTime}
                  </TableCell>
                  <TableCell className="font-semibold text-blue-600 dark:text-blue-400">
                    {formatMoney(
                      sessionPriceAfterDiscount(schedule.pricePerSession, schedule.discountPercent),
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatShortDate(schedule.validFrom)} - {formatShortDate(schedule.validTo)}
                  </TableCell>
                  <TableCell>{schedule.occurrenceCount}</TableCell>
                  <TableCell>
                    <span
                      className={
                        schedule.status === "active"
                          ? "inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-600 dark:bg-green-950/40 dark:text-green-400"
                          : "inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      }
                    >
                      {schedule.status === "active" ? "Đang áp dụng" : "Đã huỷ"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">Xem chi tiết →</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Write `pricing-metrics.tsx`**

```tsx
import { Repeat, Tag, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "./pricing-format";
import type { PricingSummary } from "./types";

const CARD_STYLES = {
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  green: "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  amber: "bg-amber-100 text-amber-500 dark:bg-amber-950/40 dark:text-amber-400",
} as const;

function MetricCard({
  icon: Icon,
  color,
  label,
  value,
  caption,
}: {
  icon: LucideIcon;
  color: keyof typeof CARD_STYLES;
  label: string;
  value: string;
  caption?: string;
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
          {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function PricingMetrics({ summary }: { summary: PricingSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <MetricCard icon={Tag} color="blue" label="Bảng giá" value={String(summary.pricingRulesCount)} />
      <MetricCard
        icon={Repeat}
        color="green"
        label="Đặt cố định"
        value={String(summary.activeRecurringSchedulesCount)}
      />
      <MetricCard
        icon={TrendingUp}
        color="amber"
        label="Doanh thu cố định/tháng"
        value={formatMoney(summary.estimatedMonthlyRecurringRevenue)}
        caption="Số ước tính"
      />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `recurring-schedules-tab.tsx` or `pricing-metrics.tsx`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/owner/pricing/recurring-schedules-tab.tsx apps/web/src/app/owner/pricing/pricing-metrics.tsx
git commit -m "feat(web/pricing): add RecurringSchedulesTab and PricingMetrics"
```

---

### Task 10: `page.tsx` — full wiring and manual verification

**Files:**
- Modify: `apps/web/src/app/owner/pricing/page.tsx` (replace the `ComingSoon` stub)

**Interfaces:**
- Consumes: everything from Tasks 1–9, plus `useBranch`/`ALL_BRANCHES_ID` (existing `@/lib/branch-context`), `CourtWithVenueName`/`Venue` (existing `../types`)
- Produces: the finished page at `/owner/pricing`.

- [ ] **Step 1: Write `page.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBranch, ALL_BRANCHES_ID } from "@/lib/branch-context";
import { PricingMetrics } from "./pricing-metrics";
import { PricingRulesTab } from "./pricing-rules-tab";
import { RecurringSchedulesTab } from "./recurring-schedules-tab";
import { RecurringScheduleDetailDialog } from "./recurring-schedule-detail-dialog";
import type { CourtWithVenueName, Venue } from "../types";
import type {
  PricingRule,
  PricingSummary,
  RecurringScheduleListItem,
} from "./types";

export default function OwnerPricingPage() {
  const router = useRouter();
  const { selectedVenueId, setSelectedVenueId } = useBranch();

  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [allCourts, setAllCourts] = useState<CourtWithVenueName[] | null>(null);
  const [courtIdParam, setCourtIdParam] = useState<string | null>(null);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pricing" | "recurring">("pricing");
  const [summary, setSummary] = useState<PricingSummary | null>(null);
  const [rules, setRules] = useState<PricingRule[] | null>(null);
  const [schedules, setSchedules] = useState<RecurringScheduleListItem[] | null>(null);
  const [detailScheduleId, setDetailScheduleId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCourtIdParam(params.get("courtId"));
  }, []);

  // Load the owner's venues — used to fall back to one, *for this page
  // only*, when the global branch switcher is at "Tất cả chi nhánh" (every
  // pricing/recurring-schedule API needs a concrete venueId). Matches how
  // the Bookings page resolves the same situation: read from the switcher,
  // but never write the fallback back into it — only an explicit ?courtId=
  // navigation (below) is deliberate enough to sync the global switcher.
  useEffect(() => {
    fetch("/api/venues/mine")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setVenues(data));
  }, []);

  // Load every court the owner has, across all venues — used to resolve
  // ?courtId= to a venue, populate the per-venue court dropdown, and list
  // copy-from candidates.
  useEffect(() => {
    fetch("/api/venues/mine/courts")
      .then((res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner%2Fpricing");
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => data && setAllCourts(data));
  }, [router]);

  // Resolve venue from ?courtId= once courts are loaded, syncing the global
  // branch switcher so the rest of the app stays consistent.
  useEffect(() => {
    if (!courtIdParam || !allCourts) return;
    const court = allCourts.find((c) => c.id === courtIdParam);
    if (!court) return;
    setSelectedVenueId(court.venueId);
    setSelectedCourtId(courtIdParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allCourts, courtIdParam]);

  // Page-local fallback only — deliberately does NOT call
  // setSelectedVenueId, so landing here with no branch chosen doesn't
  // silently reassign the global "CHI NHÁNH" dropdown for the rest of the
  // app (that dropdown should only ever change from the user picking it,
  // or from the explicit ?courtId= navigation above).
  const resolvedVenueId =
    selectedVenueId !== ALL_BRANCHES_ID
      ? selectedVenueId
      : (venues && venues.length > 0 ? venues[0].id : null);

  const courtsInVenue = useMemo(
    () =>
      (allCourts ?? [])
        .filter((court) => court.venueId === resolvedVenueId)
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [allCourts, resolvedVenueId],
  );

  const copySourceCandidates = useMemo(
    () => (allCourts ?? []).filter((court) => court.id !== selectedCourtId),
    [allCourts, selectedCourtId],
  );

  // Keep selectedCourtId valid for the resolved venue; default to the first
  // court when nothing (or a stale/foreign court) is selected.
  useEffect(() => {
    if (courtsInVenue.length === 0) {
      setSelectedCourtId(null);
      return;
    }
    if (!selectedCourtId || !courtsInVenue.some((c) => c.id === selectedCourtId)) {
      setSelectedCourtId(courtsInVenue[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courtsInVenue]);

  const loadSummary = useCallback(() => {
    if (!resolvedVenueId) {
      setSummary(null);
      return;
    }
    fetch(`/api/venues/mine/${resolvedVenueId}/pricing-summary`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSummary(data));
  }, [resolvedVenueId]);

  const loadRules = useCallback(() => {
    if (!resolvedVenueId || !selectedCourtId) {
      setRules(null);
      return;
    }
    fetch(`/api/venues/mine/${resolvedVenueId}/courts/${selectedCourtId}/pricing-rules`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setRules(data ?? []));
  }, [resolvedVenueId, selectedCourtId]);

  const loadSchedules = useCallback(() => {
    if (!resolvedVenueId) {
      setSchedules(null);
      return;
    }
    fetch(`/api/venues/mine/${resolvedVenueId}/recurring-schedules`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSchedules(data ?? []));
  }, [resolvedVenueId]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  if (!resolvedVenueId) {
    if (venues && venues.length === 0) {
      return (
        <main className="flex w-full flex-1 flex-col items-center justify-center gap-2 bg-muted/30 p-8 text-center">
          <h1 className="text-2xl font-bold">Bảng giá</h1>
          <p className="text-muted-foreground">Bạn chưa có chi nhánh nào.</p>
        </main>
      );
    }
    return (
      <main className="flex w-full flex-1 flex-col items-center justify-center gap-2 bg-muted/30 p-8 text-center">
        <p className="text-muted-foreground">Đang tải...</p>
      </main>
    );
  }

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div>
        <h1 className="text-2xl font-bold">Bảng giá</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý giá thuê sân theo khung giờ và các lịch đặt cố định.
        </p>
      </div>

      {summary && <PricingMetrics summary={summary} />}

      <div className="flex gap-1.5">
        {(
          [
            { value: "pricing", label: "Bảng giá" },
            { value: "recurring", label: "Đặt cố định" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={
              activeTab === tab.value
                ? "inline-flex h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white"
                : "inline-flex h-9 items-center rounded-lg border px-4 text-sm font-medium text-muted-foreground hover:bg-muted"
            }
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "pricing" &&
        (selectedCourtId && rules ? (
          <PricingRulesTab
            venueId={resolvedVenueId}
            courtsInVenue={courtsInVenue}
            selectedCourtId={selectedCourtId}
            onCourtChange={setSelectedCourtId}
            rules={rules}
            copySourceCandidates={copySourceCandidates}
            onRuleSaved={(saved) => {
              setRules((prev) => {
                const existing = prev ?? [];
                const index = existing.findIndex((r) => r.id === saved.id);
                if (index === -1) return [...existing, saved];
                const next = [...existing];
                next[index] = saved;
                return next;
              });
              loadSummary();
            }}
            onRuleDeleted={(ruleId) => {
              setRules((prev) => (prev ?? []).filter((r) => r.id !== ruleId));
              loadSummary();
            }}
            onCopied={() => {
              loadRules();
              loadSummary();
            }}
          />
        ) : (
          <p className="text-center text-muted-foreground">
            Chi nhánh này chưa có sân nào để cấu hình bảng giá.
          </p>
        ))}

      {activeTab === "recurring" && schedules && (
        <RecurringSchedulesTab
          venueId={resolvedVenueId}
          courtsInVenue={courtsInVenue}
          defaultCourtId={selectedCourtId}
          schedules={schedules}
          onCreated={() => {
            loadSchedules();
            loadSummary();
          }}
          onOpenDetail={setDetailScheduleId}
        />
      )}

      <RecurringScheduleDetailDialog
        open={detailScheduleId !== null}
        onOpenChange={(open) => !open && setDetailScheduleId(null)}
        venueId={resolvedVenueId}
        scheduleId={detailScheduleId}
        onCancelled={() => {
          loadSchedules();
          loadSummary();
        }}
      />
    </main>
  );
}
```


- [ ] **Step 2: Build**

Run: `cd apps/web && npm run build`
Expected: build succeeds with no type errors and no route conflicts.

- [ ] **Step 3: Manual browser verification**

Run: `cd apps/api && npm run start:dev` (in one terminal) and `cd apps/web && npm run dev` (in another), then in a browser as a logged-in owner:

1. From the sidebar, click "Bảng giá" with no branch explicitly selected — confirm the page loads real data immediately (falling back to the owner's first venue, page-locally) rather than blocking on a "choose a branch" prompt; that prompt should only appear if the owner truly has zero venues. Confirm the sidebar's own "CHI NHÁNH" dropdown still reads "Tất cả chi nhánh" afterward — visiting this page must not silently change that global switcher.
2. From "Danh sách sân", click the eye icon on a court — confirm it lands on `/owner/pricing?courtId=...` with that court pre-selected and the branch switcher synced.
3. On the "Bảng giá" tab: add a pricing rule (with and without the optional advance-booking/valid-range fields), confirm it appears in the table and the summary card count increases; edit it; delete it; switch the court dropdown and confirm the list changes; use "Sao chép" from another court and confirm rules appear.
4. Switch to "Đặt cố định": confirm the empty state copy when there are none; add a recurring schedule using both an existing customer (search) and a brand-new customer; confirm the toast reports `generatedCount`/`conflictingDates` correctly; click a row to open the detail dialog, confirm occurrences list and cancel it; confirm the summary cards update.
5. Confirm dark mode renders correctly (toggle via the app's theme switcher if present) for the new badges/cards.

Report any visual or behavioral issues found and fix them before considering this task done.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/owner/pricing/page.tsx
git commit -m "feat(web/pricing): wire up the Bảng giá page"
```

---

## Out of scope

- Everything already listed in the design spec §8 (unsupported backend fields, server-side search/filter for these lists, per-occurrence edit/delete, renewal/expiry notifications).
