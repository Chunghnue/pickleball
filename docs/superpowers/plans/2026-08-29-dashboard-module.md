# Dashboard Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give venue owners a `GET /dashboard/summary` endpoint that aggregates today's bookings/revenue, court activity, new customers this month, a 30-day revenue trend, revenue-by-court breakdown, and the 10 most recent bookings — scoped to the owner's own venue(s), with an optional `?venueId=` filter.

**Architecture:** A new `DashboardModule` (`DashboardService` + `DashboardController`) computes everything real-time from the existing `Court`, `Booking`, `Payment` repositories plus raw joins to the `users` table — no new tables, no new ORM relations (this codebase has none; every join is a manual FK-column join in a `QueryBuilder`). Venue-ownership scoping reuses `VenuesService.findMineByOwner`/`getOwnedVenueOrThrow` from `CourtsModule`. The pure date-window helpers currently living in `apps/api/src/admin/admin-stats.utils.ts` are first extracted to `apps/api/src/common/` so both `AdminStatsService` and the new `DashboardService` can share them without one feature module depending on another.

**Tech Stack:** NestJS, TypeORM (`QueryBuilder`/`getRawMany` for `SUM`/`GROUP BY`, same pattern as `AdminStatsService`), Jest (`*.spec.ts` unit, `*.e2e-spec.ts` against real Postgres).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-25-dashboard-design.md`.
- No new DB tables/columns; everything computed real-time from existing entities.
- Revenue = `SUM(booking.total_price)` joined via `payment.booking_id = booking.id` where `payment.status = 'paid'` — **not** `payments.amount` (that column doesn't exist on `Payment`).
- No entity in this codebase declares TypeORM relations (`@ManyToOne` etc). Every `id` column is `uuid`, but every FK column (`court_id`, `venue_id`, `owner_id`, `customer_id`, `booking_id`) is plain `character varying` — so any raw SQL join between an entity's `id` and another table's FK column needs an explicit `::text` cast on the `id` side (e.g. `court.id::text = booking.court_id`), exactly as `admin-stats.service.ts:84` already does for `booking.id::text = payment.booking_id`.
- `dashboard/summary` guarded by `@Roles(UserRole.OWNER)`, same pattern as `VenuesController`.
- `venueId` query param: nonexistent → 404, exists but owned by another owner → 403 (reuse `VenuesService.getOwnedVenueOrThrow` unmodified — do not write a different ownership check).
- `revenueByCourt` includes every court in scope, even ones with 0 revenue.
- No walk-in/`customerContactId` handling — `bookings.customer_id` is `NOT NULL` and that column doesn't exist yet.
- No new npm dependencies.

---

## Task 1: Extract shared date-window helpers to `common/`

**Files:**
- Create: `apps/api/src/common/date-range.utils.ts`
- Create: `apps/api/src/common/date-range.utils.spec.ts`
- Modify: `apps/api/src/admin/admin-stats.service.ts`
- Delete: `apps/api/src/admin/admin-stats.utils.ts`
- Delete: `apps/api/src/admin/admin-stats.utils.spec.ts`

**Interfaces:**
- Produces: `getTodayRange(now?: Date): { start: Date; end: Date }`, `getCurrentMonthRange(now?: Date): { start: Date; end: Date }`, `getLast30Days(now?: Date): string[]` (oldest-first, `YYYY-MM-DD`), `fillRevenueByDay(rows: { date: string; revenue: string | number }[], days: string[]): { date: string; revenue: number }[]` — consumed by `AdminStatsService` (already) and by Task 2's `DashboardService`.

This is a pure move (identical logic, new location) so there's no red/green cycle — the existing tests already prove the logic correct. The steps below move the file, move its test, repoint the one caller, and prove nothing broke.

- [ ] **Step 1: Create the shared utils file**

Create `apps/api/src/common/date-range.utils.ts` with the exact current contents of `apps/api/src/admin/admin-stats.utils.ts`:

```ts
export interface DateRange {
  start: Date;
  end: Date;
}

export function getTodayRange(now: Date = new Date()): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export function getCurrentMonthRange(now: Date = new Date()): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLast30Days(now: Date = new Date()): string[] {
  const { start } = getTodayRange(now);
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    days.push(formatLocalDate(d));
  }
  return days;
}

export interface RevenueByDayRow {
  date: string;
  revenue: string | number;
}

