# Recurring Schedules — List/Detail + Auto-Renew Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the remaining backend pieces of [2026-08-26-pricing-and-recurring-schedules-design.md](../specs/2026-08-26-pricing-and-recurring-schedules-design.md) §3 for Recurring Schedules: §3.5 (`GET` list + detail) and §3.4 (daily auto-renew cron via `@nestjs/schedule`).

**Architecture:** `RecurringSchedulesService` gains `findByVenueForOwner` (list, with a generated-occurrence count per schedule) and `findByIdForOwner` (detail, with the full occurrence list) — both resolve "which schedules belong to this venue" the same way `BookingsService.findByVenueForOwner` already does: via `CourtsService.findByVenueForOwner` to get owned court IDs, then filtering `recurring_schedules` by `court_id IN (...)`. Occurrence lookups go through two new `BookingsService` methods (`findByRecurringScheduleId`, `countByRecurringScheduleId`) rather than reaching into the `Booking` repository directly, keeping the existing module boundary. The `auto_renew` column was never actually added to the schema or entity in the original Recurring Schedules migration — this plan adds it first, since the cron depends on it. The cron itself lives on `RecurringSchedulesService` as a `@Cron('0 1 * * *')` method that calls an internally-testable `renewSchedule(schedule)` method (same create-occurrences-and-skip-conflicts logic as `create()`, extracted so both a real cron tick and a test can call it directly without waiting for a scheduler).

**Tech Stack:** NestJS 11, `@nestjs/schedule` (new dependency), TypeORM 1.x (raw-SQL migration), Jest.

## Global Constraints

- Vietnamese error messages, matching existing style.
- Every schema change is a migration in `apps/api/src/migrations/`, timestamp higher than the latest existing one (`1787900000000`, from the Pricing module work).
- Owner-facing routes: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.OWNER)`, full path on the route decorator.
- Date strings are `YYYY-MM-DD`, treated as UTC (`new Date(\`${date}T00:00:00Z\`)`), matching the rest of the codebase.
- Renewal is NOT subject to the 12-month max-span check (§3.1) — that only applies at creation time (§3.4 point 3).
- Don't touch the Pricing module or its wiring (already shipped).

---

## File Structure

Create:
- `apps/api/src/migrations/1787910000000-AddAutoRenewToRecurringSchedules.ts`
- `apps/api/src/recurring-schedules/date.util.ts` — `addDays(date: string, days: number): string`
- `apps/api/src/recurring-schedules/date.util.spec.ts`

Modify:
- `apps/api/src/recurring-schedules/entities/recurring-schedule.entity.ts` — add `autoRenew: boolean`
- `apps/api/src/recurring-schedules/dto/create-recurring-schedule.dto.ts` — add optional `autoRenew`
- `apps/api/src/recurring-schedules/recurring-schedules.service.ts` — `autoRenew` wiring, `findByVenueForOwner`, `findByIdForOwner`, `@Cron` handler, `renewSchedule`
- `apps/api/src/recurring-schedules/recurring-schedules.service.spec.ts`
- `apps/api/src/recurring-schedules/recurring-schedules.controller.ts` — two new `GET` routes
- `apps/api/src/recurring-schedules/recurring-schedules.module.ts` — import `ScheduleModule` (nothing else changes; `CourtsModule`/`BookingsModule` already imported)
- `apps/api/src/bookings/bookings.service.ts` — `findByRecurringScheduleId`, `countByRecurringScheduleId`
- `apps/api/src/bookings/bookings.service.spec.ts`
- `apps/api/src/app.module.ts` — register `ScheduleModule.forRoot()`
- `apps/api/package.json` — add `@nestjs/schedule`
- `apps/api/test/recurring-schedules-list.e2e-spec.ts` (new)
- `apps/api/test/recurring-schedules-renewal.e2e-spec.ts` (new)

---

### Task 1: Install `@nestjs/schedule` and register `ScheduleModule`

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Produces: `ScheduleModule` registered once at the app root (required by `@nestjs/schedule` for `@Cron()` to work anywhere in the app).

- [ ] **Step 1: Install the package**

