# Admin Platform Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give platform admins a `GET /admin/stats` endpoint and an `/admin/stats` page showing platform-wide counts (owners/venues/courts by status), today's bookings/revenue, new customers this month, and a 30-day revenue trend — computed across the whole system, no owner/venue scoping.

**Architecture:** A new `AdminStatsService` in the existing `admin` module computes all figures directly from the `User`, `Venue`, `Court`, `Booking`, `Payment` repositories (TypeORM `count()` for simple tallies, `QueryBuilder` for the `SUM`/`GROUP BY` revenue and new-customer queries). Pure date-window/day-filling logic is extracted into a separate `admin-stats.utils.ts` so it's unit-testable without mocking a `QueryBuilder` chain — the DB-touching parts are verified by one e2e test against a real Postgres fixture. Frontend adds a proxy route and a second `/admin/stats` page (plain CSS bar chart, no new chart-library dependency — the platform has none today and one 30-day bar chart doesn't justify adding one).

**Tech Stack:** NestJS, TypeORM (`QueryBuilder` for aggregation — first use of this pattern in the codebase; existing modules only use `find`/`findOne`/`save`/`count`), Jest (`*.spec.ts` unit, `*.e2e-spec.ts` against real Postgres), Next.js App Router BFF proxy pattern.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-26-admin-platform-stats-design.md`.
- No new DB tables/columns; everything computed real-time from existing entities.
- Revenue = `SUM(booking.total_price)` joined via `payment.booking_id = booking.id` where `payment.status = 'paid'` — **not** `payments.amount` (that column doesn't exist on `Payment`).
- `admin/stats` guarded by `@Roles(UserRole.ADMIN)`, same pattern as every other admin controller.
- No new npm dependencies (chart rendered as plain CSS bars).

---

## Task 1: Pure date/aggregation helpers

**Files:**
- Create: `apps/api/src/admin/admin-stats.utils.ts`
- Test: `apps/api/src/admin/admin-stats.utils.spec.ts`

**Interfaces:**
- Produces: `getTodayRange(now?: Date): { start: Date; end: Date }`, `getCurrentMonthRange(now?: Date): { start: Date; end: Date }`, `getLast30Days(now?: Date): string[]` (oldest-first, `YYYY-MM-DD`), `fillRevenueByDay(rows: { date: string; revenue: string | number }[], days: string[]): { date: string; revenue: number }[]` — all consumed by Task 2 (`AdminStatsService`).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/admin/admin-stats.utils.spec.ts`:

```ts
import {
  getTodayRange,
  getCurrentMonthRange,
  getLast30Days,
  fillRevenueByDay,
} from './admin-stats.utils';

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

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/api`): `npm test -- admin-stats.utils.spec.ts`
Expected: FAIL — `Cannot find module './admin-stats.utils'`.

- [ ] **Step 3: Implement the helpers**

Create `apps/api/src/admin/admin-stats.utils.ts`:

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