export function fillRevenueByDay(
  rows: RevenueByDayRow[],
  days: string[],
): { date: string; revenue: number }[] {
  const revenueByDate = new Map(rows.map((r) => [r.date, Number(r.revenue)]));
  return days.map((date) => ({ date, revenue: revenueByDate.get(date) ?? 0 }));
}
```

- [ ] **Step 2: Create the moved test file**

Create `apps/api/src/common/date-range.utils.spec.ts` with the exact current contents of `apps/api/src/admin/admin-stats.utils.spec.ts`, only changing the import path:

```ts
import {
  getTodayRange,
  getCurrentMonthRange,
  getLast30Days,
  fillRevenueByDay,
} from './date-range.utils';

describe('getTodayRange', () => {
  it('returns [start of day, start of next day)', () => {
    const now = new Date('2026-08-26T15:30:00');
    const { start, end } = getTodayRange(now);

    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(26);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(7);
    expect(end.getDate()).toBe(27);
  });

  it('rolls over to the next month at a month boundary', () => {
    const now = new Date('2026-08-31T23:59:59');
    const { end } = getTodayRange(now);

    expect(end.getMonth()).toBe(8);
    expect(end.getDate()).toBe(1);
  });
});

describe('getCurrentMonthRange', () => {
  it('returns [1st of month, 1st of next month)', () => {
    const now = new Date('2026-08-15T10:00:00');
    const { start, end } = getCurrentMonthRange(now);

    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(7);
    expect(start.getHours()).toBe(0);
    expect(end.getDate()).toBe(1);
    expect(end.getMonth()).toBe(8);
  });

  it('rolls over to next year in December', () => {
    const now = new Date('2026-12-10T10:00:00');
    const { end } = getCurrentMonthRange(now);

    expect(end.getFullYear()).toBe(2027);
    expect(end.getMonth()).toBe(0);
    expect(end.getDate()).toBe(1);
  });
});

describe('getLast30Days', () => {
  it('returns exactly 30 date strings, oldest first, ending with today', () => {
    const now = new Date('2026-08-26T12:00:00');
    const days = getLast30Days(now);

    expect(days).toHaveLength(30);
    expect(days[29]).toBe('2026-08-26');
    expect(days[0]).toBe('2026-07-28');
  });

  it('has no gaps or duplicates between consecutive days', () => {
    const now = new Date('2026-08-26T12:00:00');
    const days = getLast30Days(now);
    const uniqueDays = new Set(days);

    expect(uniqueDays.size).toBe(30);
  });
});

describe('fillRevenueByDay', () => {
  it('fills missing days with revenue 0, in the given day order', () => {
    const days = ['2026-08-24', '2026-08-25', '2026-08-26'];
    const rows = [{ date: '2026-08-25', revenue: '3200000.00' }];

    const result = fillRevenueByDay(rows, days);

    expect(result).toEqual([
      { date: '2026-08-24', revenue: 0 },
      { date: '2026-08-25', revenue: 3200000 },
      { date: '2026-08-26', revenue: 0 },
    ]);
  });

  it('converts numeric-string revenue to a number', () => {
    const result = fillRevenueByDay(
      [{ date: '2026-08-26', revenue: 150000 }],
      ['2026-08-26'],
    );

    expect(result[0].revenue).toBe(150000);
    expect(typeof result[0].revenue).toBe('number');
  });
});
```

- [ ] **Step 3: Run the moved test to verify it passes**

Run (from `apps/api`): `npm test -- date-range.utils.spec.ts`
Expected: PASS (10 tests).

- [ ] **Step 4: Delete the old files and repoint the one caller**

Delete `apps/api/src/admin/admin-stats.utils.ts` and `apps/api/src/admin/admin-stats.utils.spec.ts`.

In `apps/api/src/admin/admin-stats.service.ts`, change:

```ts
import {
  fillRevenueByDay,
  getCurrentMonthRange,
  getLast30Days,
  getTodayRange,
} from './admin-stats.utils';
```

to:

```ts
import {
  fillRevenueByDay,
  getCurrentMonthRange,
  getLast30Days,
  getTodayRange,
} from '../common/date-range.utils';
```

- [ ] **Step 5: Run the full backend test suite**

Run: `npm test && npm run test:e2e`
Expected: PASS (all suites — confirms `AdminStatsService` still works against the moved helpers, and no stray reference to the deleted files remains).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/common/date-range.utils.ts apps/api/src/common/date-range.utils.spec.ts apps/api/src/admin/admin-stats.service.ts apps/api/src/admin/admin-stats.utils.ts apps/api/src/admin/admin-stats.utils.spec.ts
git commit -m "refactor(api): move date-window helpers from admin/ to common/ so Dashboard can reuse them"
```