Run: `cd apps/api && npm install @nestjs/schedule@^6.1.3`
Expected: `package.json` dependencies gain `"@nestjs/schedule": "^6.1.3"`, install succeeds with no peer-dependency errors (it supports `@nestjs/core@^10 || ^11`, and this repo pins `^11.0.1`).

- [ ] **Step 2: Register `ScheduleModule.forRoot()` in `AppModule`**

In `apps/api/src/app.module.ts`, add the import:

```ts
import { ScheduleModule } from '@nestjs/schedule';
```

Add it near the top of `imports` (order doesn't matter functionally, but keep it next to `ConfigModule`/`ThrottlerModule` since it's another app-wide root module):

```ts
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 20 }]),
```

- [ ] **Step 3: Verify the app still boots**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors (the 3 pre-existing unrelated errors in `bookings.service.spec.ts`/`disputes.service.spec.ts` from before are fine).

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/app.module.ts
git commit -m "feat(api): install @nestjs/schedule and register ScheduleModule"
```

---

### Task 2: `auto_renew` column (migration + entity + DTO + create() wiring)

**Files:**
- Create: `apps/api/src/migrations/1787910000000-AddAutoRenewToRecurringSchedules.ts`
- Modify: `apps/api/src/recurring-schedules/entities/recurring-schedule.entity.ts`
- Modify: `apps/api/src/recurring-schedules/dto/create-recurring-schedule.dto.ts`
- Modify: `apps/api/src/recurring-schedules/recurring-schedules.service.ts`
- Modify: `apps/api/src/recurring-schedules/recurring-schedules.service.spec.ts`

**Interfaces:**
- Produces: `RecurringSchedule.autoRenew: boolean`, `CreateRecurringScheduleDto.autoRenew?: boolean`, `RecurringSchedulesService.create()` persists it (default `false`).

- [ ] **Step 1: Write the migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAutoRenewToRecurringSchedules1787910000000
  implements MigrationInterface
{
  name = 'AddAutoRenewToRecurringSchedules1787910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recurring_schedules" ADD "auto_renew" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recurring_schedules" DROP COLUMN "auto_renew"`,
    );
  }
}
```

- [ ] **Step 2: Run the migration**

Run: `cd apps/api && npm run migration:run`
Expected: output includes `AddAutoRenewToRecurringSchedules1787910000000`, no errors.

- [ ] **Step 3: Add the column to the entity**

In `apps/api/src/recurring-schedules/entities/recurring-schedule.entity.ts`, add after `note`:

```ts
  @Column({ name: 'auto_renew', type: 'boolean', default: false })
  autoRenew: boolean;
```

- [ ] **Step 4: Add the field to `CreateRecurringScheduleDto`**

In `apps/api/src/recurring-schedules/dto/create-recurring-schedule.dto.ts`, add `IsBoolean` to the `class-validator` import and add the field:

```ts
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
```

```ts
  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
```

(add it after `note?: string;`)

- [ ] **Step 5: Write the failing test**

Add to `apps/api/src/recurring-schedules/recurring-schedules.service.spec.ts`, inside `describe('RecurringSchedulesService.create', ...)`:

```ts
  it('defaults autoRenew to false, and persists true when provided', async () => {
    const { service, courtsService, venuesService, customerContactsService, bookingsService } =
      await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    customerContactsService.resolveSelector.mockResolvedValue({ customerContactId: 'contact-1' });
    bookingsService.createBookingRecord.mockResolvedValue({});

    const defaultResult = await service.create('owner-1', 'venue-1', {
      courtId: 'court-1',
      dayOfWeek: 0,
      startTime: '18:00',
      endTime: '19:00',
      pricePerSession: 100000,
      validFrom: '2024-01-01',
      validTo: '2024-01-14',
      customerContactId: 'contact-1',
    });
    expect(defaultResult.schedule.autoRenew).toBe(false);

    const explicitResult = await service.create('owner-1', 'venue-1', {
      courtId: 'court-1',
      dayOfWeek: 0,
      startTime: '18:00',
      endTime: '19:00',
      pricePerSession: 100000,
      validFrom: '2024-01-01',
      validTo: '2024-01-14',
      customerContactId: 'contact-1',
      autoRenew: true,
    });
    expect(explicitResult.schedule.autoRenew).toBe(true);
  });
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd apps/api && npx jest recurring-schedules.service.spec.ts`
Expected: FAIL — `defaultResult.schedule.autoRenew` is `undefined`, not `false` (the service never sets it yet).

- [ ] **Step 7: Wire `autoRenew` into `RecurringSchedulesService.create()`**

In `apps/api/src/recurring-schedules/recurring-schedules.service.ts`, in the `repository.create({...})` call inside `create()`, add:

```ts
        validFrom: dto.validFrom,
        validTo: dto.validTo,
        note: dto.note ?? null,
        autoRenew: dto.autoRenew ?? false,
      }),