export function getLast30Days(now: Date = new Date()): string[] {
  const { start } = getTodayRange(now);
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- admin-stats.utils.spec.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/admin/admin-stats.utils.ts apps/api/src/admin/admin-stats.utils.spec.ts
git commit -m "feat(admin): add pure date-window helpers for platform stats"
```

---

## Task 2: `GET /admin/stats` endpoint

**Files:**
- Create: `apps/api/src/admin/admin-stats.service.ts`
- Create: `apps/api/src/admin/admin-stats.controller.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Create: `apps/api/test/admin-stats.e2e-spec.ts`

**Interfaces:**
- Consumes: `getTodayRange`, `getCurrentMonthRange`, `getLast30Days`, `fillRevenueByDay` (Task 1).
- Produces: `AdminStatsService.getStats(): Promise<AdminStats>` where
  ```ts
  interface AdminStats {
    owners: { total: number; active: number; pendingApproval: number };
    venues: { total: number; active: number; pendingApproval: number };
    courts: { total: number; active: number };
    todayBookingsCount: number;
    todayRevenue: number;
    newCustomersThisMonth: number;
    revenueByDay: { date: string; revenue: number }[];
  }
  ```
  and `GET /admin/stats` (admin-only) — consumed by Task 3 (frontend proxy route).

- [ ] **Step 1: Write the failing e2e test**

Create `apps/api/test/admin-stats.e2e-spec.ts`:

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

describe('Admin platform stats (e2e)', () => {
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
    status: UserStatus,
  ): Promise<User> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const repo = dataSource.getRepository(User);
    return repo.save(
      repo.create({
        email,
        passwordHash,
        fullName: `User ${email}`,
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

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer()).get('/admin/stats').expect(401);
  });

  it('rejects a non-admin active user with 403', async () => {
    await createUser('owner1@test.com', UserRole.OWNER, UserStatus.ACTIVE);
    const token = await loginAs('owner1@test.com');

    await request(app.getHttpServer())
      .get('/admin/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('aggregates counts and revenue across the whole platform', async () => {
    await createUser('admin@test.com', UserRole.ADMIN, UserStatus.ACTIVE);
    const activeOwner = await createUser(
      'active-owner@test.com',
      UserRole.OWNER,
      UserStatus.ACTIVE,
    );
    await createUser(
      'pending-owner@test.com',
      UserRole.OWNER,
      UserStatus.PENDING_APPROVAL,
    );
    const customer = await createUser(
      'customer@test.com',
      UserRole.CUSTOMER,
      UserStatus.ACTIVE,
    );

    const venuesRepo = dataSource.getRepository(Venue);
    const activeVenue = await venuesRepo.save(
      venuesRepo.create({
        ownerId: activeOwner.id,
        name: 'Active Venue',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
      }),
    );
    await venuesRepo.save(
      venuesRepo.create({
        ownerId: activeOwner.id,
        name: 'Pending Venue',
        address: '456 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.PENDING_APPROVAL,
      }),
    );

    const courtsRepo = dataSource.getRepository(Court);
    const activeCourt = await courtsRepo.save(
      courtsRepo.create({
        venueId: activeVenue.id,
        name: 'Court 1',
        pricePerHour: 100000,
        openTime: '08:00',
        closeTime: '20:00',
        slotDurationMinutes: 60,
        isActive: true,
      }),
    );
    await courtsRepo.save(
      courtsRepo.create({
        venueId: activeVenue.id,
        name: 'Court 2',
        pricePerHour: 100000,
        openTime: '08:00',
        closeTime: '20:00',
        slotDurationMinutes: 60,
        isActive: false,
      }),
    );

    const bookingsRepo = dataSource.getRepository(Booking);
    const paymentsRepo = dataSource.getRepository(Payment);

    const paidBookingToday = await bookingsRepo.save(
      bookingsRepo.create({
        courtId: activeCourt.id,
        customerId: customer.id,
        date: '2026-08-26',
        startTime: '08:00',
        endTime: '09:00',
        totalPrice: 300000,
        status: BookingStatus.CONFIRMED,
      }),
    );
    await paymentsRepo.save(
      paymentsRepo.create({
        bookingId: paidBookingToday.id,
        status: PaymentStatus.PAID,
        paidAt: new Date(),
      }),
    );

    await bookingsRepo.save(
      bookingsRepo.create({
        courtId: activeCourt.id,
        customerId: customer.id,
        date: '2026-08-26',
        startTime: '10:00',
        endTime: '11:00',
        totalPrice: 150000,
        status: BookingStatus.CONFIRMED,
      }),
    );

    const adminToken = await loginAs('admin@test.com');
    const response = await request(app.getHttpServer())
      .get('/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.owners).toEqual({
      total: 2,
      active: 1,
      pendingApproval: 1,
    });
    expect(response.body.venues).toEqual({
      total: 2,
      active: 1,
      pendingApproval: 1,
    });
    expect(response.body.courts).toEqual({ total: 2, active: 1 });
    expect(response.body.todayBookingsCount).toBe(2);
    expect(response.body.todayRevenue).toBe(300000);
    expect(response.body.newCustomersThisMonth).toBe(1);
    expect(response.body.revenueByDay).toHaveLength(30);

    const revenueSum = response.body.revenueByDay.reduce(
      (sum: number, day: { revenue: number }) => sum + day.revenue,
      0,
    );
    expect(revenueSum).toBe(300000);
  });
});
```

- [ ] **Step 2: Run the e2e test to verify it fails**

Run (from `apps/api`): `npm run test:e2e -- admin-stats.e2e-spec.ts`
Expected: FAIL — `404 Not Found` for `GET /admin/stats` (route doesn't exist yet).

- [ ] **Step 3: Implement `AdminStatsService`**

Create `apps/api/src/admin/admin-stats.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { And, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { Venue, VenueStatus } from '../courts/entities/venue.entity';
import { Court } from '../courts/entities/court.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import {
  fillRevenueByDay,
  getCurrentMonthRange,
  getLast30Days,
  getTodayRange,
} from './admin-stats.utils';