---

## Task 2: `GET /dashboard/summary` endpoint

**Files:**
- Create: `apps/api/src/dashboard/dashboard.service.ts`
- Create: `apps/api/src/dashboard/dashboard.controller.ts`
- Create: `apps/api/src/dashboard/dashboard.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/dashboard.e2e-spec.ts`

**Interfaces:**
- Consumes: `getTodayRange`, `getCurrentMonthRange`, `getLast30Days`, `fillRevenueByDay` (Task 1); `VenuesService.findMineByOwner(ownerId: string): Promise<Venue[]>` and `VenuesService.getOwnedVenueOrThrow(ownerId: string, venueId: string): Promise<Venue>` (existing, exported by `CourtsModule`).
- Produces: `DashboardService.getSummary(ownerId: string, venueId?: string): Promise<DashboardSummary>` and `GET /dashboard/summary?venueId=` (owner-only) — this is the final consumer-facing artifact for this plan; the frontend page is a separate, later spec/plan per the design doc §8.

- [ ] **Step 1: Write the failing e2e test**

Create `apps/api/test/dashboard.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court } from '../src/courts/entities/court.entity';
import { Booking, BookingStatus } from '../src/bookings/entities/booking.entity';
import { Payment, PaymentStatus } from '../src/payments/entities/payment.entity';

describe('Owner dashboard summary (e2e)', () => {
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

  async function createUser(
    email: string,
    role: UserRole,
    status: UserStatus = UserStatus.ACTIVE,
  ): Promise<User> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const repo = dataSource.getRepository(User);
    return repo.save(
      repo.create({
        email,
        passwordHash,
        fullName: `User ${email}`,
        phone: '0900000000',
        role,
        status,
        emailVerified: true,
      }),
    );
  }

  async function loginAs(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' });
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

  async function createCourt(
    venueId: string,
    name: string,
    isActive = true,
  ): Promise<Court> {
    const repo = dataSource.getRepository(Court);
    return repo.save(
      repo.create({
        venueId,
        name,
        pricePerHour: 100000,
        openTime: '08:00',
        closeTime: '20:00',
        slotDurationMinutes: 60,
        isActive,
      }),
    );
  }

  async function createBooking(
    courtId: string,
    customerId: string,
    totalPrice: number,
  ): Promise<Booking> {
    const repo = dataSource.getRepository(Booking);
    return repo.save(
      repo.create({
        courtId,
        customerId,
        date: '2026-08-29',
        startTime: '08:00',
        endTime: '09:00',
        totalPrice,
        status: BookingStatus.CONFIRMED,
      }),
    );
  }

  async function payBooking(bookingId: string): Promise<Payment> {
    const repo = dataSource.getRepository(Payment);
    return repo.save(
      repo.create({
        bookingId,
        status: PaymentStatus.PAID,
        paidAt: new Date(),
      }),
    );
  }

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer()).get('/dashboard/summary').expect(401);
  });

  it('rejects a non-owner active user with 403', async () => {
    await createUser('customer@test.com', UserRole.CUSTOMER);
    const token = await loginAs('customer@test.com');

    await request(app.getHttpServer())
      .get('/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns an all-zero summary when the owner has no venues', async () => {
    await createUser('empty-owner@test.com', UserRole.OWNER);
    const token = await loginAs('empty-owner@test.com');

    const response = await request(app.getHttpServer())
      .get('/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.todayBookingsCount).toBe(0);
    expect(response.body.todayRevenue).toBe(0);
    expect(response.body.courts).toEqual({ active: 0, total: 0 });
    expect(response.body.newCustomersThisMonth).toBe(0);
    expect(response.body.revenueByDay).toHaveLength(30);
    expect(response.body.revenueByDay.every((d: { revenue: number }) => d.revenue === 0)).toBe(true);
    expect(response.body.revenueByCourt).toEqual([]);
    expect(response.body.recentBookings).toEqual([]);
  });

  it('returns 404 for a nonexistent venueId and 403 for a venueId owned by someone else', async () => {
    await createUser('owner1@test.com', UserRole.OWNER);
    const otherOwner = await createUser('owner2@test.com', UserRole.OWNER);
    const otherVenue = await createVenue(otherOwner.id, 'Other Venue');
    const token = await loginAs('owner1@test.com');

    await request(app.getHttpServer())
      .get('/dashboard/summary?venueId=00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/dashboard/summary?venueId=${otherVenue.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('aggregates bookings, revenue, courts, new customers, revenue-by-court and recent bookings scoped to the owner\'s own venues', async () => {
    const owner = await createUser('owner1@test.com', UserRole.OWNER);
    const otherOwner = await createUser('owner2@test.com', UserRole.OWNER);
    const customer = await createUser('customer@test.com', UserRole.CUSTOMER);

    const venue = await createVenue(owner.id, 'My Venue');
    const courtWithRevenue = await createCourt(venue.id, 'Court 1', true);
    const courtNoRevenue = await createCourt(venue.id, 'Court 2', false);

    const otherVenue = await createVenue(otherOwner.id, 'Not Mine');
    const otherCourt = await createCourt(otherVenue.id, 'Other Court', true);

    const paidBooking = await createBooking(courtWithRevenue.id, customer.id, 300000);
    await payBooking(paidBooking.id);
    await createBooking(courtWithRevenue.id, customer.id, 150000);

    const otherBooking = await createBooking(otherCourt.id, customer.id, 999999);
    await payBooking(otherBooking.id);

    const token = await loginAs('owner1@test.com');
    const response = await request(app.getHttpServer())
      .get('/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.todayBookingsCount).toBe(2);
    expect(response.body.todayRevenue).toBe(300000);
    expect(response.body.courts).toEqual({ active: 1, total: 2 });
    expect(response.body.newCustomersThisMonth).toBe(1);

    expect(response.body.revenueByDay).toHaveLength(30);
    const revenueSum = response.body.revenueByDay.reduce(
      (sum: number, day: { revenue: number }) => sum + day.revenue,
      0,
    );
    expect(revenueSum).toBe(300000);

    expect(response.body.revenueByCourt).toEqual(
      expect.arrayContaining([
        { courtId: courtWithRevenue.id, courtName: 'Court 1', revenue: 300000 },
        { courtId: courtNoRevenue.id, courtName: 'Court 2', revenue: 0 },
      ]),
    );
    expect(response.body.revenueByCourt).toHaveLength(2);

    expect(response.body.recentBookings).toHaveLength(2);
    const recent = response.body.recentBookings[0];
    expect(recent).toMatchObject({
      customerName: customer.fullName,
      customerPhone: customer.phone,
      courtName: 'Court 1',
      date: '2026-08-29',
      startTime: '08:00',
      endTime: '09:00',
      status: 'confirmed',
    });
    expect([300000, 150000]).toContain(recent.totalPrice);
  });

  it('filters to a single venue when venueId is provided, for an owner with multiple venues', async () => {
    const owner = await createUser('owner1@test.com', UserRole.OWNER);
    const customer = await createUser('customer@test.com', UserRole.CUSTOMER);

    const venueA = await createVenue(owner.id, 'Venue A');
    const courtA = await createCourt(venueA.id, 'Court A', true);
    const venueB = await createVenue(owner.id, 'Venue B');
    const courtB = await createCourt(venueB.id, 'Court B', true);

    const bookingA = await createBooking(courtA.id, customer.id, 200000);
    await payBooking(bookingA.id);
    const bookingB = await createBooking(courtB.id, customer.id, 500000);
    await payBooking(bookingB.id);

    const token = await loginAs('owner1@test.com');

    const allResponse = await request(app.getHttpServer())
      .get('/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(allResponse.body.todayRevenue).toBe(700000);
    expect(allResponse.body.courts).toEqual({ active: 2, total: 2 });

    const scopedResponse = await request(app.getHttpServer())
      .get(`/dashboard/summary?venueId=${venueA.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(scopedResponse.body.todayRevenue).toBe(200000);
    expect(scopedResponse.body.courts).toEqual({ active: 1, total: 1 });
    expect(scopedResponse.body.revenueByCourt).toEqual([
      { courtId: courtA.id, courtName: 'Court A', revenue: 200000 },
    ]);
  });
});
```

- [ ] **Step 2: Run the e2e test to verify it fails**

Run (from `apps/api`): `npm run test:e2e -- dashboard.e2e-spec.ts`
Expected: FAIL — `404 Not Found` for `GET /dashboard/summary` (route doesn't exist yet).

- [ ] **Step 3: Implement `DashboardService`**

Create `apps/api/src/dashboard/dashboard.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { And, In, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { Court } from '../courts/entities/court.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { VenuesService } from '../courts/venues.service';
import {
  fillRevenueByDay,
  getCurrentMonthRange,
  getLast30Days,
  getTodayRange,
} from '../common/date-range.utils';

export interface DashboardSummary {
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
    status: string;
  }[];
}

