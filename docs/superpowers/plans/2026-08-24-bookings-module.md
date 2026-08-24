# Bookings Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Bookings module — customers hold a court slot instantly on booking, double-booking is prevented at the database level, cancellation respects a per-venue cutoff window, and owners can view/cancel bookings on their venues.

**Architecture:** A new `BookingsModule` (NestJS) depends on the existing `CourtsModule` (for `CourtsService`/`VenuesService`) exactly like the spec's dependency direction (`Bookings → Courts`, never the reverse). Double-booking prevention relies on a plain PostgreSQL unique index on a child table (`booking_slots`, one row per fixed-size slot unit) rather than locks or range constraints — see spec §5 for why this is sufficient.

**Tech Stack:** NestJS 11, TypeORM (`^1.1.0` installed, actually TypeORM's modern API — `DataSource`, `@InjectDataSource`), PostgreSQL 16, Jest + Supertest for e2e (real DB, no mocks for concurrency behavior).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-24-bookings-module-design.md` — every field name, status value, and endpoint path below is taken verbatim from it.
- Booking statuses: `confirmed` | `cancelled` | `completed` (no `pending`/`requested`).
- Double-booking prevention: unique index on `booking_slots(court_id, date, slot_start)` — no DB extensions, no advisory locks (Approach C, confirmed by user).
- Cancellation cutoff (`venues.cancellation_cutoff_hours`) is per-venue, default `2`, editable via existing `PATCH /venues/mine/:id`.
- All date/time comparisons treat values as UTC (matches `CourtsService`'s existing `new Date().toISOString().slice(0, 10)` convention) — no per-venue timezone support in MVP. Every place that builds a JS `Date` from a stored `date`+`time` pair must append `Z` to force UTC parsing, or comparisons will silently depend on the host machine's local timezone.
- No foreign key constraints at the DB level anywhere in this schema — matches the existing `courts`/`venues` migration convention (relations enforced in the service layer only, e.g. `getOwnedVenueOrThrow`).
- Owner cannot create bookings (out of MVP scope, confirmed by user) — only `POST /bookings` (customer, role-guarded) creates rows.
- Postgres runs via `docker-compose up -d` (service `postgres`, host `localhost`, port `5433`, db/user/pass `pickleball`) — required before running migrations or e2e tests.

---

### Task 1: Add per-venue cancellation cutoff config to the Courts module

**Files:**
- Modify: `apps/api/src/courts/entities/venue.entity.ts`
- Modify: `apps/api/src/courts/dto/update-venue.dto.ts`
- Modify: `apps/api/src/courts/venues.service.ts`
- Modify: `apps/api/src/courts/venues.service.spec.ts`
- Create: `apps/api/src/migrations/<timestamp>-AddCancellationCutoffToVenues.ts` (generated, not hand-written)

**Interfaces:**
- Produces: `Venue.cancellationCutoffHours: number` (default `2`), consumed by `BookingsService.cancelByCustomer` (Task 6) via `VenuesService.findByIdOrThrow` (Task 2).

- [ ] **Step 1: Write the failing test**

Add to the `describe('VenuesService.update', ...)` block in `apps/api/src/courts/venues.service.spec.ts`:

```typescript
  it('updates cancellationCutoffHours when provided', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      name: 'Old Name',
      address: 'Old Address',
      city: 'Old City',
      description: null,
      cancellationCutoffHours: 2,
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', {
      cancellationCutoffHours: 4,
    });

    expect(result.cancellationCutoffHours).toBe(4);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest venues.service.spec.ts -t "updates cancellationCutoffHours"`
Expected: FAIL — `result.cancellationCutoffHours` is `undefined` (DTO field doesn't exist yet, service doesn't handle it).

- [ ] **Step 3: Add the column to the Venue entity**

In `apps/api/src/courts/entities/venue.entity.ts`, add after the `status` column:

```typescript
  @Column({ name: 'cancellation_cutoff_hours', type: 'int', default: 2 })
  cancellationCutoffHours: number;
```

- [ ] **Step 4: Add the optional field to UpdateVenueDto**

Replace the full contents of `apps/api/src/courts/dto/update-venue.dto.ts`:

```typescript
import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class UpdateVenueDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  address?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  city?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(72)
  cancellationCutoffHours?: number;
}
```

- [ ] **Step 5: Update VenuesService.update() to handle the new field**

In `apps/api/src/courts/venues.service.ts`, in the `update()` method, add after the `description` line:

```typescript
    if (dto.cancellationCutoffHours !== undefined) {
      venue.cancellationCutoffHours = dto.cancellationCutoffHours;
    }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/api && npx jest venues.service.spec.ts`
Expected: PASS (all tests in the file, including the new one).

- [ ] **Step 7: Generate and run the migration**

Ensure Postgres is running: `docker-compose up -d postgres` (from repo root).

Run: `cd apps/api && npm run migration:generate -- src/migrations/AddCancellationCutoffToVenues`
Expected: creates a new file `apps/api/src/migrations/<timestamp>-AddCancellationCutoffToVenues.ts`. Open it and confirm the `up()` method contains an `ALTER TABLE "venues" ADD "cancellation_cutoff_hours" integer NOT NULL DEFAULT 2` statement (exact wording may vary slightly but must add that column with that default).

Run: `cd apps/api && npm run migration:run`
Expected: output includes `AddCancellationCutoffToVenues<timestamp> has been executed successfully`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/courts/entities/venue.entity.ts apps/api/src/courts/dto/update-venue.dto.ts apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.service.spec.ts apps/api/src/migrations/*AddCancellationCutoffToVenues.ts
git commit -m "feat(api): add per-venue cancellation cutoff config"
```

---

### Task 2: Add cross-module lookup helpers (findByIdOrThrow)

**Files:**
- Modify: `apps/api/src/courts/venues.service.ts`
- Modify: `apps/api/src/courts/venues.service.spec.ts`
- Modify: `apps/api/src/courts/courts.service.ts`
- Modify: `apps/api/src/courts/courts.service.spec.ts`

**Interfaces:**
- Produces: `VenuesService.findByIdOrThrow(id: string): Promise<Venue>` — plain lookup by id, no owner/status filter.
- Produces: `CourtsService.findByIdOrThrow(id: string): Promise<Court>` — plain lookup by id, no active filter.
- Consumed by: `BookingsService.create`, `.cancelByCustomer` (Tasks 5, 6).

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/courts/venues.service.spec.ts`:

```typescript
describe('VenuesService.findByIdOrThrow', () => {
  it('returns the venue regardless of status or owner', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-2' });

    const result = await service.findByIdOrThrow('venue-1');

    expect(result.id).toBe('venue-1');
  });

  it('throws NotFoundException when the venue does not exist', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue(null);

    await expect(service.findByIdOrThrow('venue-1')).rejects.toThrow(
      'Venue venue-1 không tồn tại',
    );
  });
});
```

Add to `apps/api/src/courts/courts.service.spec.ts`:

```typescript
describe('CourtsService.findByIdOrThrow', () => {
  it('returns the court regardless of active status', async () => {
    const { service, courtsRepo } = await buildTestingModule();
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', isActive: false });

    const result = await service.findByIdOrThrow('court-1');

    expect(result.id).toBe('court-1');
  });

  it('throws NotFoundException when the court does not exist', async () => {
    const { service, courtsRepo } = await buildTestingModule();
    courtsRepo.findOne.mockResolvedValue(null);

    await expect(service.findByIdOrThrow('court-1')).rejects.toThrow(
      'Court court-1 không tồn tại',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest venues.service.spec.ts courts.service.spec.ts`
Expected: FAIL — `service.findByIdOrThrow is not a function` in both files.

- [ ] **Step 3: Implement VenuesService.findByIdOrThrow**

In `apps/api/src/courts/venues.service.ts`, add as a new public method (e.g. after `getOwnedVenueOrThrow`):

```typescript
  async findByIdOrThrow(id: string): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({ where: { id } });
    if (!venue) {
      throw new NotFoundException(`Venue ${id} không tồn tại`);
    }
    return venue;
  }
```

- [ ] **Step 4: Implement CourtsService.findByIdOrThrow**

In `apps/api/src/courts/courts.service.ts`, add as a new public method (e.g. after `findActiveByVenue`):

```typescript
  async findByIdOrThrow(id: string): Promise<Court> {
    const court = await this.courtsRepository.findOne({ where: { id } });
    if (!court) {
      throw new NotFoundException(`Court ${id} không tồn tại`);
    }
    return court;
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest venues.service.spec.ts courts.service.spec.ts`
Expected: PASS (all tests in both files).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.service.spec.ts apps/api/src/courts/courts.service.ts apps/api/src/courts/courts.service.spec.ts
git commit -m "feat(api): add findByIdOrThrow lookups to Venues/Courts services"
```

---

### Task 3: Booking and BookingSlot entities + migration

**Files:**
- Create: `apps/api/src/bookings/entities/booking.entity.ts`
- Create: `apps/api/src/bookings/entities/booking-slot.entity.ts`
- Create: `apps/api/src/migrations/<timestamp>-CreateBookings.ts` (generated, not hand-written)

**Interfaces:**
- Produces: `Booking` entity (`id, courtId, customerId, date, startTime, endTime, totalPrice, status: BookingStatus, cancelledAt, cancelledBy, createdAt, updatedAt`), `BookingStatus` enum (`CONFIRMED = 'confirmed'`, `CANCELLED = 'cancelled'`, `COMPLETED = 'completed'`).
- Produces: `BookingSlot` entity (`id, bookingId, courtId, date, slotStart`), unique index on `(courtId, date, slotStart)`.
- Consumed by: every `BookingsService` method (Tasks 5-8).

No TDD here — this is schema scaffolding with no branching logic to test; correctness is verified by the generated migration matching the entity definitions and by Task 5's unit tests exercising the entities.

- [ ] **Step 1: Create the Booking entity**

Create `apps/api/src/bookings/entities/booking.entity.ts`:

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum BookingStatus {
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'court_id' })
  courtId: string;

  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({
    type: 'date',
    transformer: {
      to: (value: string) => value,
      from: (value: Date) => value.toISOString().slice(0, 10),
    },
  })
  date: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({
    name: 'total_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  totalPrice: number;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.CONFIRMED,
  })
  status: BookingStatus;

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancelled_by', nullable: true, type: 'varchar' })
  cancelledBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

> The `date` column needs a transformer because node-postgres parses SQL `DATE` values into JS `Date` objects by default; without it, reads would return a `Date` where the rest of the codebase (and this entity's own `to` side) expects a `'YYYY-MM-DD'` string.

- [ ] **Step 2: Create the BookingSlot entity**

Create `apps/api/src/bookings/entities/booking-slot.entity.ts`:

```typescript
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('booking_slots')
@Index(['courtId', 'date', 'slotStart'], { unique: true })
export class BookingSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id' })
  bookingId: string;

  @Column({ name: 'court_id' })
  courtId: string;

  @Column({
    type: 'date',
    transformer: {
      to: (value: string) => value,
      from: (value: Date) => value.toISOString().slice(0, 10),
    },
  })
  date: string;

  @Column({ name: 'slot_start', type: 'time' })
  slotStart: string;
}
```

- [ ] **Step 3: Generate and run the migration**

Ensure Postgres is running: `docker-compose up -d postgres` (from repo root).

Run: `cd apps/api && npm run migration:generate -- src/migrations/CreateBookings`
Expected: creates `apps/api/src/migrations/<timestamp>-CreateBookings.ts`. Open it and confirm the `up()` method creates a `bookings` table with a `status` enum type, and a `booking_slots` table with a **unique** index/constraint covering `court_id`, `date`, `slot_start` (look for `CREATE UNIQUE INDEX` or a `UNIQUE` constraint referencing all three columns).

Run: `cd apps/api && npm run migration:run`
Expected: output includes `CreateBookings<timestamp> has been executed successfully`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/bookings/entities apps/api/src/migrations/*CreateBookings.ts
git commit -m "feat(api): add Booking and BookingSlot entities"
```

---

### Task 4: Slot-alignment pure function (booking-slot-generator)

**Files:**
- Create: `apps/api/src/bookings/booking-slot-generator.ts`
- Test: `apps/api/src/bookings/booking-slot-generator.spec.ts`

**Interfaces:**
- Produces: `generateBookingSlotStarts(startTime: string, endTime: string, grid: { openTime: string; closeTime: string; slotDurationMinutes: number }): string[] | null` — returns the list of slot-unit start times (e.g. `['08:00', '09:00']`) covered by `[startTime, endTime)`, or `null` if the range is empty, outside `[openTime, closeTime]`, or not aligned to the grid.
- Consumed by: `BookingsService.create` (Task 5).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/bookings/booking-slot-generator.spec.ts`:

```typescript
import { generateBookingSlotStarts } from './booking-slot-generator';

const GRID = { openTime: '08:00', closeTime: '20:00', slotDurationMinutes: 60 };

describe('generateBookingSlotStarts', () => {
  it('returns one slot start for a single-slot booking', () => {
    expect(generateBookingSlotStarts('08:00', '09:00', GRID)).toEqual(['08:00']);
  });

  it('returns multiple consecutive slot starts for a multi-slot booking', () => {
    expect(generateBookingSlotStarts('08:00', '10:00', GRID)).toEqual([
      '08:00',
      '09:00',
    ]);
  });

  it('returns null when start is not aligned to the grid', () => {
    expect(generateBookingSlotStarts('08:30', '09:30', GRID)).toBeNull();
  });

  it('returns null when the range duration is not a multiple of slot duration', () => {
    expect(generateBookingSlotStarts('08:00', '08:30', GRID)).toBeNull();
  });

  it('returns null when start is before openTime', () => {
    expect(generateBookingSlotStarts('07:00', '08:00', GRID)).toBeNull();
  });

  it('returns null when end is after closeTime', () => {
    expect(generateBookingSlotStarts('19:00', '21:00', GRID)).toBeNull();
  });

  it('returns null when start is not before end', () => {
    expect(generateBookingSlotStarts('09:00', '09:00', GRID)).toBeNull();
    expect(generateBookingSlotStarts('10:00', '09:00', GRID)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest booking-slot-generator.spec.ts`
Expected: FAIL — cannot find module `./booking-slot-generator`.

- [ ] **Step 3: Implement generateBookingSlotStarts**

Create `apps/api/src/bookings/booking-slot-generator.ts`:

```typescript
import { timeToMinutes } from '../courts/time.util';

export interface CourtGrid {
  openTime: string;
  closeTime: string;
  slotDurationMinutes: number;
}

function toTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function generateBookingSlotStarts(
  startTime: string,
  endTime: string,
  grid: CourtGrid,
): string[] | null {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const open = timeToMinutes(grid.openTime);
  const close = timeToMinutes(grid.closeTime);
  const duration = grid.slotDurationMinutes;

  if (start >= end) return null;
  if (start < open || end > close) return null;
  if ((start - open) % duration !== 0) return null;
  if ((end - start) % duration !== 0) return null;

  const starts: string[] = [];
  for (let t = start; t < end; t += duration) {
    starts.push(toTimeString(t));
  }
  return starts;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest booking-slot-generator.spec.ts`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/booking-slot-generator.ts apps/api/src/bookings/booking-slot-generator.spec.ts
git commit -m "feat(api): add booking slot-alignment generator"
```

---

### Task 5: BookingsService.create (transaction + double-booking conflict)

**Files:**
- Create: `apps/api/src/bookings/dto/create-booking.dto.ts`
- Create: `apps/api/src/bookings/bookings.service.ts`
- Test: `apps/api/src/bookings/bookings.service.spec.ts`

**Interfaces:**
- Consumes: `CourtsService.findByIdOrThrow` (Task 2), `VenuesService.findByIdOrThrow` (Task 2), `generateBookingSlotStarts` (Task 4), `Booking`/`BookingStatus`/`BookingSlot` (Task 3).
- Produces: `BookingsService.create(customerId: string, dto: CreateBookingDto): Promise<Booking>` — throws `BadRequestException` for invalid date/time/alignment, `NotFoundException` for a missing/inactive court or venue, `ConflictException` (409) when any slot is already taken.
- Produces (for later tasks): `BookingsService` constructor shape — `bookingsRepository: Repository<Booking>`, `bookingSlotsRepository: Repository<BookingSlot>`, `courtsService: CourtsService`, `venuesService: VenuesService`, `dataSource: DataSource`. Tasks 6-8 add methods to this same class/file.

- [ ] **Step 1: Create the DTO**

Create `apps/api/src/bookings/dto/create-booking.dto.ts`:

```typescript
import { IsString, Matches, MinLength } from 'class-validator';
import { TIME_PATTERN } from '../../courts/time.util';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateBookingDto {
  @IsString()
  @MinLength(1)
  courtId: string;

  @Matches(DATE_PATTERN, { message: 'date phải theo định dạng YYYY-MM-DD' })
  date: string;

  @Matches(TIME_PATTERN, { message: 'startTime phải theo định dạng HH:mm' })
  startTime: string;

  @Matches(TIME_PATTERN, { message: 'endTime phải theo định dạng HH:mm' })
  endTime: string;
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/api/src/bookings/bookings.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { BookingsService } from './bookings.service';
import { Booking, BookingStatus } from './entities/booking.entity';
import { BookingSlot } from './entities/booking-slot.entity';
import { CourtsService } from '../courts/courts.service';
import { VenuesService } from '../courts/venues.service';
import { VenueStatus } from '../courts/entities/venue.entity';

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
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
};

const mockBookingSlotsRepository = () => ({
  find: jest.fn(),
});

const mockCourtsService = () => ({
  findByIdOrThrow: jest.fn(),
  findByVenueForOwner: jest.fn(),
  getSlotsForDate: jest.fn(),
});

const mockVenuesService = () => ({
  findByIdOrThrow: jest.fn(),
  getOwnedVenueOrThrow: jest.fn(),
});

function buildMockManager() {
  return {
    create: jest.fn((_entity: unknown, data: unknown) => data),
    save: jest.fn((data: unknown) =>
      Array.isArray(data)
        ? Promise.resolve(data)
        : Promise.resolve({ id: 'booking-1', ...(data as object) }),
    ),
    delete: jest.fn(),
  };
}

const mockDataSource = () => ({
  transaction: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      BookingsService,
      {
        provide: getRepositoryToken(Booking),
        useFactory: mockBookingsRepository,
      },
      {
        provide: getRepositoryToken(BookingSlot),
        useFactory: mockBookingSlotsRepository,
      },
      { provide: CourtsService, useFactory: mockCourtsService },
      { provide: VenuesService, useFactory: mockVenuesService },
      { provide: DataSource, useFactory: mockDataSource },
    ],
  }).compile();

  return {
    service: module.get(BookingsService),
    bookingsRepo: module.get(getRepositoryToken(Booking)) as ReturnType<
      typeof mockBookingsRepository
    >,
    bookingSlotsRepo: module.get(
      getRepositoryToken(BookingSlot),
    ) as ReturnType<typeof mockBookingSlotsRepository>,
    courtsService: module.get(CourtsService) as ReturnType<
      typeof mockCourtsService
    >,
    venuesService: module.get(VenuesService) as ReturnType<
      typeof mockVenuesService
    >,
    dataSource: module.get(DataSource) as ReturnType<typeof mockDataSource>,
  };
}

describe('BookingsService.create', () => {
  const FIXED_TODAY = new Date('2026-08-24T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_TODAY);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const ACTIVE_COURT = {
    id: 'court-1',
    venueId: 'venue-1',
    isActive: true,
    openTime: '08:00',
    closeTime: '20:00',
    slotDurationMinutes: 60,
    pricePerHour: 100000,
  };
  const ACTIVE_VENUE = { id: 'venue-1', status: VenueStatus.ACTIVE };

  it('creates a booking with one booking_slots row per unit slot', async () => {
    const { service, courtsService, venuesService, dataSource } =
      await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    const manager = buildMockManager();
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.create('customer-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '10:00',
    });

    expect(result.totalPrice).toBe(200000);
    expect(result.status).toBe(BookingStatus.CONFIRMED);
    const slotSaveCall = manager.save.mock.calls.find((call) =>
      Array.isArray(call[0]),
    );
    expect(slotSaveCall![0]).toHaveLength(2);
    expect(slotSaveCall![0].map((s: { slotStart: string }) => s.slotStart)).toEqual([
      '08:00',
      '09:00',
    ]);
  });

  it('throws ConflictException when a slot is already taken', async () => {
    const { service, courtsService, venuesService, dataSource } =
      await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    const uniqueViolation = Object.assign(
      new QueryFailedError('INSERT', [], new Error('dup')),
      { code: '23505' },
    );
    dataSource.transaction.mockRejectedValue(uniqueViolation);

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:00',
        endTime: '09:00',
      }),
    ).rejects.toThrow('Một hoặc nhiều khung giờ đã được đặt');
  });

  it('throws BadRequestException for a date in the past', async () => {
    const { service } = await buildTestingModule();

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-01',
        startTime: '08:00',
        endTime: '09:00',
      }),
    ).rejects.toThrow('Không thể đặt sân cho ngày trong quá khứ');
  });

  it('throws BadRequestException when the time range is not aligned to the slot grid', async () => {
    const { service, courtsService, venuesService } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:30',
        endTime: '09:30',
      }),
    ).rejects.toThrow(
      'Khung giờ đặt không hợp lệ hoặc không thẳng hàng với slot của sân',
    );
  });

  it('throws NotFoundException when the court is inactive', async () => {
    const { service, courtsService, venuesService } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue({
      ...ACTIVE_COURT,
      isActive: false,
    });
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:00',
        endTime: '09:00',
      }),
    ).rejects.toThrow('Court court-1 không tồn tại');
  });

  it('throws NotFoundException when the venue is not active', async () => {
    const { service, courtsService, venuesService } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      status: VenueStatus.PENDING_APPROVAL,
    });

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:00',
        endTime: '09:00',
      }),
    ).rejects.toThrow('Court court-1 không tồn tại');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/api && npx jest bookings.service.spec.ts`
Expected: FAIL — cannot find module `./bookings.service`.

- [ ] **Step 4: Implement BookingsService.create**

Create `apps/api/src/bookings/bookings.service.ts`:

```typescript
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { Booking, BookingStatus } from './entities/booking.entity';
import { BookingSlot } from './entities/booking-slot.entity';
import { CourtsService } from '../courts/courts.service';
import { VenuesService } from '../courts/venues.service';
import { VenueStatus } from '../courts/entities/venue.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { generateBookingSlotStarts } from './booking-slot-generator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UNIQUE_VIOLATION_CODE = '23505';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(BookingSlot)
    private readonly bookingSlotsRepository: Repository<BookingSlot>,
    private readonly courtsService: CourtsService,
    private readonly venuesService: VenuesService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(customerId: string, dto: CreateBookingDto): Promise<Booking> {
    if (!DATE_PATTERN.test(dto.date)) {
      throw new BadRequestException('date phải theo định dạng YYYY-MM-DD');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (dto.date < today) {
      throw new BadRequestException(
        'Không thể đặt sân cho ngày trong quá khứ',
      );
    }

    const court = await this.courtsService.findByIdOrThrow(dto.courtId);
    if (!court.isActive) {
      throw new NotFoundException(`Court ${dto.courtId} không tồn tại`);
    }
    const venue = await this.venuesService.findByIdOrThrow(court.venueId);
    if (venue.status !== VenueStatus.ACTIVE) {
      throw new NotFoundException(`Court ${dto.courtId} không tồn tại`);
    }

    const slotStarts = generateBookingSlotStarts(dto.startTime, dto.endTime, {
      openTime: court.openTime,
      closeTime: court.closeTime,
      slotDurationMinutes: court.slotDurationMinutes,
    });
    if (!slotStarts) {
      throw new BadRequestException(
        'Khung giờ đặt không hợp lệ hoặc không thẳng hàng với slot của sân',
      );
    }

    const pricePerSlot = court.pricePerHour * (court.slotDurationMinutes / 60);
    const totalPrice = Math.round(pricePerSlot * slotStarts.length * 100) / 100;

    try {
      return await this.dataSource.transaction(async (manager) => {
        const booking = manager.create(Booking, {
          courtId: dto.courtId,
          customerId,
          date: dto.date,
          startTime: dto.startTime,
          endTime: dto.endTime,
          totalPrice,
          status: BookingStatus.CONFIRMED,
        });
        const savedBooking = await manager.save(booking);

        const slots = slotStarts.map((slotStart) =>
          manager.create(BookingSlot, {
            bookingId: savedBooking.id,
            courtId: dto.courtId,
            date: dto.date,
            slotStart,
          }),
        );
        await manager.save(slots);

        return savedBooking;
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as unknown as { code?: string }).code === UNIQUE_VIOLATION_CODE
      ) {
        throw new ConflictException('Một hoặc nhiều khung giờ đã được đặt');
      }
      throw error;
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest bookings.service.spec.ts`
Expected: PASS (all 6 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/bookings/dto/create-booking.dto.ts apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.service.spec.ts
git commit -m "feat(api): add BookingsService.create with transactional conflict handling"
```

---

### Task 6: Customer read/cancel (findMineByCustomer, findMineById, cancelByCustomer)

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts`
- Modify: `apps/api/src/bookings/bookings.service.spec.ts`

**Interfaces:**
- Produces: `BookingsService.findMineByCustomer(customerId: string): Promise<Booking[]>`, `.findMineById(customerId: string, id: string): Promise<Booking>`, `.cancelByCustomer(customerId: string, id: string): Promise<Booking>`.
- Produces (private, reused by Task 7): `completePastBookings(): Promise<void>`, `cancel(booking: Booking, cancelledBy: string): Promise<Booking>`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/bookings/bookings.service.spec.ts` (add `ForbiddenException` is not needed as an import — the test only checks the thrown message):

```typescript
describe('BookingsService.findMineByCustomer', () => {
  it('completes past bookings before listing, ordered newest first', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.find.mockResolvedValue([{ id: 'booking-1' }]);

    const result = await service.findMineByCustomer('customer-1');

    expect(bookingsRepo.createQueryBuilder().execute).toHaveBeenCalled();
    expect(bookingsRepo.find).toHaveBeenCalledWith({
      where: { customerId: 'customer-1' },
      order: { date: 'DESC', startTime: 'DESC' },
    });
    expect(result).toEqual([{ id: 'booking-1' }]);
  });
});

describe('BookingsService.findMineById', () => {
  it('throws NotFoundException when the booking does not belong to the customer', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findMineById('customer-1', 'booking-1'),
    ).rejects.toThrow('Booking booking-1 không tồn tại');
  });
});

describe('BookingsService.cancelByCustomer', () => {
  const FIXED_NOW = new Date('2026-08-24T10:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('cancels a booking outside the cutoff window and frees its slots', async () => {
    const { service, bookingsRepo, courtsService, venuesService, dataSource } =
      await buildTestingModule();
    const booking = {
      id: 'booking-1',
      customerId: 'customer-1',
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '10:00',
      status: BookingStatus.CONFIRMED,
    };
    bookingsRepo.findOne.mockResolvedValue(booking);
    courtsService.findByIdOrThrow.mockResolvedValue({ venueId: 'venue-1' });
    venuesService.findByIdOrThrow.mockResolvedValue({
      cancellationCutoffHours: 2,
    });
    const manager = {
      save: jest.fn((data: unknown) => Promise.resolve(data)),
      delete: jest.fn(),
    };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.cancelByCustomer('customer-1', 'booking-1');

    expect(result.status).toBe(BookingStatus.CANCELLED);
    expect(result.cancelledBy).toBe('customer-1');
    expect(manager.delete).toHaveBeenCalledWith(BookingSlot, {
      bookingId: 'booking-1',
    });
  });

  it('throws ForbiddenException inside the cutoff window', async () => {
    const { service, bookingsRepo, courtsService, venuesService } =
      await buildTestingModule();
    bookingsRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      customerId: 'customer-1',
      courtId: 'court-1',
      date: '2026-08-24',
      startTime: '11:00',
      status: BookingStatus.CONFIRMED,
    });
    courtsService.findByIdOrThrow.mockResolvedValue({ venueId: 'venue-1' });
    venuesService.findByIdOrThrow.mockResolvedValue({
      cancellationCutoffHours: 2,
    });

    await expect(
      service.cancelByCustomer('customer-1', 'booking-1'),
    ).rejects.toThrow('Không thể huỷ trong vòng 2 giờ trước giờ chơi');
  });

  it('throws NotFoundException when the booking does not belong to the customer', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.cancelByCustomer('customer-1', 'booking-1'),
    ).rejects.toThrow('Booking booking-1 không tồn tại');
  });

  it('throws BadRequestException when the booking is not confirmed', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      customerId: 'customer-1',
      status: BookingStatus.CANCELLED,
    });

    await expect(
      service.cancelByCustomer('customer-1', 'booking-1'),
    ).rejects.toThrow('Chỉ có thể huỷ booking đang confirmed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest bookings.service.spec.ts`
Expected: FAIL — `service.findMineByCustomer`, `.findMineById`, `.cancelByCustomer` are not functions.

- [ ] **Step 3: Implement the new methods**

In `apps/api/src/bookings/bookings.service.ts`, add `ForbiddenException` to the `@nestjs/common` import list, then add these methods to the class (after `create`):

```typescript
  async findMineByCustomer(customerId: string): Promise<Booking[]> {
    await this.completePastBookings();
    return this.bookingsRepository.find({
      where: { customerId },
      order: { date: 'DESC', startTime: 'DESC' },
    });
  }

  async findMineById(customerId: string, id: string): Promise<Booking> {
    await this.completePastBookings();
    const booking = await this.bookingsRepository.findOne({
      where: { id, customerId },
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${id} không tồn tại`);
    }
    return booking;
  }

  async cancelByCustomer(customerId: string, id: string): Promise<Booking> {
    const booking = await this.bookingsRepository.findOne({
      where: { id, customerId },
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${id} không tồn tại`);
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Chỉ có thể huỷ booking đang confirmed');
    }

    const court = await this.courtsService.findByIdOrThrow(booking.courtId);
    const venue = await this.venuesService.findByIdOrThrow(court.venueId);
    // Simplification: treat date+time as UTC, matching CourtsService's
    // date-string handling — no per-venue timezone support in MVP.
    const startsAtMs = new Date(
      `${booking.date}T${booking.startTime}:00Z`,
    ).getTime();
    const cutoffMs = venue.cancellationCutoffHours * 60 * 60 * 1000;
    if (Date.now() >= startsAtMs - cutoffMs) {
      throw new ForbiddenException(
        `Không thể huỷ trong vòng ${venue.cancellationCutoffHours} giờ trước giờ chơi`,
      );
    }

    return this.cancel(booking, customerId);
  }

  private async cancel(
    booking: Booking,
    cancelledBy: string,
  ): Promise<Booking> {
    return this.dataSource.transaction(async (manager) => {
      booking.status = BookingStatus.CANCELLED;
      booking.cancelledAt = new Date();
      booking.cancelledBy = cancelledBy;
      const saved = await manager.save(booking);
      await manager.delete(BookingSlot, { bookingId: booking.id });
      return saved;
    });
  }

  private async completePastBookings(): Promise<void> {
    await this.bookingsRepository
      .createQueryBuilder()
      .update(Booking)
      .set({ status: BookingStatus.COMPLETED })
      .where('status = :confirmed', { confirmed: BookingStatus.CONFIRMED })
      .andWhere(`(date + end_time) < now()`)
      .execute();
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest bookings.service.spec.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.service.spec.ts
git commit -m "feat(api): add customer booking list/detail/cancel with cutoff enforcement"
```

---

### Task 7: Owner read/cancel (findByVenueForOwner, cancelByOwner)

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts`
- Modify: `apps/api/src/bookings/bookings.service.spec.ts`

**Interfaces:**
- Consumes: `CourtsService.findByVenueForOwner(ownerId: string, venueId: string): Promise<Court[]>` (already exists on `CourtsService`).
- Produces: `BookingsService.findByVenueForOwner(ownerId: string, venueId: string, filters: { date?: string; courtId?: string }): Promise<Booking[]>`, `.cancelByOwner(ownerId: string, venueId: string, id: string): Promise<Booking>`.

- [ ] **Step 1: Write the failing tests**

`mockCourtsService` in `apps/api/src/bookings/bookings.service.spec.ts` already declares `findByVenueForOwner: jest.fn()` (added in Task 5 alongside `findByIdOrThrow`/`getSlotsForDate`), so no change to the mock is needed. Add these new `describe` blocks to the file:

```typescript
describe('BookingsService.findByVenueForOwner', () => {
  it('lists bookings for every court in the venue', async () => {
    const { service, bookingsRepo, courtsService } = await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([
      { id: 'court-1' },
      { id: 'court-2' },
    ]);
    bookingsRepo.find.mockResolvedValue([{ id: 'booking-1' }]);

    const result = await service.findByVenueForOwner('owner-1', 'venue-1', {});

    expect(courtsService.findByVenueForOwner).toHaveBeenCalledWith(
      'owner-1',
      'venue-1',
    );
    expect(bookingsRepo.find).toHaveBeenCalledWith({
      where: { courtId: expect.anything() },
      order: { date: 'ASC', startTime: 'ASC' },
    });
    expect(result).toEqual([{ id: 'booking-1' }]);
  });

  it('filters to a single court when courtId is provided', async () => {
    const { service, bookingsRepo, courtsService } = await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([
      { id: 'court-1' },
      { id: 'court-2' },
    ]);
    bookingsRepo.find.mockResolvedValue([]);

    await service.findByVenueForOwner('owner-1', 'venue-1', {
      courtId: 'court-2',
    });

    const whereArg = bookingsRepo.find.mock.calls[0][0].where;
    expect(whereArg.courtId.value).toEqual(['court-2']);
  });
});

describe('BookingsService.cancelByOwner', () => {
  it('cancels a booking belonging to the venue regardless of cutoff', async () => {
    const { service, bookingsRepo, courtsService, dataSource } =
      await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([{ id: 'court-1' }]);
    bookingsRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      courtId: 'court-1',
      status: BookingStatus.CONFIRMED,
    });
    const manager = {
      save: jest.fn((data: unknown) => Promise.resolve(data)),
      delete: jest.fn(),
    };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.cancelByOwner('owner-1', 'venue-1', 'booking-1');

    expect(result.status).toBe(BookingStatus.CANCELLED);
    expect(result.cancelledBy).toBe('owner-1');
  });

  it('throws NotFoundException when the booking is not on any court in the venue', async () => {
    const { service, bookingsRepo, courtsService } = await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([{ id: 'court-1' }]);
    bookingsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.cancelByOwner('owner-1', 'venue-1', 'booking-1'),
    ).rejects.toThrow('Booking booking-1 không tồn tại');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest bookings.service.spec.ts`
Expected: FAIL — `service.findByVenueForOwner`, `.cancelByOwner` are not functions.

- [ ] **Step 3: Implement the new methods**

In `apps/api/src/bookings/bookings.service.ts`, add `In` to the `typeorm` import (`import { DataSource, In, QueryFailedError, Repository } from 'typeorm';`), then add these methods (after `cancelByCustomer`):

```typescript
  async findByVenueForOwner(
    ownerId: string,
    venueId: string,
    filters: { date?: string; courtId?: string },
  ): Promise<Booking[]> {
    await this.completePastBookings();
    const courts = await this.courtsService.findByVenueForOwner(
      ownerId,
      venueId,
    );
    const courtIds = filters.courtId
      ? courts
          .filter((court) => court.id === filters.courtId)
          .map((court) => court.id)
      : courts.map((court) => court.id);

    return this.bookingsRepository.find({
      where: {
        courtId: In(courtIds.length > 0 ? courtIds : ['__none__']),
        ...(filters.date ? { date: filters.date } : {}),
      },
      order: { date: 'ASC', startTime: 'ASC' },
    });
  }

  async cancelByOwner(
    ownerId: string,
    venueId: string,
    id: string,
  ): Promise<Booking> {
    const courts = await this.courtsService.findByVenueForOwner(
      ownerId,
      venueId,
    );
    const courtIds = courts.map((court) => court.id);
    const booking = await this.bookingsRepository.findOne({
      where: { id, courtId: In(courtIds.length > 0 ? courtIds : ['__none__']) },
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${id} không tồn tại`);
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Chỉ có thể huỷ booking đang confirmed');
    }
    return this.cancel(booking, ownerId);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest bookings.service.spec.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.service.spec.ts
git commit -m "feat(api): add owner-scoped booking list/cancel"
```

---

### Task 8: Public availability endpoint logic (getAvailability)

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts`
- Modify: `apps/api/src/bookings/bookings.service.spec.ts`

**Interfaces:**
- Consumes: `CourtsService.getSlotsForDate(courtId: string, date: string): Promise<Slot[]>` (already exists, unchanged).
- Produces: `BookingsService.getAvailability(courtId: string, date: string): Promise<Array<Slot & { isBooked: boolean }>>`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/bookings/bookings.service.spec.ts`:

```typescript
describe('BookingsService.getAvailability', () => {
  it('marks slots that already have a booking_slots row as booked', async () => {
    const { service, courtsService, bookingSlotsRepo } =
      await buildTestingModule();
    courtsService.getSlotsForDate.mockResolvedValue([
      { start: '08:00', end: '09:00', price: 100000 },
      { start: '09:00', end: '10:00', price: 100000 },
    ]);
    bookingSlotsRepo.find.mockResolvedValue([{ slotStart: '08:00' }]);

    const result = await service.getAvailability('court-1', '2026-08-25');

    expect(bookingSlotsRepo.find).toHaveBeenCalledWith({
      where: { courtId: 'court-1', date: '2026-08-25' },
    });
    expect(result).toEqual([
      { start: '08:00', end: '09:00', price: 100000, isBooked: true },
      { start: '09:00', end: '10:00', price: 100000, isBooked: false },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest bookings.service.spec.ts`
Expected: FAIL — `service.getAvailability` is not a function.

- [ ] **Step 3: Implement getAvailability**

In `apps/api/src/bookings/bookings.service.ts`, add `import { Slot } from '../courts/slot-generator';` near the top, then add this method (after `cancelByOwner`):

```typescript
  async getAvailability(
    courtId: string,
    date: string,
  ): Promise<Array<Slot & { isBooked: boolean }>> {
    const slots = await this.courtsService.getSlotsForDate(courtId, date);
    const bookedSlots = await this.bookingSlotsRepository.find({
      where: { courtId, date },
    });
    const bookedStarts = new Set(bookedSlots.map((slot) => slot.slotStart));
    return slots.map((slot) => ({
      ...slot,
      isBooked: bookedStarts.has(slot.start),
    }));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest bookings.service.spec.ts`
Expected: PASS (all tests in the file — should be 16 tests total across Tasks 5-8).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.service.spec.ts
git commit -m "feat(api): add public slot availability lookup"
```

---

### Task 9: BookingsController, BookingsModule, and AppModule wiring

**Files:**
- Create: `apps/api/src/bookings/bookings.controller.ts`
- Create: `apps/api/src/bookings/bookings.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: every public `BookingsService` method from Tasks 5-8.
- Produces: HTTP routes exactly as listed in spec §4 (`POST /bookings`, `GET /bookings/mine`, `GET /bookings/mine/:id`, `POST /bookings/:id/cancel`, `GET /venues/mine/:venueId/bookings`, `POST /venues/mine/:venueId/bookings/:id/cancel`, `GET /bookings/availability`).

No unit tests for the controller — this codebase's convention (see `CourtsController`, `VenuesController`, `AdminController`) is to cover controllers via e2e tests only, which Task 11 provides.

- [ ] **Step 1: Create the controller**

Create `apps/api/src/bookings/bookings.controller.ts`:

```typescript
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post('bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.create(user.userId, dto);
  }

  @Get('bookings/mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.findMineByCustomer(user.userId);
  }

  @Get('bookings/mine/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  findMineById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.bookingsService.findMineById(user.userId, id);
  }

  @Post('bookings/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  cancelMine(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookingsService.cancelByCustomer(user.userId, id);
  }

  @Get('venues/mine/:venueId/bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  findForVenue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Query('date') date?: string,
    @Query('courtId') courtId?: string,
  ) {
    return this.bookingsService.findByVenueForOwner(user.userId, venueId, {
      date,
      courtId,
    });
  }

  @Post('venues/mine/:venueId/bookings/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  cancelForVenue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.bookingsService.cancelByOwner(user.userId, venueId, id);
  }

  @Get('bookings/availability')
  getAvailability(
    @Query('courtId') courtId: string,
    @Query('date') date: string,
  ) {
    return this.bookingsService.getAvailability(courtId, date);
  }
}
```

- [ ] **Step 2: Create the module**

Create `apps/api/src/bookings/bookings.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { BookingSlot } from './entities/booking-slot.entity';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { CourtsModule } from '../courts/courts.module';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, BookingSlot]), CourtsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
```

- [ ] **Step 3: Wire BookingsModule into AppModule**

In `apps/api/src/app.module.ts`, add the import:

```typescript
import { BookingsModule } from './bookings/bookings.module';
```

And add `BookingsModule` to the `imports` array, after `CourtsModule`:

```typescript
    UsersModule,
    MailModule,
    AuthModule,
    AdminModule,
    CourtsModule,
    BookingsModule,
```

- [ ] **Step 4: Verify the app still boots and unit tests pass**

Run: `cd apps/api && npx jest`
Expected: PASS (all unit test suites, no compile errors from the new module wiring).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/bookings.controller.ts apps/api/src/bookings/bookings.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): wire up BookingsModule and expose booking routes"
```

---

### Task 10: Update e2e test-app util for the new tables

**Files:**
- Modify: `apps/api/test/utils/test-app.ts`

**Interfaces:**
- Produces: `clearDatabase(app)` now also truncates `venues`, `venue_images`, `courts`, `bookings`, `booking_slots` (previously it only truncated the users/auth tables — there were no e2e tests exercising Courts yet, so this gap was latent).

- [ ] **Step 1: Update clearDatabase**

In `apps/api/test/utils/test-app.ts`, replace the `clearDatabase` function body:

```typescript
export async function clearDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  await dataSource.query(
    'TRUNCATE TABLE booking_slots, bookings, venue_images, courts, venues, refresh_tokens, password_reset_tokens, email_verification_tokens, users RESTART IDENTITY CASCADE',
  );
}
```

- [ ] **Step 2: Run the existing e2e suite to confirm nothing broke**

Ensure Postgres is running: `docker-compose up -d postgres` (from repo root).

Run: `cd apps/api && npm run test:e2e`
Expected: PASS (all existing e2e suites — `admin-owners`, `auth-*`, `users-profile`, `app` — still pass with the wider truncate list).

- [ ] **Step 3: Commit**

```bash
git add apps/api/test/utils/test-app.ts
git commit -m "test(api): truncate venue/court/booking tables between e2e tests"
```

---

### Task 11: End-to-end tests for the full booking flow

**Files:**
- Create: `apps/api/test/bookings.e2e-spec.ts`

**Interfaces:**
- Consumes: every route from Task 9, `createTestApp`/`clearDatabase` from `test/utils/test-app.ts`.

This task runs against a **real Postgres** database (no mocked repositories) specifically to prove the unique-index-based conflict detection (spec §5, §7) works under real concurrency — that guarantee cannot be verified with mocks.

- [ ] **Step 1: Write the e2e test file**

Create `apps/api/test/bookings.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court } from '../src/courts/entities/court.entity';

describe('Bookings (e2e)', () => {
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

  async function createActiveUserAndLogin(
    email: string,
    role: UserRole,
  ): Promise<{ userId: string; token: string }> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const repo = dataSource.getRepository(User);
    const user = await repo.save(
      repo.create({
        email,
        passwordHash,
        fullName: 'Test User',
        role,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' });
    return {
      userId: user.id,
      token: loginResponse.body.accessToken as string,
    };
  }

  async function createActiveVenueAndCourt(
    ownerId: string,
    cancellationCutoffHours = 2,
  ): Promise<{ venueId: string; courtId: string }> {
    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId,
        name: 'Sân ABC',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
        cancellationCutoffHours,
      }),
    );
    const courtsRepo = dataSource.getRepository(Court);
    const court = await courtsRepo.save(
      courtsRepo.create({
        venueId: venue.id,
        name: 'Sân 1',
        pricePerHour: 100000,
        openTime: '08:00',
        closeTime: '20:00',
        slotDurationMinutes: 60,
        isActive: true,
      }),
    );
    return { venueId: venue.id, courtId: court.id };
  }

  it('books a slot, shows it as booked in availability, and lists it under /bookings/mine', async () => {
    const owner = await createActiveUserAndLogin(
      'owner1@test.com',
      UserRole.OWNER,
    );
    const { courtId } = await createActiveVenueAndCourt(owner.userId);
    const customer = await createActiveUserAndLogin(
      'customer1@test.com',
      UserRole.CUSTOMER,
    );

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        courtId,
        date: '2099-01-01',
        startTime: '08:00',
        endTime: '09:00',
      })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      courtId,
      status: 'confirmed',
      totalPrice: 100000,
    });

    const availability = await request(app.getHttpServer())
      .get('/bookings/availability')
      .query({ courtId, date: '2099-01-01' })
      .expect(200);
    expect(availability.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          start: '08:00',
          end: '09:00',
          isBooked: true,
        }),
        expect.objectContaining({ start: '09:00', isBooked: false }),
      ]),
    );

    const mine = await request(app.getHttpServer())
      .get('/bookings/mine')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].id).toBe(createResponse.body.id);
  });

  it('rejects a concurrent second booking for the same slot with 409', async () => {
    const owner = await createActiveUserAndLogin(
      'owner2@test.com',
      UserRole.OWNER,
    );
    const { courtId } = await createActiveVenueAndCourt(owner.userId);
    const customerA = await createActiveUserAndLogin(
      'customerA@test.com',
      UserRole.CUSTOMER,
    );
    const customerB = await createActiveUserAndLogin(
      'customerB@test.com',
      UserRole.CUSTOMER,
    );

    const [responseA, responseB] = await Promise.all([
      request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${customerA.token}`)
        .send({
          courtId,
          date: '2099-01-02',
          startTime: '08:00',
          endTime: '09:00',
        }),
      request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${customerB.token}`)
        .send({
          courtId,
          date: '2099-01-02',
          startTime: '08:00',
          endTime: '09:00',
        }),
    ]);

    const statuses = [responseA.status, responseB.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('blocks customer cancellation inside the cutoff window but allows owner cancellation', async () => {
    const owner = await createActiveUserAndLogin(
      'owner3@test.com',
      UserRole.OWNER,
    );
    const { venueId, courtId } = await createActiveVenueAndCourt(
      owner.userId,
      9999,
    );
    const customer = await createActiveUserAndLogin(
      'customer3@test.com',
      UserRole.CUSTOMER,
    );

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        courtId,
        date: '2099-01-03',
        startTime: '08:00',
        endTime: '09:00',
      })
      .expect(201);
    const bookingId = createResponse.body.id;

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/venues/mine/${venueId}/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(201);

    const availability = await request(app.getHttpServer())
      .get('/bookings/availability')
      .query({ courtId, date: '2099-01-03' })
      .expect(200);
    expect(availability.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ start: '08:00', isBooked: false }),
      ]),
    );
  });

  it('lists venue bookings for the owner', async () => {
    const owner = await createActiveUserAndLogin(
      'owner4@test.com',
      UserRole.OWNER,
    );
    const { venueId, courtId } = await createActiveVenueAndCourt(owner.userId);
    const customer = await createActiveUserAndLogin(
      'customer4@test.com',
      UserRole.CUSTOMER,
    );
    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        courtId,
        date: '2099-01-04',
        startTime: '08:00',
        endTime: '09:00',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/bookings`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ courtId, date: '2099-01-04' });
  });
});
```

- [ ] **Step 2: Run the e2e test to verify it passes**

Ensure Postgres is running: `docker-compose up -d postgres` (from repo root), and migrations are up to date: `cd apps/api && npm run migration:run`.

Run: `cd apps/api && npm run test:e2e -- bookings.e2e-spec.ts`
Expected: PASS (all 4 tests, including the concurrent-conflict test — if it flakes, re-run once; `Promise.all` timing against a real DB connection pool is the one place true nondeterminism could theoretically appear, but the unique index guarantees exactly one of the two requests gets `201` and the other `409` every time).

- [ ] **Step 3: Run the full test suite one more time**

Run: `cd apps/api && npx jest && npm run test:e2e`
Expected: PASS (every unit and e2e suite in the project).

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/bookings.e2e-spec.ts
git commit -m "test(api): add e2e coverage for the booking flow and conflict handling"
```