export interface AdminStats {
  owners: { total: number; active: number; pendingApproval: number };
  venues: { total: number; active: number; pendingApproval: number };
  courts: { total: number; active: number };
  todayBookingsCount: number;
  todayRevenue: number;
  newCustomersThisMonth: number;
  revenueByDay: { date: string; revenue: number }[];
}

@Injectable()
export class AdminStatsService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Venue)
    private readonly venuesRepository: Repository<Venue>,
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
  ) {}

  async getStats(): Promise<AdminStats> {
    const now = new Date();
    const { start: todayStart, end: todayEnd } = getTodayRange(now);
    const { start: monthStart, end: monthEnd } = getCurrentMonthRange(now);
    const last30Days = getLast30Days(now);
    const rangeStart = new Date(todayStart);
    rangeStart.setDate(rangeStart.getDate() - 29);

    const [
      ownersTotal,
      ownersActive,
      ownersPending,
      venuesTotal,
      venuesActive,
      venuesPending,
      courtsTotal,
      courtsActive,
      todayBookingsCount,
      revenueRows,
      newCustomerRows,
    ] = await Promise.all([
      this.usersRepository.count({ where: { role: UserRole.OWNER } }),
      this.usersRepository.count({
        where: { role: UserRole.OWNER, status: UserStatus.ACTIVE },
      }),
      this.usersRepository.count({
        where: { role: UserRole.OWNER, status: UserStatus.PENDING_APPROVAL },
      }),
      this.venuesRepository.count(),
      this.venuesRepository.count({ where: { status: VenueStatus.ACTIVE } }),
      this.venuesRepository.count({
        where: { status: VenueStatus.PENDING_APPROVAL },
      }),
      this.courtsRepository.count(),
      this.courtsRepository.count({ where: { isActive: true } }),
      this.bookingsRepository.count({
        where: { createdAt: And(MoreThanOrEqual(todayStart), LessThan(todayEnd)) },
      }),
      this.paymentsRepository
        .createQueryBuilder('payment')
        .innerJoin('bookings', 'booking', 'booking.id = payment.booking_id')
        .select("TO_CHAR(payment.paid_at, 'YYYY-MM-DD')", 'date')
        .addSelect('SUM(booking.total_price)', 'revenue')
        .where('payment.status = :status', { status: PaymentStatus.PAID })
        .andWhere('payment.paid_at >= :from', { from: rangeStart })
        .andWhere('payment.paid_at < :to', { to: todayEnd })
        .groupBy("TO_CHAR(payment.paid_at, 'YYYY-MM-DD')")
        .getRawMany<{ date: string; revenue: string }>(),
      this.bookingsRepository
        .createQueryBuilder('booking')
        .select('booking.customer_id', 'customerId')
        .addSelect('MIN(booking.created_at)', 'firstBookingAt')
        .groupBy('booking.customer_id')
        .having('MIN(booking.created_at) >= :start', { start: monthStart })
        .andHaving('MIN(booking.created_at) < :end', { end: monthEnd })
        .getRawMany(),
    ]);

    const revenueByDay = fillRevenueByDay(revenueRows, last30Days);
    const todayRevenue = revenueByDay[revenueByDay.length - 1].revenue;

    return {
      owners: { total: ownersTotal, active: ownersActive, pendingApproval: ownersPending },
      venues: { total: venuesTotal, active: venuesActive, pendingApproval: venuesPending },
      courts: { total: courtsTotal, active: courtsActive },
      todayBookingsCount,
      todayRevenue,
      newCustomersThisMonth: newCustomerRows.length,
      revenueByDay,
    };
  }
}
```

- [ ] **Step 4: Implement `AdminStatsController`**

Create `apps/api/src/admin/admin-stats.controller.ts`:

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { AdminStatsService } from './admin-stats.service';

@Controller('admin/stats')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminStatsController {
  constructor(private readonly adminStatsService: AdminStatsService) {}

  @Get()
  getStats() {
    return this.adminStatsService.getStats();
  }
}
```