```

(insert `autoRenew: dto.autoRenew ?? false,` right after the existing `note: dto.note ?? null,` line)

- [ ] **Step 8: Run to verify it passes**

Run: `cd apps/api && npx jest recurring-schedules.service.spec.ts`
Expected: PASS — all tests green.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/migrations/1787910000000-AddAutoRenewToRecurringSchedules.ts apps/api/src/recurring-schedules/entities/recurring-schedule.entity.ts apps/api/src/recurring-schedules/dto/create-recurring-schedule.dto.ts apps/api/src/recurring-schedules/recurring-schedules.service.ts apps/api/src/recurring-schedules/recurring-schedules.service.spec.ts
git commit -m "feat(api): add auto_renew column to recurring_schedules"
```

---

### Task 3: `BookingsService` occurrence lookup helpers

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts`
- Modify: `apps/api/src/bookings/bookings.service.spec.ts`

**Interfaces:**
- Produces: `BookingsService.findByRecurringScheduleId(recurringScheduleId: string): Promise<Booking[]>`, `BookingsService.countByRecurringScheduleId(recurringScheduleId: string): Promise<number>` (both used by Task 4's `RecurringSchedulesService`)

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/bookings/bookings.service.spec.ts` (new top-level `describe` blocks, anywhere after the existing ones):

```ts
describe('BookingsService.findByRecurringScheduleId', () => {
  it('returns bookings for the schedule ordered by date/startTime', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.find.mockResolvedValue([{ id: 'booking-1', recurringScheduleId: 'schedule-1' }]);

    const result = await service.findByRecurringScheduleId('schedule-1');

    expect(bookingsRepo.find).toHaveBeenCalledWith({
      where: { recurringScheduleId: 'schedule-1' },
      order: { date: 'ASC', startTime: 'ASC' },
    });
    expect(result).toEqual([{ id: 'booking-1', recurringScheduleId: 'schedule-1' }]);
  });
});

describe('BookingsService.countByRecurringScheduleId', () => {
  it('counts bookings for the schedule', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.count.mockResolvedValue(3);

    const result = await service.countByRecurringScheduleId('schedule-1');

    expect(bookingsRepo.count).toHaveBeenCalledWith({ where: { recurringScheduleId: 'schedule-1' } });
    expect(result).toBe(3);
  });
});
```

Add `count: jest.fn()` to `mockBookingsRepository` in the same file (it currently only has `find`, `findOne`, `save`, `createQueryBuilder`):

```ts
const mockBookingsRepository = () => {
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
};
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest bookings.service.spec.ts`
Expected: FAIL — `service.findByRecurringScheduleId is not a function`.

- [ ] **Step 3: Implement both methods**

Add to `BookingsService` in `apps/api/src/bookings/bookings.service.ts`, near `cancelFutureOccurrences`:

```ts
  findByRecurringScheduleId(recurringScheduleId: string): Promise<Booking[]> {
    return this.bookingsRepository.find({
      where: { recurringScheduleId },
      order: { date: 'ASC', startTime: 'ASC' },
    });
  }

  countByRecurringScheduleId(recurringScheduleId: string): Promise<number> {
    return this.bookingsRepository.count({ where: { recurringScheduleId } });
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest bookings.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.service.spec.ts
git commit -m "feat(api): add BookingsService occurrence lookups for recurring schedules"
```

---

### Task 4: `RecurringSchedulesService.findByVenueForOwner` + `findByIdForOwner`, controller routes, e2e