interface RecentBookingRow {
  id: string;
  courtId: string;
  customerName: string;
  customerPhone: string | null;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: string;
  status: string;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly venuesService: VenuesService,
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
  ) {}

  async getSummary(ownerId: string, venueId?: string): Promise<DashboardSummary> {
    const venueIds = venueId
      ? [(await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId)).id]
      : (await this.venuesService.findMineByOwner(ownerId)).map((v) => v.id);

    if (venueIds.length === 0) {
      return this.emptySummary();
    }

    const courts = await this.courtsRepository.find({
      where: { venueId: In(venueIds) },
    });
    const courtIds = courts.map((court) => court.id);

    if (courtIds.length === 0) {
      return this.emptySummary();
    }

    const now = new Date();
    const { start: todayStart, end: todayEnd } = getTodayRange(now);
    const { start: monthStart, end: monthEnd } = getCurrentMonthRange(now);
    const last30Days = getLast30Days(now);
    const rangeStart = new Date(todayStart);
    rangeStart.setDate(rangeStart.getDate() - 29);

    const [todayBookingsCount, revenueRows, newCustomerRows, revenueByCourtRows, recentBookingsRows] =
      await Promise.all([
        this.bookingsRepository.count({
          where: {
            courtId: In(courtIds),
            createdAt: And(MoreThanOrEqual(todayStart), LessThan(todayEnd)),
          },
        }),
        this.paymentsRepository
          .createQueryBuilder('payment')
          .innerJoin('bookings', 'booking', 'booking.id::text = payment.booking_id')
          .select("TO_CHAR(payment.paid_at, 'YYYY-MM-DD')", 'date')
          .addSelect('SUM(booking.total_price)', 'revenue')
          .where('booking.court_id IN (:...courtIds)', { courtIds })
          .andWhere('payment.status = :status', { status: PaymentStatus.PAID })
          .andWhere('payment.paid_at >= :from', { from: rangeStart })
          .andWhere('payment.paid_at < :to', { to: todayEnd })
          .groupBy("TO_CHAR(payment.paid_at, 'YYYY-MM-DD')")
          .getRawMany<{ date: string; revenue: string }>(),
        this.bookingsRepository
          .createQueryBuilder('booking')
          .select('booking.customer_id', 'customerId')
          .addSelect('MIN(booking.created_at)', 'firstBookingAt')
          .where('booking.court_id IN (:...courtIds)', { courtIds })
          .groupBy('booking.customer_id')
          .having('MIN(booking.created_at) >= :start', { start: monthStart })
          .andHaving('MIN(booking.created_at) < :end', { end: monthEnd })
          .getRawMany(),
        this.paymentsRepository
          .createQueryBuilder('payment')
          .innerJoin('bookings', 'booking', 'booking.id::text = payment.booking_id')
          .select('booking.court_id', 'courtId')
          .addSelect('SUM(booking.total_price)', 'revenue')
          .where('booking.court_id IN (:...courtIds)', { courtIds })
          .andWhere('payment.status = :status', { status: PaymentStatus.PAID })
          .groupBy('booking.court_id')
          .getRawMany<{ courtId: string; revenue: string }>(),
        this.bookingsRepository
          .createQueryBuilder('booking')
          .innerJoin('users', 'customer', 'customer.id::text = booking.customer_id')
          .select('booking.id', 'id')
          .addSelect('booking.court_id', 'courtId')
          .addSelect('customer.full_name', 'customerName')
          .addSelect('customer.phone', 'customerPhone')
          .addSelect("TO_CHAR(booking.date, 'YYYY-MM-DD')", 'date')
          .addSelect('booking.start_time', 'startTime')
          .addSelect('booking.end_time', 'endTime')
          .addSelect('booking.total_price', 'totalPrice')
          .addSelect('booking.status', 'status')
          .where('booking.court_id IN (:...courtIds)', { courtIds })
          .orderBy('booking.created_at', 'DESC')
          .limit(10)
          .getRawMany<RecentBookingRow>(),
      ]);

    const revenueByDay = fillRevenueByDay(revenueRows, last30Days);
    const todayRevenue = revenueByDay[revenueByDay.length - 1].revenue;

    const revenueByCourtMap = new Map(
      revenueByCourtRows.map((row) => [row.courtId, Number(row.revenue)]),
    );
    const revenueByCourt = courts
      .map((court) => ({
        courtId: court.id,
        courtName: court.name,
        revenue: revenueByCourtMap.get(court.id) ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const courtNameById = new Map(courts.map((court) => [court.id, court.name]));
    const recentBookings = recentBookingsRows.map((row) => ({
      id: row.id,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      courtName: courtNameById.get(row.courtId) ?? '',
      date: row.date,
      startTime: row.startTime.slice(0, 5),
      endTime: row.endTime.slice(0, 5),
      totalPrice: Number(row.totalPrice),
      status: row.status,
    }));

    return {
      todayBookingsCount,
      todayRevenue,
      courts: {
        active: courts.filter((court) => court.isActive).length,
        total: courts.length,
      },
      newCustomersThisMonth: newCustomerRows.length,
      revenueByDay,
      revenueByCourt,
      recentBookings,
    };
  }

  private emptySummary(): DashboardSummary {
    return {
      todayBookingsCount: 0,
      todayRevenue: 0,
      courts: { active: 0, total: 0 },
      newCustomersThisMonth: 0,
      revenueByDay: getLast30Days().map((date) => ({ date, revenue: 0 })),
      revenueByCourt: [],
      recentBookings: [],
    };
  }
}
```

- [ ] **Step 4: Implement `DashboardController`**

Create `apps/api/src/dashboard/dashboard.controller.ts`:

```ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('venueId') venueId?: string,
  ) {
    return this.dashboardService.getSummary(user.userId, venueId);
  }
}
```

- [ ] **Step 5: Create `DashboardModule` and register it**

Create `apps/api/src/dashboard/dashboard.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourtsModule } from '../courts/courts.module';
import { Court } from '../courts/entities/court.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Payment } from '../payments/entities/payment.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [CourtsModule, TypeOrmModule.forFeature([Court, Booking, Payment])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
```

`CourtsModule` is imported for its exported `VenuesService`; `Court`/`Booking`/`Payment` are registered directly here for `DashboardService`'s own `@InjectRepository` use, the same way `AdminModule` independently registers these same entities for `AdminStatsService` — TypeORM allows `forFeature` registration of the same entity in multiple modules.

In `apps/api/src/app.module.ts`, add the import:

```ts
import { DashboardModule } from './dashboard/dashboard.module';
```

and add `DashboardModule` to the `imports` array (after `PaymentsModule`):

```ts
    PaymentsModule,
    DashboardModule,
    NotificationsModule,
```

- [ ] **Step 6: Run the e2e test to verify it passes**

Run (from `apps/api`): `npm run test:e2e -- dashboard.e2e-spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Run the full backend test suite**

Run: `npm test && npm run test:e2e`
Expected: PASS (all suites — confirms the new `DashboardModule` registration and the Task 1 refactor didn't break anything elsewhere).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/dashboard apps/api/src/app.module.ts apps/api/test/dashboard.e2e-spec.ts
git commit -m "feat(api): add GET /dashboard/summary owner dashboard endpoint"
```

---

## Self-Review Notes

- **Spec coverage:** §3 endpoint + response shape (Task 2 controller/service), §4 all 7 metric definitions incl. the corrected `booking.total_price`-not-`payments.amount` revenue source and the dropped walk-in branch (Task 2 service), §5 query approach — no ORM relations, reuse of `AdminStatsService`'s `QueryBuilder`/`getRawMany` pattern, venue-scoped `WHERE` from the first join (Task 2), §6 validation — 403 for non-owner role, 404/403 split for `venueId` ownership, zero-summary for an owner with no venues (all covered by Task 2's e2e test), §7 testing — unit coverage for the date/fill helpers (Task 1), e2e coverage for boundaries and aggregation (Task 2). §8 out-of-scope items (sport-type chart, branch-selector UI, caching, configurable date range, frontend, quick-actions/greeting) are correctly absent from both tasks.
- **Type consistency:** `DashboardSummary` (Task 2 service) fields match the e2e assertions exactly (`todayBookingsCount`, `todayRevenue`, `courts.active`/`courts.total`, `newCustomersThisMonth`, `revenueByDay`, `revenueByCourt`, `recentBookings`). `RecentBookingRow` (service-internal, Task 2) matches the raw `getRawMany` select list one-for-one. `fillRevenueByDay`/`getTodayRange`/`getCurrentMonthRange`/`getLast30Days` signatures (Task 1) match exactly how Task 2 calls them.
- **Placeholder scan:** no TBD/TODO; every step has runnable code, exact commands, and expected output.