- [ ] **Step 5: Wire it into `AdminModule`**

Replace the contents of `apps/api/src/admin/admin.module.ts` with:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { CourtsModule } from '../courts/courts.module';
import { User } from '../users/entities/user.entity';
import { Venue } from '../courts/entities/venue.entity';
import { Court } from '../courts/entities/court.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Payment } from '../payments/entities/payment.entity';
import { AdminController } from './admin.controller';
import { AdminVenuesController } from './admin-venues.controller';
import { AdminApprovalsController } from './admin-approvals.controller';
import { AdminApprovalsService } from './admin-approvals.service';
import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsService } from './admin-stats.service';

@Module({
  imports: [
    UsersModule,
    CourtsModule,
    TypeOrmModule.forFeature([User, Venue, Court, Booking, Payment]),
  ],
  controllers: [
    AdminController,
    AdminVenuesController,
    AdminApprovalsController,
    AdminStatsController,
  ],
  providers: [AdminApprovalsService, AdminStatsService],
})
export class AdminModule {}
```

This registers `User`, `Venue`, `Court`, `Booking`, `Payment` repositories directly in `AdminModule` for `AdminStatsService`'s `@InjectRepository` use — `UsersModule`/`CourtsModule` only export their `*Service` classes (not raw repositories), and `BookingsModule`/`PaymentsModule` aren't imported at all here. NestJS/TypeORM allows the same entity to be registered via `forFeature` in multiple modules simultaneously, so this doesn't conflict with `UsersModule`, `CourtsModule`, `BookingsModule`, or `PaymentsModule` each registering these same entities for their own use.

- [ ] **Step 6: Run the e2e test to verify it passes**

Run (from `apps/api`): `npm run test:e2e -- admin-stats.e2e-spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the full backend test suite**