**Files:**
- Modify: `apps/api/src/recurring-schedules/recurring-schedules.service.ts`
- Modify: `apps/api/src/recurring-schedules/recurring-schedules.service.spec.ts`
- Modify: `apps/api/src/recurring-schedules/recurring-schedules.controller.ts`
- Create: `apps/api/test/recurring-schedules-list.e2e-spec.ts`

**Interfaces:**
- Consumes: `CourtsService.findByVenueForOwner` (existing), `BookingsService.findByRecurringScheduleId`/`countByRecurringScheduleId` (Task 3)
- Produces: `RecurringSchedulesService.findByVenueForOwner(ownerId, venueId): Promise<Array<RecurringSchedule & {occurrenceCount: number}>>`, `RecurringSchedulesService.findByIdForOwner(ownerId, venueId, id): Promise<{schedule: RecurringSchedule; occurrences: Booking[]}>`. Routes: `GET venues/mine/:venueId/recurring-schedules`, `GET venues/mine/:venueId/recurring-schedules/:id`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/recurring-schedules/recurring-schedules.service.spec.ts`. First extend `mockCourtsService` to include `findByVenueForOwner`, and `mockBookingsService` to include the two Task 3 methods:

```ts
const mockCourtsService = () => ({
  findByIdOrThrow: jest.fn(),
  findByVenueForOwner: jest.fn(),
});
const mockVenuesService = () => ({ getOwnedVenueOrThrow: jest.fn() });
const mockCustomerContactsService = () => ({ resolveSelector: jest.fn() });
const mockBookingsService = () => ({
  createBookingRecord: jest.fn(),
  cancelFutureOccurrences: jest.fn(),
  findByRecurringScheduleId: jest.fn(),
  countByRecurringScheduleId: jest.fn(),
});
```

(`mockVenuesService`/`mockCustomerContactsService` are unchanged — shown for context on where `mockCourtsService`/`mockBookingsService` sit.)

Then add new `describe` blocks at the end of the file:

```ts
describe('RecurringSchedulesService.findByVenueForOwner', () => {
  it('lists schedules for the venue courts with their occurrence count', async () => {
    const { service, repo, courtsService, bookingsService } = await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([{ id: 'court-1' }, { id: 'court-2' }]);
    repo.find.mockResolvedValue([
      { id: 'schedule-1', courtId: 'court-1', status: RecurringScheduleStatus.ACTIVE },
    ]);
    bookingsService.countByRecurringScheduleId.mockResolvedValue(5);

    const result = await service.findByVenueForOwner('owner-1', 'venue-1');

    expect(courtsService.findByVenueForOwner).toHaveBeenCalledWith('owner-1', 'venue-1');
    expect(result).toEqual([
      expect.objectContaining({ id: 'schedule-1', occurrenceCount: 5 }),
    ]);
  });

  it('returns an empty list when the venue has no courts', async () => {
    const { service, courtsService, repo } = await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([]);
    repo.find.mockResolvedValue([]);

    const result = await service.findByVenueForOwner('owner-1', 'venue-1');

    expect(result).toEqual([]);
  });
});

