# Revenue Reports Module Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `GET /reports/revenue` and `GET /reports/revenue/export` so the owner-facing Revenue Reports frontend (already spec'd, not yet built) has a real API to call.

**Architecture:** A new read-only `ReportsModule` (NestJS) under `apps/api/src/reports/`, following the exact pattern of the existing `DashboardModule`: no new database tables, all figures computed on the fly via TypeORM query builder joins across `payments` → `bookings` → `users`/`customer_contacts`, scoped to the caller's venues through the existing `VenuesService`/`OwnerScopeGuard`. A small set of pure helper functions (previous-period math, transaction code, CSV formatting) live in their own file so they can be unit-tested directly; the query/orchestration layer is validated with e2e tests against a real Postgres test database, matching how `DashboardModule` and `CustomersModule` are tested in this codebase (they have no service-level unit tests, only e2e).

**Tech Stack:** NestJS 10, TypeORM (Postgres, raw query builder + `getRawMany`/`getRawOne`), class-validator, Jest (`*.spec.ts` for unit, `test/*.e2e-spec.ts` for e2e via supertest).

## Global Constraints

- Source of truth for spec: [docs/superpowers/specs/2026-08-26-revenue-reports-design.md](../specs/2026-08-26-revenue-reports-design.md) (as reconciled by its own §0 on 2026-09-03 — **read §0 first**, it overrides §4/§5 below it).
- `payments` has no `amount` column. Every "amount" in the spec means `bookings.total_price` for the booking joined via `payment.booking_id = booking.id` — copy the exact join style already used in `apps/api/src/dashboard/dashboard.service.ts` and `apps/api/src/customers/customers.service.ts` (`booking.id::text = payment.booking_id`, since `payment.bookingId` is stored as text/uuid string, not a native FK type in the query builder).
- Access tier is `@OwnerScope('operational')` (owner + any staff role), exactly like `DashboardController` — not a bare "owner role" check.
- No pagination on the transactions list (spec §6 — MVP returns everything in range).
- No new npm dependencies — CSV is hand-built with a small pure formatter, no library.
- All commands below assume the working directory is `apps/api/` (it is a standalone npm project, not part of an npm workspace — `cd apps/api` first if you're at the repo root).

---

## File Structure

```
apps/api/src/common/date-range.utils.ts        (MODIFY — add getDaysBetween, parseDateRangeBoundaries)
apps/api/src/common/date-range.utils.spec.ts   (MODIFY — tests for the above)
apps/api/src/reports/revenue-report.utils.ts   (NEW — pure helpers: previous-period math, transaction code, CSV)
apps/api/src/reports/revenue-report.utils.spec.ts (NEW)
apps/api/src/reports/dto/get-revenue-report.dto.ts (NEW)
apps/api/src/reports/reports.service.ts        (NEW — queries + orchestration)
apps/api/src/reports/reports.controller.ts     (NEW — GET /reports/revenue, GET /reports/revenue/export)
apps/api/src/reports/reports.module.ts         (NEW)
apps/api/src/app.module.ts                     (MODIFY — register ReportsModule)
apps/api/test/reports-revenue.e2e-spec.ts      (NEW — full behavioral coverage)
```

---

### Task 1: Date-range utilities — `getDaysBetween` and `parseDateRangeBoundaries`

**Files:**
- Modify: `apps/api/src/common/date-range.utils.ts`
- Test: `apps/api/src/common/date-range.utils.spec.ts`

**Interfaces:**
- Produces: `getDaysBetween(from: string, to: string): string[]` — every `YYYY-MM-DD` date from `from` to `to` inclusive, ascending. `parseDateRangeBoundaries(from: string, to: string): DateRange` — `{ start, end }` as local `Date` objects where `start` is midnight of `from` and `end` is midnight of the day *after* `to` (half-open interval, same convention as the existing `getTodayRange`/`getCurrentMonthRange` in this file).

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `apps/api/src/common/date-range.utils.spec.ts`:

```ts
describe('getDaysBetween', () => {
  it('returns every date string between from and to, inclusive, ascending', () => {
    expect(getDaysBetween('2026-08-24', '2026-08-26')).toEqual([
      '2026-08-24',
      '2026-08-25',
      '2026-08-26',
    ]);
  });

  it('returns a single-element array when from equals to', () => {
    expect(getDaysBetween('2026-08-24', '2026-08-24')).toEqual(['2026-08-24']);
  });

  it('rolls over a month boundary', () => {
    expect(getDaysBetween('2026-07-30', '2026-08-01')).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
    ]);
  });
});

describe('parseDateRangeBoundaries', () => {
  it('returns [start of from, start of the day after to)', () => {
    const { start, end } = parseDateRangeBoundaries('2026-08-01', '2026-08-25');

    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);

    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(7);
    expect(end.getDate()).toBe(26);
    expect(end.getHours()).toBe(0);
  });

  it('handles a single-day range', () => {
    const { start, end } = parseDateRangeBoundaries('2026-08-10', '2026-08-10');

    expect(start.getDate()).toBe(10);
    expect(end.getDate()).toBe(11);
  });

  it('rolls the end over a month boundary', () => {
    const { end } = parseDateRangeBoundaries('2026-08-20', '2026-08-31');

    expect(end.getMonth()).toBe(8);
    expect(end.getDate()).toBe(1);
  });
});
```

Update the top import line of the same file to also pull in the two new functions:

```ts
import {
  getTodayRange,
  getCurrentMonthRange,
  getLast30Days,
  getDaysBetween,
  parseDateRangeBoundaries,
  fillRevenueByDay,
} from './date-range.utils';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npm test -- src/common/date-range.utils.spec.ts`
Expected: FAIL — `getDaysBetween is not a function` / `parseDateRangeBoundaries is not a function`.

- [ ] **Step 3: Implement the two functions**

Append to `apps/api/src/common/date-range.utils.ts` (after `fillRevenueByDay`):

```ts
export function getDaysBetween(from: string, to: string): string[] {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const cursor = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  const days: string[] = [];
  while (cursor.getTime() <= end.getTime()) {
    days.push(formatLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function parseDateRangeBoundaries(from: string, to: string): DateRange {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const start = new Date(fy, fm - 1, fd);
  const end = new Date(ty, tm - 1, td);
  end.setDate(end.getDate() + 1);
  return { start, end };
}
```

`formatLocalDate` already exists (unexported) further up this file and is reused as-is.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npm test -- src/common/date-range.utils.spec.ts`
Expected: PASS (all suites in the file, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/date-range.utils.ts apps/api/src/common/date-range.utils.spec.ts
git commit -m "feat(api): add getDaysBetween and parseDateRangeBoundaries date-range helpers"
```

---

### Task 2: Revenue report pure helpers

**Files:**
- Create: `apps/api/src/reports/revenue-report.utils.ts`
- Test: `apps/api/src/reports/revenue-report.utils.spec.ts`

**Interfaces:**
- Consumes: nothing (pure, no dependencies on Task 1 or the DB).
- Produces (used by Task 3's service):
  - `getPreviousPeriodRange(from: string, to: string): { from: string; to: string }`
  - `buildTransactionCode(paymentId: string): string`
  - `computeAvgPerTransaction(revenue: number, transactionCount: number): number`
  - `computeChangePercent(currentRevenue: number, previousRevenue: number): number | null`
  - `formatDateTimeVN(date: Date): string`
  - `interface RevenueCsvRow { transactionCode: string; customerName: string; customerPhone: string; paidAt: Date; amount: number }`
  - `toRevenueCsv(rows: RevenueCsvRow[]): string`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/reports/revenue-report.utils.spec.ts`:

```ts
import {
  buildTransactionCode,
  computeAvgPerTransaction,
  computeChangePercent,
  formatDateTimeVN,
  getPreviousPeriodRange,
  toRevenueCsv,
} from './revenue-report.utils';

describe('getPreviousPeriodRange', () => {
  it('matches the worked example from the spec: 25-day period', () => {
    expect(getPreviousPeriodRange('2026-08-01', '2026-08-25')).toEqual({
      from: '2026-07-07',
      to: '2026-07-31',
    });
  });

  it('handles a single-day period', () => {
    expect(getPreviousPeriodRange('2026-08-15', '2026-08-15')).toEqual({
      from: '2026-08-14',
      to: '2026-08-14',
    });
  });

  it('rolls the previous period back across a year boundary', () => {
    expect(getPreviousPeriodRange('2026-01-01', '2026-01-05')).toEqual({
      from: '2025-12-27',
      to: '2025-12-31',
    });
  });
});

describe('buildTransactionCode', () => {
  it('prefixes GD- and uppercases the first 8 chars of the payment id', () => {
    expect(buildTransactionCode('3f9a2b1c-e29b-41d4-a716-446655440000')).toBe('GD-3F9A2B1C');
  });
});

describe('computeAvgPerTransaction', () => {
  it('divides revenue by count, rounded to 2 decimals', () => {
    expect(computeAvgPerTransaction(15000000, 42)).toBe(357142.86);
  });

  it('returns 0 when there are no transactions, without dividing by zero', () => {
    expect(computeAvgPerTransaction(0, 0)).toBe(0);
  });
});

describe('computeChangePercent', () => {
  it('computes a positive percent change, rounded to 1 decimal', () => {
    expect(computeChangePercent(15000000, 12000000)).toBe(25);
  });

  it('computes a negative percent change', () => {
    expect(computeChangePercent(9000000, 12000000)).toBe(-25);
  });

  it('returns null when the previous period had zero revenue', () => {
    expect(computeChangePercent(5000000, 0)).toBeNull();
  });
});

describe('formatDateTimeVN', () => {
  it('formats a Date as dd/MM/yyyy HH:mm', () => {
    expect(formatDateTimeVN(new Date(2026, 7, 5, 9, 5))).toBe('05/08/2026 09:05');
  });
});

describe('toRevenueCsv', () => {
  it('starts with a UTF-8 BOM and a Vietnamese header row', () => {
    const csv = toRevenueCsv([]);
    expect(csv.startsWith('\uFEFFMã GD,Khách hàng,SĐT,Thời gian,Số tiền,Trạng thái')).toBe(true);
  });

  it('renders one data row per transaction, "Đã thanh toán" as the status', () => {
    const csv = toRevenueCsv([
      {
        transactionCode: 'GD-3F9A2B1C',
        customerName: 'Nguyễn Văn A',
        customerPhone: '0900000000',
        paidAt: new Date(2026, 7, 15, 10, 30),
        amount: 250000,
      },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe('GD-3F9A2B1C,Nguyễn Văn A,0900000000,15/08/2026 10:30,250000,Đã thanh toán');
  });

  it('quotes a customer name that contains a comma', () => {
    const csv = toRevenueCsv([
      {
        transactionCode: 'GD-00000000',
        customerName: 'Trần, Văn B',
        customerPhone: '0911111111',
        paidAt: new Date(2026, 7, 1, 0, 0),
        amount: 100000,
      },
    ]);
    expect(csv.split('\r\n')[1]).toContain('"Trần, Văn B"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npm test -- src/reports/revenue-report.utils.spec.ts`
Expected: FAIL — `Cannot find module './revenue-report.utils'`.

- [ ] **Step 3: Implement the helpers**

Create `apps/api/src/reports/revenue-report.utils.ts`:

```ts
export interface PeriodRange {
  from: string;
  to: string;
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPreviousPeriodRange(from: string, to: string): PeriodRange {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const fromDate = new Date(fy, fm - 1, fd);
  const toDate = new Date(ty, tm - 1, td);
  const dayCount = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;

  const prevTo = new Date(fromDate);
  prevTo.setDate(prevTo.getDate() - 1);
  const prevFrom = new Date(prevTo);
  prevFrom.setDate(prevFrom.getDate() - (dayCount - 1));

  return { from: formatLocalDate(prevFrom), to: formatLocalDate(prevTo) };
}

export function buildTransactionCode(paymentId: string): string {
  return `GD-${paymentId.slice(0, 8).toUpperCase()}`;
}

export function computeAvgPerTransaction(revenue: number, transactionCount: number): number {
  if (transactionCount === 0) return 0;
  return Math.round((revenue / transactionCount) * 100) / 100;
}

export function computeChangePercent(
  currentRevenue: number,
  previousRevenue: number,
): number | null {
  if (previousRevenue === 0) return null;
  return Math.round(((currentRevenue - previousRevenue) / previousRevenue) * 1000) / 10;
}

export function formatDateTimeVN(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export interface RevenueCsvRow {
  transactionCode: string;
  customerName: string;
  customerPhone: string;
  paidAt: Date;
  amount: number;
}

function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

const CSV_HEADER = ['Mã GD', 'Khách hàng', 'SĐT', 'Thời gian', 'Số tiền', 'Trạng thái'];

export function toRevenueCsv(rows: RevenueCsvRow[]): string {
  const dataLines = rows.map((row) =>
    [
      row.transactionCode,
      row.customerName,
      row.customerPhone,
      formatDateTimeVN(row.paidAt),
      String(row.amount),
      'Đã thanh toán',
    ]
      .map(csvField)
      .join(','),
  );
  return '\uFEFF' + [CSV_HEADER.join(','), ...dataLines].join('\r\n');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npm test -- src/reports/revenue-report.utils.spec.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/reports/revenue-report.utils.ts apps/api/src/reports/revenue-report.utils.spec.ts
git commit -m "feat(api): add revenue report pure helpers (previous-period math, transaction code, CSV)"
```

---

### Task 3: `ReportsModule` — DTO, service, controller, wiring

**Files:**
- Create: `apps/api/src/reports/dto/get-revenue-report.dto.ts`
- Create: `apps/api/src/reports/reports.service.ts`
- Create: `apps/api/src/reports/reports.controller.ts`
- Create: `apps/api/src/reports/reports.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `getDaysBetween`, `parseDateRangeBoundaries`, `fillRevenueByDay` from `../common/date-range.utils`; `getPreviousPeriodRange`, `buildTransactionCode`, `computeAvgPerTransaction`, `computeChangePercent`, `toRevenueCsv` from `./revenue-report.utils`; `VenuesService.getOwnedVenueOrThrow(ownerId, venueId)` / `.findMineByOwner(ownerId)` from `../courts/venues.service`; `Court` from `../courts/entities/court.entity`; `Payment`, `PaymentStatus` from `../payments/entities/payment.entity`; `JwtAuthGuard` from `../auth/guards/jwt-auth.guard`; `OwnerScopeGuard` + `OwnerScope` from `../auth/guards/owner-scope.guard` / `../auth/decorators/owner-scope.decorator`; `EffectiveOwnerId` from `../auth/decorators/effective-owner-id.decorator`.
- Produces (relied on by Task 4's e2e tests and, later, the frontend): `GET /reports/revenue?venueId=&from=&to=` → JSON body shaped like `RevenueReport` below; `GET /reports/revenue/export?venueId=&from=&to=` → `text/csv` body with `Content-Disposition: attachment`.

This task has no isolated unit test — its correctness is entirely about wiring real TypeORM queries to a real Postgres database, so (matching how `DashboardModule` and `CustomersModule` are built in this codebase) it's verified by the e2e suite in **Task 4**, not mocked unit tests. Build it in one pass, confirm it compiles, then let Task 4 prove it behaves correctly.

- [ ] **Step 1: Create the DTO**

Create `apps/api/src/reports/dto/get-revenue-report.dto.ts`:

```ts
import { IsOptional, IsString, Matches } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class GetRevenueReportDto {
  @IsOptional()
  @IsString()
  venueId?: string;

  @Matches(DATE_PATTERN, { message: 'from phải có định dạng YYYY-MM-DD' })
  from: string;

  @Matches(DATE_PATTERN, { message: 'to phải có định dạng YYYY-MM-DD' })
  to: string;
}
```

- [ ] **Step 2: Create the service**

Create `apps/api/src/reports/reports.service.ts`:

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Court } from '../courts/entities/court.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { VenuesService } from '../courts/venues.service';
import {
  fillRevenueByDay,
  getDaysBetween,
  parseDateRangeBoundaries,
} from '../common/date-range.utils';
import {
  buildTransactionCode,
  computeAvgPerTransaction,
  computeChangePercent,
  getPreviousPeriodRange,
  toRevenueCsv,
} from './revenue-report.utils';
import { GetRevenueReportDto } from './dto/get-revenue-report.dto';

export interface RevenueReportTransaction {
  id: string;
  transactionCode: string;
  customerName: string;
  customerPhone: string;
  paidAt: string;
  amount: number;
  status: 'paid';
}

export interface RevenueReport {
  currentPeriod: { revenue: number; transactionCount: number; avgPerTransaction: number };
  previousPeriod: { revenue: number };
  changeAmount: number;
  changePercent: number | null;
  revenueByDay: { date: string; revenue: number }[];
  transactions: RevenueReportTransaction[];
}

interface PeriodAggregateRow {
  revenue: string | null;
  count: string;
}

interface TransactionRow {
  id: string;
  paidAt: Date;
  amount: string;
  customerName: string;
  customerPhone: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly venuesService: VenuesService,
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
  ) {}

  async getRevenueReport(ownerId: string, dto: GetRevenueReportDto): Promise<RevenueReport> {
    this.assertValidRange(dto);
    const courtIds = await this.resolveCourtIds(ownerId, dto.venueId);
    const days = getDaysBetween(dto.from, dto.to);

    if (courtIds.length === 0) {
      return this.emptyReport(days);
    }

    const { start, end } = parseDateRangeBoundaries(dto.from, dto.to);
    const previousPeriod = getPreviousPeriodRange(dto.from, dto.to);
    const { start: prevStart, end: prevEnd } = parseDateRangeBoundaries(
      previousPeriod.from,
      previousPeriod.to,
    );

    const [currentAggregate, previousAggregate, revenueByDayRows, transactionRows] =
      await Promise.all([
        this.aggregatePeriod(courtIds, start, end),
        this.aggregatePeriod(courtIds, prevStart, prevEnd),
        this.paymentsRepository
          .createQueryBuilder('payment')
          .innerJoin('bookings', 'booking', 'booking.id::text = payment.booking_id')
          .select("TO_CHAR(payment.paid_at, 'YYYY-MM-DD')", 'date')
          .addSelect('SUM(booking.total_price)', 'revenue')
          .where('booking.court_id IN (:...courtIds)', { courtIds })
          .andWhere('payment.status = :status', { status: PaymentStatus.PAID })
          .andWhere('payment.paid_at >= :start', { start })
          .andWhere('payment.paid_at < :end', { end })
          .groupBy("TO_CHAR(payment.paid_at, 'YYYY-MM-DD')")
          .getRawMany<{ date: string; revenue: string }>(),
        this.fetchTransactions(courtIds, start, end),
      ]);

    const currentRevenue = Number(currentAggregate.revenue ?? 0);
    const currentCount = Number(currentAggregate.count);
    const previousRevenue = Number(previousAggregate.revenue ?? 0);

    const transactions: RevenueReportTransaction[] = transactionRows.map((row) => ({
      id: row.id,
      transactionCode: buildTransactionCode(row.id),
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      paidAt: row.paidAt.toISOString(),
      amount: Number(row.amount),
      status: 'paid',
    }));

    return {
      currentPeriod: {
        revenue: currentRevenue,
        transactionCount: currentCount,
        avgPerTransaction: computeAvgPerTransaction(currentRevenue, currentCount),
      },
      previousPeriod: { revenue: previousRevenue },
      changeAmount: currentRevenue - previousRevenue,
      changePercent: computeChangePercent(currentRevenue, previousRevenue),
      revenueByDay: fillRevenueByDay(revenueByDayRows, days),
      transactions,
    };
  }

  async getRevenueReportCsv(ownerId: string, dto: GetRevenueReportDto): Promise<string> {
    this.assertValidRange(dto);
    const courtIds = await this.resolveCourtIds(ownerId, dto.venueId);
    if (courtIds.length === 0) {
      return toRevenueCsv([]);
    }
    const { start, end } = parseDateRangeBoundaries(dto.from, dto.to);
    const rows = await this.fetchTransactions(courtIds, start, end);
    return toRevenueCsv(
      rows.map((row) => ({
        transactionCode: buildTransactionCode(row.id),
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        paidAt: row.paidAt,
        amount: Number(row.amount),
      })),
    );
  }

  private assertValidRange(dto: GetRevenueReportDto): void {
    if (dto.from > dto.to) {
      throw new BadRequestException('from phải trước hoặc bằng to');
    }
  }

  private async resolveCourtIds(ownerId: string, venueId?: string): Promise<string[]> {
    const venueIds = venueId
      ? [(await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId)).id]
      : (await this.venuesService.findMineByOwner(ownerId)).map((v) => v.id);
    if (venueIds.length === 0) return [];
    const courts = await this.courtsRepository.find({ where: { venueId: In(venueIds) } });
    return courts.map((c) => c.id);
  }

  private async aggregatePeriod(
    courtIds: string[],
    start: Date,
    end: Date,
  ): Promise<PeriodAggregateRow> {
    const row = await this.paymentsRepository
      .createQueryBuilder('payment')
      .innerJoin('bookings', 'booking', 'booking.id::text = payment.booking_id')
      .select('COALESCE(SUM(booking.total_price), 0)', 'revenue')
      .addSelect('COUNT(*)', 'count')
      .where('booking.court_id IN (:...courtIds)', { courtIds })
      .andWhere('payment.status = :status', { status: PaymentStatus.PAID })
      .andWhere('payment.paid_at >= :start', { start })
      .andWhere('payment.paid_at < :end', { end })
      .getRawOne<PeriodAggregateRow>();
    return row ?? { revenue: '0', count: '0' };
  }

  private fetchTransactions(
    courtIds: string[],
    start: Date,
    end: Date,
  ): Promise<TransactionRow[]> {
    return this.paymentsRepository
      .createQueryBuilder('payment')
      .innerJoin('bookings', 'booking', 'booking.id::text = payment.booking_id')
      .leftJoin('users', 'customer', 'customer.id::text = booking.customer_id')
      .leftJoin('customer_contacts', 'contact', 'contact.id = booking.customer_contact_id')
      .select('payment.id', 'id')
      .addSelect('payment.paid_at', 'paidAt')
      .addSelect('booking.total_price', 'amount')
      .addSelect('COALESCE(customer.full_name, contact.full_name)', 'customerName')
      .addSelect('COALESCE(customer.phone, contact.phone)', 'customerPhone')
      .where('booking.court_id IN (:...courtIds)', { courtIds })
      .andWhere('payment.status = :status', { status: PaymentStatus.PAID })
      .andWhere('payment.paid_at >= :start', { start })
      .andWhere('payment.paid_at < :end', { end })
      .orderBy('payment.paid_at', 'DESC')
      .getRawMany<TransactionRow>();
  }

  private emptyReport(days: string[]): RevenueReport {
    return {
      currentPeriod: { revenue: 0, transactionCount: 0, avgPerTransaction: 0 },
      previousPeriod: { revenue: 0 },
      changeAmount: 0,
      changePercent: null,
      revenueByDay: days.map((date) => ({ date, revenue: 0 })),
      transactions: [],
    };
  }
}
```

- [ ] **Step 3: Create the controller**

Create `apps/api/src/reports/reports.controller.ts`:

```ts
import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { ReportsService } from './reports.service';
import { GetRevenueReportDto } from './dto/get-revenue-report.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, OwnerScopeGuard)
@OwnerScope('operational')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('revenue')
  getRevenue(
    @EffectiveOwnerId() ownerId: string,
    @Query() dto: GetRevenueReportDto,
  ) {
    return this.reportsService.getRevenueReport(ownerId, dto);
  }

  @Get('revenue/export')
  async exportRevenue(
    @EffectiveOwnerId() ownerId: string,
    @Query() dto: GetRevenueReportDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.reportsService.getRevenueReportCsv(ownerId, dto);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="doanh-thu-${dto.from}-den-${dto.to}.csv"`,
    });
    res.send(csv);
  }
}
```

- [ ] **Step 4: Create the module**

Create `apps/api/src/reports/reports.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourtsModule } from '../courts/courts.module';
import { Court } from '../courts/entities/court.entity';
import { Payment } from '../payments/entities/payment.entity';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [CourtsModule, TypeOrmModule.forFeature([Court, Payment])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
```

- [ ] **Step 5: Register the module in `AppModule`**

In `apps/api/src/app.module.ts`, add the import alongside the other feature modules:

```ts
import { NotificationSettingsModule } from './notification-settings/notification-settings.module';
import { ReportsModule } from './reports/reports.module';
```

And add `ReportsModule` to the `imports` array, after `NotificationSettingsModule`:

```ts
    StaffModule,
    NotificationSettingsModule,
    ReportsModule,
```

- [ ] **Step 6: Confirm it compiles**

Run: `cd apps/api && npm run build`
Expected: exits 0, no TypeScript errors (this is the "test" for this task — there's no unit-test cycle for wiring code, per the codebase's own convention for `DashboardModule`/`CustomersModule`).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/reports/dto/get-revenue-report.dto.ts apps/api/src/reports/reports.service.ts apps/api/src/reports/reports.controller.ts apps/api/src/reports/reports.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): add GET /reports/revenue and /reports/revenue/export"
```

---

### Task 4: End-to-end tests for the revenue report endpoints

**Files:**
- Create: `apps/api/test/reports-revenue.e2e-spec.ts`

**Interfaces:**
- Consumes: `createTestApp`, `clearDatabase` from `./utils/test-app`; entities `User`/`UserRole`/`UserStatus`, `Venue`/`VenueStatus`, `Court`/`CourtStatus`, `Booking`/`BookingStatus`, `Payment`/`PaymentStatus`, `CustomerContact` — same imports `dashboard.e2e-spec.ts` and `customers-list.e2e-spec.ts` already use.
- Produces: nothing further downstream — this is the leaf verification task for the whole plan.

- [ ] **Step 1: Write the e2e test file**

Create `apps/api/test/reports-revenue.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../src/courts/entities/court.entity';
import { Booking, BookingStatus } from '../src/bookings/entities/booking.entity';
import { Payment, PaymentStatus } from '../src/payments/entities/payment.entity';
import { CustomerContact } from '../src/customer-contacts/entities/customer-contact.entity';

describe('Owner revenue report (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await clearDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  let phoneCounter = 0;

  async function createUser(
    email: string,
    role: UserRole,
    status: UserStatus = UserStatus.ACTIVE,
  ): Promise<User> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const repo = dataSource.getRepository(User);
    phoneCounter += 1;
    return repo.save(
      repo.create({
        email,
        passwordHash,
        fullName: `User ${email}`,
        phone: `090${String(phoneCounter).padStart(7, '0')}`,
        role,
        status,
        emailVerified: true,
      }),
    );
  }

  async function loginAs(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: email, password: 'password123' });
    return response.body.accessToken as string;
  }

  async function createVenue(ownerId: string, name: string): Promise<Venue> {
    const repo = dataSource.getRepository(Venue);
    return repo.save(
      repo.create({
        ownerId,
        name,
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
      }),
    );
  }

  async function createCourt(venueId: string, name: string): Promise<Court> {
    const repo = dataSource.getRepository(Court);
    return repo.save(
      repo.create({
        venueId,
        name,
        pricePerHour: 100000,
        openTime: '08:00',
        closeTime: '20:00',
        slotDurationMinutes: 60,
        status: CourtStatus.ACTIVE,
      }),
    );
  }

  async function createContact(ownerId: string, fullName: string, phone: string): Promise<CustomerContact> {
    const repo = dataSource.getRepository(CustomerContact);
    return repo.save(repo.create({ ownerId, fullName, phone }));
  }

  async function createBooking(
    courtId: string,
    totalPrice: number,
    date: string,
    customer: { customerId?: string; customerContactId?: string },
  ): Promise<Booking> {
    const repo = dataSource.getRepository(Booking);
    return repo.save(
      repo.create({
        courtId,
        customerId: customer.customerId ?? null,
        customerContactId: customer.customerContactId ?? null,
        date,
        startTime: '08:00',
        endTime: '09:00',
        totalPrice,
        status: BookingStatus.CONFIRMED,
      }),
    );
  }

  async function payBooking(
    bookingId: string,
    paidAt: Date,
    status: PaymentStatus = PaymentStatus.PAID,
  ): Promise<Payment> {
    const repo = dataSource.getRepository(Payment);
    return repo.save(repo.create({ bookingId, status, paidAt }));
  }

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer())
      .get('/reports/revenue?from=2026-08-01&to=2026-08-10')
      .expect(401);
  });

  it('rejects a non-owner, non-staff user with 403', async () => {
    await createUser('customer@test.com', UserRole.CUSTOMER);
    const token = await loginAs('customer@test.com');

    await request(app.getHttpServer())
      .get('/reports/revenue?from=2026-08-01&to=2026-08-10')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects a malformed date and from > to with 400', async () => {
    await createUser('owner@test.com', UserRole.OWNER);
    const token = await loginAs('owner@test.com');

    await request(app.getHttpServer())
      .get('/reports/revenue?from=2026-08-10&to=08-2026-10')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/reports/revenue?from=2026-08-10&to=2026-08-01')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('returns 404 for a nonexistent venueId and 403 for a venueId owned by someone else', async () => {
    await createUser('owner1@test.com', UserRole.OWNER);
    const otherOwner = await createUser('owner2@test.com', UserRole.OWNER);
    const otherVenue = await createVenue(otherOwner.id, 'Other Venue');
    const token = await loginAs('owner1@test.com');

    await request(app.getHttpServer())
      .get(
        '/reports/revenue?from=2026-08-01&to=2026-08-10&venueId=00000000-0000-0000-0000-000000000000',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/reports/revenue?from=2026-08-01&to=2026-08-10&venueId=${otherVenue.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns an all-zero report when the owner has no venues', async () => {
    await createUser('empty-owner@test.com', UserRole.OWNER);
    const token = await loginAs('empty-owner@test.com');

    const response = await request(app.getHttpServer())
      .get('/reports/revenue?from=2026-08-01&to=2026-08-10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.currentPeriod).toEqual({
      revenue: 0,
      transactionCount: 0,
      avgPerTransaction: 0,
    });
    expect(response.body.previousPeriod).toEqual({ revenue: 0 });
    expect(response.body.changeAmount).toBe(0);
    expect(response.body.changePercent).toBeNull();
    expect(response.body.revenueByDay).toHaveLength(10);
    expect(response.body.revenueByDay.every((d: { revenue: number }) => d.revenue === 0)).toBe(
      true,
    );
    expect(response.body.transactions).toEqual([]);
  });

  it('aggregates current vs previous period, excludes refunded/unpaid/other-owner, and lists transactions in descending paidAt order', async () => {
    const owner = await createUser('owner1@test.com', UserRole.OWNER);
    const registeredCustomer = await createUser('customer@test.com', UserRole.CUSTOMER);
    const otherOwner = await createUser('owner2@test.com', UserRole.OWNER);

    const venue = await createVenue(owner.id, 'My Venue');
    const court = await createCourt(venue.id, 'Court 1');
    const contact = await createContact(owner.id, 'Trần Thị B', '0922222222');

    const otherVenue = await createVenue(otherOwner.id, 'Not Mine');
    const otherCourt = await createCourt(otherVenue.id, 'Other Court');

    // In current period [2026-08-01, 2026-08-10]
    const bookingA = await createBooking(court.id, 300000, '2026-08-05', {
      customerId: registeredCustomer.id,
    });
    const paymentA = await payBooking(bookingA.id, new Date(2026, 7, 5, 10, 0));

    const bookingB = await createBooking(court.id, 200000, '2026-08-01', {
      customerContactId: contact.id,
    });
    const paymentB = await payBooking(bookingB.id, new Date(2026, 7, 1, 0, 0, 1));

    const bookingI = await createBooking(court.id, 100000, '2026-08-10', {
      customerId: registeredCustomer.id,
    });
    const paymentI = await payBooking(bookingI.id, new Date(2026, 7, 10, 23, 30));

    // Just after the period — excluded
    const bookingH = await createBooking(court.id, 500000, '2026-08-11', {
      customerId: registeredCustomer.id,
    });
    await payBooking(bookingH.id, new Date(2026, 7, 11, 0, 0, 0));

    // Unpaid — excluded
    await createBooking(court.id, 400000, '2026-08-06', { customerId: registeredCustomer.id });

    // Refunded — excluded even though paidAt falls inside the period
    const bookingF = await createBooking(court.id, 700000, '2026-08-07', {
      customerId: registeredCustomer.id,
    });
    await payBooking(bookingF.id, new Date(2026, 7, 7, 12, 0), PaymentStatus.REFUNDED);

    // Other owner entirely — excluded by venue scoping
    const bookingG = await createBooking(otherCourt.id, 999999, '2026-08-05', {
      customerId: registeredCustomer.id,
    });
    await payBooking(bookingG.id, new Date(2026, 7, 5, 10, 0));

    // In the previous period [2026-07-22, 2026-07-31]
    const bookingC = await createBooking(court.id, 999999, '2026-07-31', {
      customerId: registeredCustomer.id,
    });
    await payBooking(bookingC.id, new Date(2026, 6, 31, 23, 59));

    const bookingD = await createBooking(court.id, 150000, '2026-07-25', {
      customerId: registeredCustomer.id,
    });
    await payBooking(bookingD.id, new Date(2026, 6, 25, 12, 0));

    const token = await loginAs('owner1@test.com');
    const response = await request(app.getHttpServer())
      .get('/reports/revenue?from=2026-08-01&to=2026-08-10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.currentPeriod).toEqual({
      revenue: 600000,
      transactionCount: 3,
      avgPerTransaction: 200000,
    });
    expect(response.body.previousPeriod).toEqual({ revenue: 1149999 });
    expect(response.body.changeAmount).toBe(600000 - 1149999);
    expect(response.body.changePercent).toBeCloseTo(-47.8, 1);

    expect(response.body.revenueByDay).toHaveLength(10);
    const byDate = Object.fromEntries(
      response.body.revenueByDay.map((d: { date: string; revenue: number }) => [d.date, d.revenue]),
    );
    expect(byDate['2026-08-01']).toBe(200000);
    expect(byDate['2026-08-05']).toBe(300000);
    expect(byDate['2026-08-10']).toBe(100000);
    expect(byDate['2026-08-06']).toBe(0);

    expect(response.body.transactions).toHaveLength(3);
    expect(response.body.transactions.map((t: { id: string }) => t.id)).toEqual([
      paymentI.id,
      paymentA.id,
      paymentB.id,
    ]);
    expect(response.body.transactions[2]).toMatchObject({
      transactionCode: `GD-${paymentB.id.slice(0, 8).toUpperCase()}`,
      customerName: 'Trần Thị B',
      customerPhone: '0922222222',
      amount: 200000,
      status: 'paid',
    });
    expect(response.body.transactions[1]).toMatchObject({
      customerName: registeredCustomer.fullName,
      customerPhone: registeredCustomer.phone,
      amount: 300000,
    });
  });

  it('scopes to a single venue when venueId is provided', async () => {
    const owner = await createUser('owner1@test.com', UserRole.OWNER);
    const customer = await createUser('customer@test.com', UserRole.CUSTOMER);

    const venueA = await createVenue(owner.id, 'Venue A');
    const courtA = await createCourt(venueA.id, 'Court A');
    const venueB = await createVenue(owner.id, 'Venue B');
    const courtB = await createCourt(venueB.id, 'Court B');

    const bookingA = await createBooking(courtA.id, 200000, '2026-08-05', {
      customerId: customer.id,
    });
    await payBooking(bookingA.id, new Date(2026, 7, 5, 10, 0));
    const bookingB = await createBooking(courtB.id, 500000, '2026-08-05', {
      customerId: customer.id,
    });
    await payBooking(bookingB.id, new Date(2026, 7, 5, 10, 0));

    const token = await loginAs('owner1@test.com');

    const allResponse = await request(app.getHttpServer())
      .get('/reports/revenue?from=2026-08-01&to=2026-08-10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(allResponse.body.currentPeriod.revenue).toBe(700000);

    const scopedResponse = await request(app.getHttpServer())
      .get(`/reports/revenue?from=2026-08-01&to=2026-08-10&venueId=${venueA.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(scopedResponse.body.currentPeriod.revenue).toBe(200000);
  });

  describe('GET /reports/revenue/export', () => {
    it('returns a CSV file with the same transactions as the JSON endpoint', async () => {
      const owner = await createUser('owner1@test.com', UserRole.OWNER);
      const customer = await createUser('customer@test.com', UserRole.CUSTOMER);
      const venue = await createVenue(owner.id, 'My Venue');
      const court = await createCourt(venue.id, 'Court 1');

      const booking = await createBooking(court.id, 250000, '2026-08-05', {
        customerId: customer.id,
      });
      const payment = await payBooking(booking.id, new Date(2026, 7, 5, 10, 30));

      const token = await loginAs('owner1@test.com');
      const response = await request(app.getHttpServer())
        .get('/reports/revenue/export?from=2026-08-01&to=2026-08-10')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain(
        'doanh-thu-2026-08-01-den-2026-08-10.csv',
      );

      const body = response.text;
      expect(body.startsWith('\uFEFFMã GD,Khách hàng,SĐT,Thời gian,Số tiền,Trạng thái')).toBe(
        true,
      );
      expect(body).toContain(`GD-${payment.id.slice(0, 8).toUpperCase()}`);
      expect(body).toContain('05/08/2026 10:30');
      expect(body).toContain('250000');
    });

    it('rejects unauthenticated access with 401', async () => {
      await request(app.getHttpServer())
        .get('/reports/revenue/export?from=2026-08-01&to=2026-08-10')
        .expect(401);
    });
  });
});
```

- [ ] **Step 2: Run the e2e suite**

Ensure the test Postgres database is running (same one the other `*.e2e-spec.ts` files use — check `apps/api/.env.test` for connection details; if it's not running, start it the same way you would for any other e2e run in this repo before continuing).

Run: `cd apps/api && npm run test:e2e -- reports-revenue.e2e-spec.ts`
Expected: initially may FAIL if anything above doesn't match Task 3's actual behavior — that's the point of running it now. Read every failure carefully.

- [ ] **Step 3: Fix any mismatches**

If a test fails, the bug is almost always in Task 3's `reports.service.ts` (query logic, boundary handling, or the join), not in the test — cross-check the failing assertion against the worked numbers in Task 4 Step 1 (they were hand-computed from the fixture data). Fix `reports.service.ts`, re-run.

- [ ] **Step 4: Run the full e2e suite to confirm no regressions**

Run: `cd apps/api && npm run test:e2e`
Expected: PASS — all suites, including the new `reports-revenue.e2e-spec.ts` and every pre-existing one.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/reports-revenue.e2e-spec.ts
git commit -m "test(api): add e2e coverage for GET /reports/revenue and /reports/revenue/export"
```

---

## Self-Review Notes

- **Spec coverage:** §3 endpoints (Task 3), §4 field definitions (Tasks 2–3, each formula has a dedicated unit test), §5 validation (Task 4: 401/403/404/400/empty-state tests), §6 out-of-scope items intentionally not built (pagination, payment-method filter, PDF/Excel). §0 reconciliation (amount source, OwnerScope tier) is threaded through Task 3's query joins and `@OwnerScope('operational')`.
- **Placeholder scan:** none — every step has runnable code and exact commands.
- **Type consistency:** `RevenueReport`/`RevenueReportTransaction` (Task 3) match the JSON shape asserted in Task 4's e2e tests field-for-field; `RevenueCsvRow` (Task 2) matches the object shape built in `getRevenueReportCsv` (Task 3).