Run: `npm test && npm run test:e2e`
Expected: PASS (all suites — confirms the new `TypeOrmModule.forFeature` registrations in `AdminModule` didn't break anything elsewhere).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/admin/admin-stats.service.ts apps/api/src/admin/admin-stats.controller.ts apps/api/src/admin/admin.module.ts apps/api/test/admin-stats.e2e-spec.ts
git commit -m "feat(admin): add GET /admin/stats platform-wide statistics endpoint"
```

---

## Task 3: Frontend proxy route

**Files:**
- Create: `apps/web/src/app/api/admin/stats/route.ts`

**Interfaces:**
- Consumes: `GET /admin/stats` (Task 2).
- Produces: `GET /api/admin/stats` — consumed by Task 4 (frontend page).

- [ ] **Step 1: Add the proxy route**

Create `apps/web/src/app/api/admin/stats/route.ts`:

```ts
import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET() {
  const upstream = await fetchApi('/admin/stats');
  return toNextResponse(upstream);
}
```

This follows the exact pattern already used by `apps/web/src/app/api/admin/approvals/route.ts` — no test needed (thin pass-through, verified via the page that calls it in Task 4), consistent with how other admin proxy routes in this codebase are handled.

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/api/admin/stats/route.ts
git commit -m "feat(web): add /api/admin/stats proxy route"
```

---

## Task 4: Platform stats page

**Files:**
- Create: `apps/web/src/app/admin/stats/page.tsx`
- Modify: `apps/web/src/components/admin-nav.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/stats` (Task 3), response shape `AdminStats` (Task 2, mirrored as a local TS interface since frontend and backend don't share types in this codebase — same convention as the `/admin/approvals` page).

- [ ] **Step 1: Create the stats page**

Create `apps/web/src/app/admin/stats/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminNav } from "@/components/admin-nav";

interface AdminStats {
  owners: { total: number; active: number; pendingApproval: number };
  venues: { total: number; active: number; pendingApproval: number };
  courts: { total: number; active: number };
  todayBookingsCount: number;
  todayRevenue: number;
  newCustomersThisMonth: number;
  revenueByDay: { date: string; revenue: number }[];
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export default function AdminStatsPage() {
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/admin/stats");
      if (response.status === 401) {
        router.push("/login?returnTo=%2Fadmin%2Fstats");
        return;
      }
      const data = await response.json().catch(() => null);
      setStats(data);
    }
    load();
  }, [router]);

  const maxRevenue = stats
    ? Math.max(...stats.revenueByDay.map((d) => d.revenue), 1)
    : 1;

  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 p-8">
      <AdminNav />
      <h1 className="text-2xl font-bold">Thống kê nền tảng</h1>

      {stats === null && <p>Đang tải...</p>}

      {stats !== null && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  Chủ sân
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.owners.total}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.owners.active} hoạt động · {stats.owners.pendingApproval} chờ duyệt
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  Chi nhánh
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.venues.total}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.venues.active} hoạt động · {stats.venues.pendingApproval} chờ duyệt
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">Sân</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.courts.total}</p>
                <p className="text-xs text-muted-foreground">
                  {stats.courts.active} đang hoạt động
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm text-muted-foreground">
                  Booking hôm nay
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{stats.todayBookingsCount}</p>
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
                  {currencyFormatter.format(stats.todayRevenue)} đ
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
                <p className="text-2xl font-bold">{stats.newCustomersThisMonth}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                Doanh thu 30 ngày gần nhất
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex h-32 items-end gap-1">
                {stats.revenueByDay.map((day) => (
                  <div
                    key={day.date}
                    title={`${day.date}: ${currencyFormatter.format(day.revenue)} đ`}
                    className="flex-1 rounded-t bg-primary"
                    style={{
                      height: `${Math.max((day.revenue / maxRevenue) * 100, 2)}%`,
                    }}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Add the nav link**

In `apps/web/src/components/admin-nav.tsx`, change the `LINKS` array from:

```ts
const LINKS = [{ href: "/admin/approvals", label: "Chờ duyệt" }];
```

to:

```ts
const LINKS = [
  { href: "/admin/approvals", label: "Chờ duyệt" },
  { href: "/admin/stats", label: "Thống kê" },
];
```

- [ ] **Step 3: Verify the frontend build succeeds**

Run (from `apps/web`): `npm run build`
Expected: build succeeds, route table includes `○ /admin/stats` and `ƒ /api/admin/stats`, no TypeScript errors.

- [ ] **Step 4: Manually verify against the running backend**

With the API and web dev servers running (Postgres + MailHog up via `docker compose up -d` at the repo root), log in as an admin user and confirm:
1. `/admin/stats` loads without redirecting to login.
2. The 6 stat tiles render with real numbers (owners/venues/courts breakdown, today's bookings/revenue, new customers).
3. The 30-day revenue bar chart renders 30 bars, tallest bar roughly matching the highest-revenue day.
4. The "Thống kê" nav link is present alongside "Chờ duyệt" and navigates correctly.

Report the result of each of these 4 checks before proceeding to commit.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/stats/page.tsx apps/web/src/components/admin-nav.tsx
git commit -m "feat(web): add platform stats page with 30-day revenue chart"
```

---

## Self-Review Notes

- **Spec coverage:** §2 API shape (Task 2), §3 metric definitions incl. the `Payment.amount`-doesn't-exist correction (Task 2's `AdminStatsService`), §4 backend implementation incl. the `TypeOrmModule.forFeature` repository-access note (Task 2 Step 5), §5 validation (403/401 covered by Task 2's e2e test; "no data → zeros" is implied by `count()` naturally returning 0 and `fillRevenueByDay` defaulting to 0 — no separate task needed since no special-casing exists in the implementation), §6 frontend (Task 3 + Task 4), §7 testing (pure-logic unit tests in Task 1, DB-aggregation e2e test in Task 2). §8 out-of-scope items (growth charts, leaderboard, recent-bookings feed, configurable range, caching) are correctly absent from every task.
- **Type consistency:** `AdminStats` (Task 2) fields match the e2e assertions in Task 2 and the local `AdminStats` interface in Task 4's page exactly (`owners`/`venues`/`courts`/`todayBookingsCount`/`todayRevenue`/`newCustomersThisMonth`/`revenueByDay`). `RevenueByDayRow`/`fillRevenueByDay` signature (Task 1) matches how Task 2 calls it (`revenueRows` from `getRawMany<{ date: string; revenue: string }>()`).
- **Placeholder scan:** no TBD/TODO; every step has runnable code and exact commands.