describe('RecurringSchedulesService.findByIdForOwner', () => {
  it('returns the schedule with its occurrences', async () => {
    const { service, repo, courtsService, venuesService, bookingsService } =
      await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    repo.findOne.mockResolvedValue({ id: 'schedule-1', courtId: 'court-1' });
    courtsService.findByIdOrThrow.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    bookingsService.findByRecurringScheduleId.mockResolvedValue([{ id: 'booking-1' }]);

    const result = await service.findByIdForOwner('owner-1', 'venue-1', 'schedule-1');

    expect(result).toEqual({
      schedule: { id: 'schedule-1', courtId: 'court-1' },
      occurrences: [{ id: 'booking-1' }],
    });
  });

  it('throws NotFoundException when the schedule does not belong to the venue', async () => {
    const { service, repo, courtsService, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    repo.findOne.mockResolvedValue({ id: 'schedule-1', courtId: 'court-1' });
    courtsService.findByIdOrThrow.mockResolvedValue({ id: 'court-1', venueId: 'other-venue' });

    await expect(service.findByIdForOwner('owner-1', 'venue-1', 'schedule-1')).rejects.toThrow(
      'Lịch cố định schedule-1 không tồn tại',
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest recurring-schedules.service.spec.ts`
Expected: FAIL — `service.findByVenueForOwner is not a function` / `service.findByIdForOwner is not a function`.

- [ ] **Step 3: Implement both methods**

Add to `apps/api/src/recurring-schedules/recurring-schedules.service.ts`, near the top add `import { In } from 'typeorm';`, then add methods to the class (after `create`, before `cancel` is fine):

```ts
  async findByVenueForOwner(
    ownerId: string,
    venueId: string,
  ): Promise<Array<RecurringSchedule & { occurrenceCount: number }>> {
    const courts = await this.courtsService.findByVenueForOwner(ownerId, venueId);
    const courtIds = courts.map((court) => court.id);
    const schedules = await this.repository.find({
      where: { courtId: In(courtIds.length > 0 ? courtIds : ['__none__']) },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(
      schedules.map(async (schedule) => ({
        ...schedule,
        occurrenceCount: await this.bookingsService.countByRecurringScheduleId(schedule.id),
      })),
    );
  }

  async findByIdForOwner(
    ownerId: string,
    venueId: string,
    id: string,
  ): Promise<{ schedule: RecurringSchedule; occurrences: Booking[] }> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const schedule = await this.repository.findOne({ where: { id } });
    if (!schedule) {
      throw new NotFoundException(`Lịch cố định ${id} không tồn tại`);
    }
    const court = await this.courtsService.findByIdOrThrow(schedule.courtId);
    if (court.venueId !== venueId) {
      throw new NotFoundException(`Lịch cố định ${id} không tồn tại`);
    }
    const occurrences = await this.bookingsService.findByRecurringScheduleId(id);
    return { schedule, occurrences };
  }
```

Add the `Booking` type import at the top of the file:

```ts
import { Booking } from '../bookings/entities/booking.entity';
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest recurring-schedules.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add the controller routes**

In `apps/api/src/recurring-schedules/recurring-schedules.controller.ts`, add `Get` to the `@nestjs/common` import and add two methods:

```ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
```

```ts
  @Get('venues/mine/:venueId/recurring-schedules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
  ) {
    return this.recurringSchedulesService.findByVenueForOwner(user.userId, venueId);
  }

  @Get('venues/mine/:venueId/recurring-schedules/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.recurringSchedulesService.findByIdForOwner(user.userId, venueId, id);
  }
```

(place them anywhere in the class; e.g. right after `create`)

- [ ] **Step 6: Write and run the e2e test**

`apps/api/test/recurring-schedules-list.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../src/courts/entities/court.entity';

describe('Recurring schedules list/detail (e2e)', () => {
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

  it('lists schedules with occurrence counts and returns schedule detail with occurrences', async () => {
    const passwordHash = await bcrypt.hash('password123', 10);
    const usersRepo = dataSource.getRepository(User);
    const owner = await usersRepo.save(
      usersRepo.create({
        email: 'owner@test.com',
        passwordHash,
        fullName: 'Owner',
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'owner@test.com', password: 'password123' });
    const token = loginResponse.body.accessToken as string;

    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId: owner.id,
        name: 'Sân ABC',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
      }),
    );
    const courtsRepo = dataSource.getRepository(Court);
    const court = await courtsRepo.save(
      courtsRepo.create({
        venueId: venue.id,
        name: 'Sân 1',
        pricePerHour: 100000,
        openTime: '08:00',
        closeTime: '23:00',
        slotDurationMinutes: 60,
        status: CourtStatus.ACTIVE,
      }),
    );

    const createResponse = await request(app.getHttpServer())
      .post(`/venues/mine/${venue.id}/recurring-schedules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        courtId: court.id,
        dayOfWeek: 0,
        startTime: '18:00',
        endTime: '19:00',
        pricePerSession: 100000,
        validFrom: '2099-01-05', // a Monday
        validTo: '2099-01-19',
        newCustomer: { fullName: 'Khách quen', phone: '0933333333' },
      })
      .expect(201);
    const scheduleId = createResponse.body.schedule.id as string;
    expect(createResponse.body.generatedCount).toBe(3);

    const listResponse = await request(app.getHttpServer())
      .get(`/venues/mine/${venue.id}/recurring-schedules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0]).toMatchObject({ id: scheduleId, occurrenceCount: 3 });

    const detailResponse = await request(app.getHttpServer())
      .get(`/venues/mine/${venue.id}/recurring-schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detailResponse.body.schedule.id).toBe(scheduleId);
    expect(detailResponse.body.occurrences).toHaveLength(3);
  });
});
```

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json recurring-schedules-list.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/recurring-schedules/recurring-schedules.service.ts apps/api/src/recurring-schedules/recurring-schedules.service.spec.ts apps/api/src/recurring-schedules/recurring-schedules.controller.ts apps/api/test/recurring-schedules-list.e2e-spec.ts
git commit -m "feat(api): add GET list/detail endpoints for recurring schedules"
```

---

### Task 5: `date.util.ts` (`addDays`)

**Files:**
- Create: `apps/api/src/recurring-schedules/date.util.ts`
- Create: `apps/api/src/recurring-schedules/date.util.spec.ts`

**Interfaces:**
- Produces: `addDays(date: string, days: number): string` (used by Task 6's renewal logic)

- [ ] **Step 1: Write the failing test**

```ts
import { addDays } from './date.util';

describe('addDays', () => {
  it('adds days within the same month', () => {
    expect(addDays('2026-01-01', 5)).toBe('2026-01-06');
  });

  it('rolls over a month boundary', () => {
    expect(addDays('2026-01-30', 5)).toBe('2026-02-04');
  });

  it('rolls over a year boundary', () => {
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04');
  });

  it('supports adding a single day', () => {
    expect(addDays('2026-08-24', 1)).toBe('2026-08-25');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest date.util.spec.ts`
Expected: FAIL — `Cannot find module './date.util'`.

- [ ] **Step 3: Implement `addDays`**

```ts
export function addDays(date: string, days: number): string {
  const cursor = new Date(`${date}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest date.util.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/recurring-schedules/date.util.ts apps/api/src/recurring-schedules/date.util.spec.ts
git commit -m "feat(api): add addDays date helper for recurring schedule renewal"
```

---

### Task 6: Auto-renew cron (`renewSchedule` + `@Cron` handler)

**Files:**
- Modify: `apps/api/src/recurring-schedules/recurring-schedules.service.ts`
- Modify: `apps/api/src/recurring-schedules/recurring-schedules.service.spec.ts`
- Create: `apps/api/test/recurring-schedules-renewal.e2e-spec.ts`

**Interfaces:**
- Consumes: `addDays` (Task 5), `generateOccurrenceDates` (existing, `./occurrence-dates.util`)
- Produces: `RecurringSchedulesService.renewSchedule(schedule: RecurringSchedule): Promise<{ generatedCount: number; conflictingDates: string[] }>` and a `@Cron('0 1 * * *') renewExpiringSchedules(): Promise<void>` that finds due schedules and calls `renewSchedule` on each.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/recurring-schedules/recurring-schedules.service.spec.ts`:

```ts
describe('RecurringSchedulesService.renewSchedule', () => {
  const DUE_SCHEDULE = {
    id: 'schedule-1',
    courtId: 'court-1',
    customerId: null,
    customerContactId: 'contact-1',
    dayOfWeek: 0, // Monday
    startTime: '18:00',
    endTime: '19:00',
    pricePerSession: 100000,
    discountPercent: 10,
    validFrom: '2098-12-01',
    validTo: '2099-01-05', // a Monday
    autoRenew: true,
    status: RecurringScheduleStatus.ACTIVE,
  } as RecurringSchedule;

  it('generates occurrences for the next 30 days past validTo and extends validTo', async () => {
    const { service, repo, bookingsService } = await buildTestingModule();
    bookingsService.createBookingRecord.mockResolvedValue({});
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.renewSchedule({ ...DUE_SCHEDULE });

    // 2099-01-06 .. 2099-02-04 (30 days after old validTo) contains Mondays
    // 2099-01-12, 01-19, 01-26, 02-02 -> 4 occurrences
    expect(result.generatedCount).toBe(4);
    expect(result.conflictingDates).toEqual([]);
    expect(bookingsService.createBookingRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        courtId: 'court-1',
        date: '2099-01-12',
        startTime: '18:00',
        endTime: '19:00',
        customerContactId: 'contact-1',
        recurringScheduleId: 'schedule-1',
        totalPriceOverride: 90000,
      }),
    );
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ validTo: '2099-02-04' }),
    );
  });

  it('collects conflicting dates instead of aborting', async () => {
    const { service, repo, bookingsService } = await buildTestingModule();
    bookingsService.createBookingRecord
      .mockRejectedValueOnce(new ConflictException('Một hoặc nhiều khung giờ đã được đặt'))
      .mockResolvedValue({});
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.renewSchedule({ ...DUE_SCHEDULE });

    expect(result.conflictingDates).toEqual(['2099-01-12']);
    expect(result.generatedCount).toBe(3);
  });
});

describe('RecurringSchedulesService.renewExpiringSchedules', () => {
  it('renews every active, auto-renewing schedule due within 7 days', async () => {
    const { service, repo, bookingsService } = await buildTestingModule();
    const due = {
      id: 'schedule-1',
      courtId: 'court-1',
      customerId: null,
      customerContactId: 'contact-1',
      dayOfWeek: 0,
      startTime: '18:00',
      endTime: '19:00',
      pricePerSession: 100000,
      discountPercent: null,
      validFrom: '2098-12-01',
      validTo: '2099-01-05',
      autoRenew: true,
      status: RecurringScheduleStatus.ACTIVE,
    } as RecurringSchedule;
    repo.find.mockResolvedValue([due]);
    repo.save.mockImplementation((data) => Promise.resolve(data));
    bookingsService.createBookingRecord.mockResolvedValue({});

    await service.renewExpiringSchedules();

    expect(repo.find).toHaveBeenCalledWith({
      where: {
        status: RecurringScheduleStatus.ACTIVE,
        autoRenew: true,
        validTo: expect.anything(),
      },
    });
    expect(bookingsService.createBookingRecord).toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ validTo: '2099-02-04' }));
  });
});
```

Add `import { ConflictException } from '@nestjs/common';` at the top of the spec file if not already present (it already is, from the existing `create` conflict test).

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest recurring-schedules.service.spec.ts`
Expected: FAIL — `service.renewSchedule is not a function` / `service.renewExpiringSchedules is not a function`.

- [ ] **Step 3: Implement `renewSchedule` and `renewExpiringSchedules`**

In `apps/api/src/recurring-schedules/recurring-schedules.service.ts`:

Add imports:

```ts
import { Cron } from '@nestjs/schedule';
import { In, LessThanOrEqual } from 'typeorm';
import { addDays } from './date.util';
```

(replace the existing `import { NotFoundException } ...`-adjacent plain import if `In`/`LessThanOrEqual` aren't already imported from `'typeorm'` — Task 4 already added `import { In } from 'typeorm';`, so just add `LessThanOrEqual` to that same import line: `import { In, LessThanOrEqual } from 'typeorm';`)

Add methods to the class:

```ts
  @Cron('0 1 * * *')
  async renewExpiringSchedules(): Promise<void> {
    const cutoff = addDays(new Date().toISOString().slice(0, 10), 7);
    const dueSchedules = await this.repository.find({
      where: {
        status: RecurringScheduleStatus.ACTIVE,
        autoRenew: true,
        validTo: LessThanOrEqual(cutoff),
      },
    });
    for (const schedule of dueSchedules) {
      await this.renewSchedule(schedule);
    }
  }

  async renewSchedule(
    schedule: RecurringSchedule,
  ): Promise<{ generatedCount: number; conflictingDates: string[] }> {
    const renewalStart = addDays(schedule.validTo, 1);
    const newValidTo = addDays(schedule.validTo, 30);
    const sessionPrice =
      Math.round(schedule.pricePerSession * (1 - (schedule.discountPercent ?? 0) / 100) * 100) /
      100;
    const dates = generateOccurrenceDates(renewalStart, newValidTo, schedule.dayOfWeek);
    const customerRef = schedule.customerId
      ? { customerId: schedule.customerId }
      : { customerContactId: schedule.customerContactId as string };

    const conflictingDates: string[] = [];
    let generatedCount = 0;
    for (const date of dates) {
      try {
        await this.bookingsService.createBookingRecord({
          courtId: schedule.courtId,
          date,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          ...customerRef,
          recurringScheduleId: schedule.id,
          totalPriceOverride: sessionPrice,
        });
        generatedCount += 1;
      } catch (error) {
        if (error instanceof ConflictException) {
          conflictingDates.push(date);
          continue;
        }
        throw error;
      }
    }

    schedule.validTo = newValidTo;
    await this.repository.save(schedule);

    return { generatedCount, conflictingDates };
  }
```

`ConflictException` is already imported in this file (used by `create()`).

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/api && npx jest recurring-schedules.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write and run the e2e test**

`apps/api/test/recurring-schedules-renewal.e2e-spec.ts` — calls `renewSchedule` directly (per spec §5: "test gọi trực tiếp hàm xử lý, không đợi thật 1 ngày"), against a real Postgres-backed schedule/booking:

```ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../src/courts/entities/court.entity';
import { RecurringSchedulesService } from '../src/recurring-schedules/recurring-schedules.service';
import { RecurringSchedule } from '../src/recurring-schedules/entities/recurring-schedule.entity';

describe('Recurring schedule auto-renewal (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let recurringSchedulesService: RecurringSchedulesService;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    recurringSchedulesService = app.get(RecurringSchedulesService);
  });

  beforeEach(async () => {
    await clearDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates occurrences for the next 30 days and extends validTo', async () => {
    const passwordHash = await bcrypt.hash('password123', 10);
    const usersRepo = dataSource.getRepository(User);
    const owner = await usersRepo.save(
      usersRepo.create({
        email: 'owner@test.com',
        passwordHash,
        fullName: 'Owner',
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'owner@test.com', password: 'password123' });
    const token = loginResponse.body.accessToken as string;

    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId: owner.id,
        name: 'Sân ABC',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
      }),
    );
    const courtsRepo = dataSource.getRepository(Court);
    const court = await courtsRepo.save(
      courtsRepo.create({
        venueId: venue.id,
        name: 'Sân 1',
        pricePerHour: 100000,
        openTime: '08:00',
        closeTime: '23:00',
        slotDurationMinutes: 60,
        status: CourtStatus.ACTIVE,
      }),
    );

    const createResponse = await request(app.getHttpServer())
      .post(`/venues/mine/${venue.id}/recurring-schedules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        courtId: court.id,
        dayOfWeek: 0, // Monday
        startTime: '18:00',
        endTime: '19:00',
        pricePerSession: 100000,
        validFrom: '2098-12-01',
        validTo: '2099-01-05', // a Monday
        newCustomer: { fullName: 'Khách quen', phone: '0933333333' },
        autoRenew: true,
      })
      .expect(201);
    const scheduleId = createResponse.body.schedule.id as string;

    const scheduleRepo = dataSource.getRepository(RecurringSchedule);
    const schedule = await scheduleRepo.findOneOrFail({ where: { id: scheduleId } });

    const result = await recurringSchedulesService.renewSchedule(schedule);

    expect(result.generatedCount).toBeGreaterThan(0);
    expect(result.conflictingDates).toEqual([]);

    const updated = await scheduleRepo.findOneOrFail({ where: { id: scheduleId } });
    expect(updated.validTo).toBe('2099-02-04');

    const detailResponse = await request(app.getHttpServer())
      .get(`/venues/mine/${venue.id}/recurring-schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // 3 occurrences from the original create() + occurrences from renewSchedule()
    expect(detailResponse.body.occurrences.length).toBeGreaterThan(3);
  });
});
```

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json recurring-schedules-renewal.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 6: Full suite sanity check**

Run: `cd apps/api && npm run test && npm run test:e2e`
Expected: all unit and e2e tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/recurring-schedules/recurring-schedules.service.ts apps/api/src/recurring-schedules/recurring-schedules.service.spec.ts apps/api/test/recurring-schedules-renewal.e2e-spec.ts
git commit -m "feat(api): add auto-renew cron for recurring schedules"
```

---

## Out of scope (tracked separately)

- §4 dashboard summary card ("Bảng giá" / "Đặt cố định" / "Doanh thu cố định/tháng").
- Frontend for the "Bảng giá" page.
- Notifying customers of renewal/expiry (explicitly out of scope per spec §6).
