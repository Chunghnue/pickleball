# Đặt Sân Online — Module Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `POST /bookings` work without a login (guest checkout), per [2026-09-05-dat-san-online-design.md](../specs/2026-09-05-dat-san-online-design.md) — unblocking the frontend plan that builds the standalone `/dat-san` page.

**Architecture:** No new module. `bookings` already belongs to `BookingsModule`/`BookingsService`/`BookingsController`. Add a `contact_name`/`contact_phone`/`contact_email` snapshot on the `bookings` table (populated for every booking created through this endpoint, logged-in or not), swap the endpoint's guard for a new `OptionalJwtAuthGuard` that never rejects a request for lacking a token, and teach the owner-facing booking list to prefer that snapshot over the existing `customerId`/`customerContactId` joins.

**Tech Stack:** NestJS 11, TypeORM (raw-SQL migrations, no `synchronize`), class-validator, Jest (unit specs mocked-repo style in `*.service.spec.ts`, e2e specs against a real `pickleball_test` Postgres DB via Supertest in `apps/api/test/*.e2e-spec.ts`, `jest-e2e.json` runs with `maxWorkers: 1`).

## Global Constraints

- `POST /bookings` accepts requests with or without a valid `Authorization: Bearer` JWT. A valid token whose role is `customer` attaches `customerId`; anything else (no token, expired/invalid token, or a non-customer role) is treated as a guest — `customerId: null`. It never returns 401 for a missing/invalid token.
- `contactName` and `contactPhone` are **required on every booking created through this endpoint**, logged-in or not. `contactEmail` and `note` stay optional.
- A guest confirmation email (`NotificationsService.notifyBookingConfirmed`, unchanged signature) is sent only when `contactEmail` is provided and there is no `customerId`. The existing logged-in confirmation-email behavior (always sent to the account's email) does not change.
- The owner-facing booking list (`findByVenueForOwner`) shows `contactName`/`contactPhone` directly from the booking row when present, without querying `UsersService`/`CustomerContactsService` — those joins remain only as a fallback for rows that predate this migration or that were created via the separate owner walk-in tool (`createForOwner`/`CustomerContact`, untouched by this plan).
- No new npm dependencies.
- Every task must leave `npm test` (from `apps/api`) green. Task 5 (e2e) must also leave `npm run test:e2e` green.

---

## File Structure

**New files:**
- `apps/api/src/migrations/1787990000000-AddContactSnapshotToBookings.ts`
- `apps/api/src/auth/guards/optional-jwt-auth.guard.ts`
- `apps/api/src/auth/guards/optional-jwt-auth.guard.spec.ts`

**Modified files:**
- `apps/api/src/bookings/entities/booking.entity.ts` — `contactName`/`contactPhone`/`contactEmail` columns
- `apps/api/src/bookings/dto/create-booking.dto.ts` — `contactName`, `contactPhone`, `contactEmail?`, `note?`
- `apps/api/src/bookings/bookings.controller.ts` — `POST /bookings` uses `OptionalJwtAuthGuard`, derives `customerId` from the resolved user's role
- `apps/api/src/bookings/bookings.service.ts` — `createBookingRecord`, `create`, `resolveCustomerDisplay`
- `apps/api/src/bookings/bookings.service.spec.ts` — existing `service.create(...)` call sites updated, 3 new tests
- `apps/api/test/bookings.e2e-spec.ts` — existing `POST /bookings` bodies updated, 3 new tests
- `apps/api/test/bookings-pricing.e2e-spec.ts`, `apps/api/test/bookings-notification-settings.e2e-spec.ts`, `apps/api/test/payments.e2e-spec.ts`, `apps/api/test/payments-notification-settings.e2e-spec.ts` — existing `POST /bookings` bodies updated (mechanical only, no new tests)

---

### Task 1: Migration — contact snapshot columns on `bookings`

**Files:**
- Create: `apps/api/src/migrations/1787990000000-AddContactSnapshotToBookings.ts`

**Interfaces:**
- Produces: `bookings.contact_name`, `bookings.contact_phone`, `bookings.contact_email` (all nullable `character varying`) — consumed by Task 2's entity.

- [ ] **Step 1: Write the migration**

Create `apps/api/src/migrations/1787990000000-AddContactSnapshotToBookings.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactSnapshotToBookings1787990000000
  implements MigrationInterface
{
  name = 'AddContactSnapshotToBookings1787990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "contact_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "contact_phone" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "contact_email" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "contact_email"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "contact_phone"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "contact_name"`);
  }
}
```

- [ ] **Step 2: Run the migration against the dev database**

Run (from `apps/api`): `npm run migration:run`
Expected: output lists `AddContactSnapshotToBookings1787990000000` as applied.
Verify: `npx typeorm-ts-node-commonjs -d src/config/data-source.ts migration:show` — the new migration shows `[X]`.

- [ ] **Step 3: Confirm the existing suite is unaffected**

Run (from `apps/api`): `npm test && npm run test:e2e`
Expected: both pass unchanged (new nullable columns don't affect any existing code path yet).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/migrations/1787990000000-AddContactSnapshotToBookings.ts
git commit -m "feat(api): add contact snapshot columns to bookings"
```

---

### Task 2: `Booking` entity — add contact snapshot fields

**Files:**
- Modify: `apps/api/src/bookings/entities/booking.entity.ts`

**Interfaces:**
- Consumes: Task 1's columns.
- Produces: `Booking.contactName: string | null`, `Booking.contactPhone: string | null`, `Booking.contactEmail: string | null` — consumed by Task 4.

- [ ] **Step 1: Add the columns**

In `apps/api/src/bookings/entities/booking.entity.ts`, add after the existing `note` column (before `cancelledAt`):

```ts
  @Column({ name: 'contact_name', nullable: true, type: 'varchar' })
  contactName: string | null;

  @Column({ name: 'contact_phone', nullable: true, type: 'varchar' })
  contactPhone: string | null;

  @Column({ name: 'contact_email', nullable: true, type: 'varchar' })
  contactEmail: string | null;
```

- [ ] **Step 2: Type-check and run the existing suite**

Run (from `apps/api`): `npx tsc --noEmit -p . && npm test`
Expected: both exit 0 — new nullable columns don't change any existing behavior or test expectation.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/bookings/entities/booking.entity.ts
git commit -m "feat(api): add contact snapshot fields to Booking entity"
```

---

### Task 3: `OptionalJwtAuthGuard`

**Files:**
- Create: `apps/api/src/auth/guards/optional-jwt-auth.guard.ts`
- Test: `apps/api/src/auth/guards/optional-jwt-auth.guard.spec.ts`

**Interfaces:**
- Produces: `OptionalJwtAuthGuard` (class, extends `AuthGuard('jwt')`), `handleRequest(err: unknown, user: unknown): AuthenticatedUser | null` — consumed by Task 4's controller edit.

`@nestjs/passport`'s `AuthGuard.canActivate` always returns `true` and sets `request.user` to whatever `handleRequest` returns (verified in `node_modules/@nestjs/passport/dist/auth.guard.js`) — it does **not** treat a falsy return value as "deny". The only thing that currently blocks an unauthenticated request is the default `handleRequest` throwing `UnauthorizedException` when `!user`. Overriding `handleRequest` to return `null` instead of throwing is therefore sufficient and safe.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/auth/guards/optional-jwt-auth.guard.spec.ts`:

```ts
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';

describe('OptionalJwtAuthGuard', () => {
  it('returns the user unchanged when authentication succeeds', () => {
    const guard = new OptionalJwtAuthGuard();
    const user = { userId: 'user-1' };

    expect(guard.handleRequest(null, user)).toBe(user);
  });

  it('returns null instead of throwing when there is no token', () => {
    const guard = new OptionalJwtAuthGuard();

    expect(guard.handleRequest(null, false)).toBeNull();
  });

  it('returns null instead of throwing when the token is invalid', () => {
    const guard = new OptionalJwtAuthGuard();

    expect(guard.handleRequest(new Error('jwt malformed'), false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest optional-jwt-auth.guard`
Expected: FAIL — `Cannot find module './optional-jwt-auth.guard'`.

- [ ] **Step 3: Implement the guard**

Create `apps/api/src/auth/guards/optional-jwt-auth.guard.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: unknown, user: unknown): AuthenticatedUser | null {
    return (user as AuthenticatedUser) || null;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest optional-jwt-auth.guard`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/guards/optional-jwt-auth.guard.ts apps/api/src/auth/guards/optional-jwt-auth.guard.spec.ts
git commit -m "feat(api): add OptionalJwtAuthGuard for guest-or-customer endpoints"
```

---

### Task 4: `CreateBookingDto` + `BookingsController` + `BookingsService` — guest checkout

**Files:**
- Modify: `apps/api/src/bookings/dto/create-booking.dto.ts`
- Modify: `apps/api/src/bookings/bookings.controller.ts`
- Modify: `apps/api/src/bookings/bookings.service.ts`
- Test: `apps/api/src/bookings/bookings.service.spec.ts`

**Interfaces:**
- Consumes: Task 2's `Booking.contactName/contactPhone/contactEmail`, Task 3's `OptionalJwtAuthGuard`.
- Produces: `CreateBookingDto.contactName: string`, `.contactPhone: string`, `.contactEmail?: string`, `.note?: string`; `BookingsService.create(customerId: string | null, dto: CreateBookingDto)`; `BookingsService.createBookingRecord(params)` now also accepts `contactName?/contactPhone?/contactEmail?` — consumed by Task 5 (e2e).

- [ ] **Step 1: Update `CreateBookingDto`**

Replace the full contents of `apps/api/src/bookings/dto/create-booking.dto.ts`:

```ts
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
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

  @IsString()
  @MinLength(1)
  contactName: string;

  @IsString()
  @MinLength(1)
  contactPhone: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
```

- [ ] **Step 2: Run the full suite to see the expected breakage**

Run (from `apps/api`): `npx tsc --noEmit -p .`
Expected: FAIL — multiple `Property 'contactName'/'contactPhone' is missing in type` errors in `bookings.service.ts` (the `create(customerId: string, ...)` call still expects a `string`, not the DTO shape) and in `bookings.service.spec.ts`'s `service.create('customer-1', {...})` call sites. This confirms the DTO change is wired correctly; the rest of this task fixes every one of these errors.

- [ ] **Step 3: Update `BookingsController`**

In `apps/api/src/bookings/bookings.controller.ts`, add one import and change the `create` handler. `JwtAuthGuard` stays imported and used by the other handlers in this file (`findMine`/`findMineById`/`cancelMine`/the owner-scoped handlers) — do not remove it.

Add, right after the existing `import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';` line:
```ts
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
```

Replace:
```ts
  @Post('bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.create(user.userId, dto);
  }
```
with:
```ts
  @Post('bookings')
  @UseGuards(OptionalJwtAuthGuard)
  create(
    @CurrentUser() user: AuthenticatedUser | null,
    @Body() dto: CreateBookingDto,
  ) {
    const customerId = user?.role === UserRole.CUSTOMER ? user.userId : null;
    return this.bookingsService.create(customerId, dto);
  }
```

(`JwtAuthGuard` stays used by the other handlers in this file — only this one import line changes; do not remove `RolesGuard`/`Roles`, they're still used by `findMine`/`findMineById`/`cancelMine`.)

- [ ] **Step 4: Update `BookingsService.createBookingRecord`**

In `apps/api/src/bookings/bookings.service.ts`, change the `params` type of `createBookingRecord` — replace:
```ts
  async createBookingRecord(params: {
    courtId: string;
    date: string;
    startTime: string;
    endTime: string;
    customerId?: string;
    customerContactId?: string;
    recurringScheduleId?: string;
    totalPriceOverride?: number;
    note?: string;
  }): Promise<{ booking: Booking; court: Court; venue: Venue }> {
```
with:
```ts
  async createBookingRecord(params: {
    courtId: string;
    date: string;
    startTime: string;
    endTime: string;
    customerId?: string;
    customerContactId?: string;
    recurringScheduleId?: string;
    totalPriceOverride?: number;
    note?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
  }): Promise<{ booking: Booking; court: Court; venue: Venue }> {
```

Then, inside the same method, replace the `manager.create(Booking, {...})` call — replace:
```ts
        const entity = manager.create(Booking, {
          courtId: params.courtId,
          customerId: params.customerId ?? null,
          customerContactId: params.customerContactId ?? null,
          recurringScheduleId: params.recurringScheduleId ?? null,
          date: params.date,
          startTime: params.startTime,
          endTime: params.endTime,
          totalPrice,
          status: BookingStatus.CONFIRMED,
          note: params.note ?? null,
        });
```
with:
```ts
        const entity = manager.create(Booking, {
          courtId: params.courtId,
          customerId: params.customerId ?? null,
          customerContactId: params.customerContactId ?? null,
          recurringScheduleId: params.recurringScheduleId ?? null,
          date: params.date,
          startTime: params.startTime,
          endTime: params.endTime,
          totalPrice,
          status: BookingStatus.CONFIRMED,
          note: params.note ?? null,
          contactName: params.contactName ?? null,
          contactPhone: params.contactPhone ?? null,
          contactEmail: params.contactEmail ?? null,
        });
```

- [ ] **Step 5: Update `BookingsService.create`**

Replace the whole method:
```ts
  async create(customerId: string, dto: CreateBookingDto): Promise<Booking> {
    const { booking, court, venue } = await this.createBookingRecord({
      courtId: dto.courtId,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      customerId,
    });

    const customer = await this.usersService.findById(customerId);
    const owner = await this.usersService.findById(venue.ownerId);
    await this.notificationsService.notifyBookingConfirmed({
      to: customer?.email ?? '',
      customerName: customer?.fullName ?? '',
      venueName: venue.name,
      courtName: court.name,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      totalPrice: booking.totalPrice,
    });
    const notificationSettings =
      await this.notificationSettingsService.getForOwner(venue.ownerId);
    if (notificationSettings.newBooking) {
      await this.notificationsService.notifyNewBookingForOwner({
        to: venue.email ?? owner?.email ?? '',
        venueName: venue.name,
        courtName: court.name,
        date: dto.date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        customerName: customer?.fullName ?? '',
        customerPhone: customer?.phone ?? null,
        totalPrice: booking.totalPrice,
      });
    }

    return booking;
  }
```
with:
```ts
  async create(
    customerId: string | null,
    dto: CreateBookingDto,
  ): Promise<Booking> {
    const { booking, court, venue } = await this.createBookingRecord({
      courtId: dto.courtId,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      customerId: customerId ?? undefined,
      contactName: dto.contactName,
      contactPhone: dto.contactPhone,
      contactEmail: dto.contactEmail,
      note: dto.note,
    });

    const customer = customerId
      ? await this.usersService.findById(customerId)
      : null;
    const owner = await this.usersService.findById(venue.ownerId);

    if (customerId) {
      await this.notificationsService.notifyBookingConfirmed({
        to: customer?.email ?? '',
        customerName: customer?.fullName ?? '',
        venueName: venue.name,
        courtName: court.name,
        date: dto.date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        totalPrice: booking.totalPrice,
      });
    } else if (dto.contactEmail) {
      await this.notificationsService.notifyBookingConfirmed({
        to: dto.contactEmail,
        customerName: dto.contactName,
        venueName: venue.name,
        courtName: court.name,
        date: dto.date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        totalPrice: booking.totalPrice,
      });
    }

    const notificationSettings =
      await this.notificationSettingsService.getForOwner(venue.ownerId);
    if (notificationSettings.newBooking) {
      await this.notificationsService.notifyNewBookingForOwner({
        to: venue.email ?? owner?.email ?? '',
        venueName: venue.name,
        courtName: court.name,
        date: dto.date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        customerName: customer?.fullName ?? dto.contactName,
        customerPhone: customer?.phone ?? dto.contactPhone,
        totalPrice: booking.totalPrice,
      });
    }

    return booking;
  }
```

- [ ] **Step 6: Update `BookingsService.resolveCustomerDisplay`**

Replace:
```ts
  private async resolveCustomerDisplay(
    booking: Booking,
  ): Promise<{ name: string; phone: string | null }> {
    if (booking.customerId) {
      const customer = await this.usersService.findById(booking.customerId);
      return {
        name: customer?.fullName ?? 'Không rõ',
        phone: customer?.phone ?? null,
      };
    }
    if (booking.customerContactId) {
      const contact = await this.customerContactsService.findById(
        booking.customerContactId,
      );
      return {
        name: contact?.fullName ?? 'Không rõ',
        phone: contact?.phone ?? null,
      };
    }
    return { name: 'Không rõ', phone: null };
  }
```
with:
```ts
  private async resolveCustomerDisplay(
    booking: Booking,
  ): Promise<{ name: string; phone: string | null }> {
    if (booking.contactName) {
      return { name: booking.contactName, phone: booking.contactPhone ?? null };
    }
    if (booking.customerId) {
      const customer = await this.usersService.findById(booking.customerId);
      return {
        name: customer?.fullName ?? 'Không rõ',
        phone: customer?.phone ?? null,
      };
    }
    if (booking.customerContactId) {
      const contact = await this.customerContactsService.findById(
        booking.customerContactId,
      );
      return {
        name: contact?.fullName ?? 'Không rõ',
        phone: contact?.phone ?? null,
      };
    }
    return { name: 'Không rõ', phone: null };
  }
```

- [ ] **Step 7: Fix the existing `bookings.service.spec.ts` call sites**

Five edits in `apps/api/src/bookings/bookings.service.spec.ts` (all are adding `contactName`/`contactPhone` to an existing literal, no other changes):

7a. Replace both identical occurrences (use `replace_all`):
```ts
    const result = await service.create('customer-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '10:00',
    });
```
with:
```ts
    const result = await service.create('customer-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '10:00',
      contactName: 'Nguyễn Văn A',
      contactPhone: '0900000000',
    });
```

7b. Replace all three identical occurrences (use `replace_all`):
```ts
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:00',
        endTime: '09:00',
      }),
```
with:
```ts
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
      }),
```

7c. Replace both identical occurrences (use `replace_all`):
```ts
    await service.create('customer-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
    });
```
with:
```ts
    await service.create('customer-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      contactName: 'Nguyễn Văn A',
      contactPhone: '0900000000',
    });
```

7d. Single occurrence (the "date in the past" test):
```ts
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-01',
        startTime: '08:00',
        endTime: '09:00',
      }),
```
with:
```ts
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-01',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
      }),
```

7e. Single occurrence (the "not aligned to slot grid" test):
```ts
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:30',
        endTime: '09:30',
      }),
```
with:
```ts
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:30',
        endTime: '09:30',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
      }),
```

- [ ] **Step 8: Run the full suite to confirm green**

Run (from `apps/api`): `npx tsc --noEmit -p . && npm test`
Expected: both exit 0.

- [ ] **Step 9: Add the new guest-checkout unit tests**

In `apps/api/src/bookings/bookings.service.spec.ts`, add these two `it` blocks at the end of the `describe('BookingsService.create', ...)` block (right before its closing `});`, i.e. right after the "throws NotFoundException when the venue is not active" test):

```ts
  it('creates a guest booking without a customerId, storing the submitted contact info', async () => {
    const {
      service,
      courtsService,
      venuesService,
      usersService,
      dataSource,
      notificationsService,
    } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    usersService.findById.mockResolvedValue({
      id: 'owner-1',
      email: 'owner@test.com',
      fullName: 'Owner',
    });
    const manager = buildMockManager();
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.create(null, {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      contactName: 'Khách vãng lai',
      contactPhone: '0911111111',
      contactEmail: 'guest@test.com',
    });

    expect(result.customerId).toBeNull();
    expect(result.contactName).toBe('Khách vãng lai');
    expect(result.contactPhone).toBe('0911111111');
    expect(usersService.findById).toHaveBeenCalledTimes(1);
    expect(usersService.findById).toHaveBeenCalledWith('owner-1');
    expect(notificationsService.notifyBookingConfirmed).toHaveBeenCalledWith({
      to: 'guest@test.com',
      customerName: 'Khách vãng lai',
      venueName: 'Venue A',
      courtName: 'Sân 1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 100000,
    });
    expect(notificationsService.notifyNewBookingForOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: 'Khách vãng lai',
        customerPhone: '0911111111',
      }),
    );
  });

  it('does not send a guest confirmation email when contactEmail is omitted', async () => {
    const {
      service,
      courtsService,
      venuesService,
      usersService,
      dataSource,
      notificationsService,
    } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    usersService.findById.mockResolvedValue({
      id: 'owner-1',
      email: 'owner@test.com',
      fullName: 'Owner',
    });
    dataSource.transaction.mockImplementation((cb) => cb(buildMockManager()));

    await service.create(null, {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      contactName: 'Khách vãng lai',
      contactPhone: '0911111111',
    });

    expect(notificationsService.notifyBookingConfirmed).not.toHaveBeenCalled();
    expect(notificationsService.notifyNewBookingForOwner).toHaveBeenCalled();
  });
```

Then add this `it` block inside `describe('BookingsService.findByVenueForOwner', ...)`, right after the "resolves customer name/phone from customer_contacts for walk-in bookings" test:

```ts
  it('prefers the contact snapshot on the booking over customerId/customerContactId joins', async () => {
    const {
      service,
      bookingsRepo,
      courtsService,
      usersService,
      customerContactsService,
      paymentsService,
    } = await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([{ id: 'court-1' }]);
    bookingsRepo.find.mockResolvedValue([
      {
        id: 'booking-3',
        customerId: 'customer-1',
        contactName: 'Trần Thị B',
        contactPhone: '0933333333',
      },
    ]);
    paymentsService.findByBookingId.mockResolvedValue(null);

    const result = await service.findByVenueForOwner('owner-1', 'venue-1', {});

    expect(result[0]).toMatchObject({
      customerName: 'Trần Thị B',
      customerPhone: '0933333333',
    });
    expect(usersService.findById).not.toHaveBeenCalled();
    expect(customerContactsService.findById).not.toHaveBeenCalled();
  });
```

- [ ] **Step 10: Run the full suite to confirm green**

Run (from `apps/api`): `npx tsc --noEmit -p . && npm test`
Expected: both exit 0, including the 3 new tests.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/bookings/dto/create-booking.dto.ts apps/api/src/bookings/bookings.controller.ts apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.service.spec.ts
git commit -m "feat(api): allow POST /bookings without login, store a contact snapshot"
```

---

### Addendum found during execution: `CHK_bookings_customer_xor` blocks guest bookings

Running the e2e suite for Task 5 surfaced a gap this plan missed: `bookings` has a check constraint `CHK_bookings_customer_xor` (added by `1787870000000-AddWalkInCustomersToBookings.ts`) requiring **exactly one** of `customer_id`/`customer_contact_id` to be non-null. A guest booking (both null, identified only by the new `contact_name` snapshot) violates it — `POST /bookings` returned 500.

Fix applied: a new migration `apps/api/src/migrations/1788000000000-RelaxBookingsCustomerXorForGuestContact.ts`, run against both the dev DB (`npm run migration:run`) and the e2e test DB (`DB_NAME=pickleball_test npm run migration:run` — `.env.test` uses a separate `pickleball_test` database, `NODE_ENV=test` alone does **not** redirect `data-source.ts`, which calls plain `dotenv.config()` with no env-awareness; override `DB_NAME` directly instead). The new constraint keeps the original "not both set" rule and adds "or `contact_name` is set" as a third valid state:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class RelaxBookingsCustomerXorForGuestContact1788000000000
  implements MigrationInterface
{
  name = 'RelaxBookingsCustomerXorForGuestContact1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "CHK_bookings_customer_xor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "CHK_bookings_customer_xor" CHECK (
        NOT ("customer_id" IS NOT NULL AND "customer_contact_id" IS NOT NULL)
        AND ("customer_id" IS NOT NULL OR "customer_contact_id" IS NOT NULL OR "contact_name" IS NOT NULL)
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "CHK_bookings_customer_xor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "CHK_bookings_customer_xor" CHECK (("customer_id" IS NOT NULL) <> ("customer_contact_id" IS NOT NULL))`,
    );
  }
}
```

Also surfaced: the 3 new e2e tests in Task 5 initially used `createActiveUserAndLogin` (which calls `POST /auth/login`, throttled to 10 req/60s) for 4 more logins on top of the file's existing 10 — exactly the file's stated budget. Fixed by adding a `createActiveUserWithToken` helper that signs a JWT directly via `JwtService` (same precedent already used by the file's cashier test), avoiding `/auth/login` entirely for the 3 new tests.

---

### Task 5: e2e coverage — guest checkout end-to-end

**Files:**
- Modify: `apps/api/test/bookings.e2e-spec.ts`
- Modify: `apps/api/test/bookings-pricing.e2e-spec.ts`
- Modify: `apps/api/test/bookings-notification-settings.e2e-spec.ts`
- Modify: `apps/api/test/payments.e2e-spec.ts`
- Modify: `apps/api/test/payments-notification-settings.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 4's live `POST /bookings` behavior.

Every existing `.post('/bookings')...send({...})` call in these 5 files is now missing the newly-required `contactName`/`contactPhone` and will get `400` instead of `201`/`409` once `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` sees the DTO's new required fields. Fix all of them, then add 3 new tests proving the guest-checkout path end-to-end.

- [ ] **Step 1: Fix `apps/api/test/bookings-pricing.e2e-spec.ts`**

Replace:
```ts
      .send({
        courtId: court.id,
        date: '2099-01-01',
        startTime: '18:00',
        endTime: '19:00',
      })
```
with:
```ts
      .send({
        courtId: court.id,
        date: '2099-01-01',
        startTime: '18:00',
        endTime: '19:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
      })
```

- [ ] **Step 2: Fix `apps/api/test/bookings-notification-settings.e2e-spec.ts`**

Replace:
```ts
      .send({
        courtId: court.id,
        date: '2099-05-01',
        startTime: '08:00',
        endTime: '09:00',
```
with:
```ts
      .send({
        courtId: court.id,
        date: '2099-05-01',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
```
Replace:
```ts
      .send({
        courtId: court.id,
        date: '2099-05-02',
        startTime: '08:00',
        endTime: '09:00',
```
with:
```ts
      .send({
        courtId: court.id,
        date: '2099-05-02',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
```
(Both occurrences have distinct dates, so match each independently — do not use `replace_all` here.)

- [ ] **Step 3: Fix `apps/api/test/payments-notification-settings.e2e-spec.ts`**

Replace:
```ts
      .send({
        courtId: court.id,
        date: '2099-06-01',
        startTime: '08:00',
        endTime: '09:00',
```
with:
```ts
      .send({
        courtId: court.id,
        date: '2099-06-01',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
```

- [ ] **Step 4: Fix `apps/api/test/payments.e2e-spec.ts`**

Replace each of the 3 occurrences (dates `2099-02-01`, `2099-02-02`, `2099-04-01` — each unique, match independently):
```ts
      .send({
        courtId,
        date: '2099-02-01',
        startTime: '08:00',
        endTime: '09:00',
```
with:
```ts
      .send({
        courtId,
        date: '2099-02-01',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
```
(repeat the same 2-line insertion for the `2099-02-02` and `2099-04-01` blocks)

- [ ] **Step 5: Fix `apps/api/test/bookings.e2e-spec.ts` and add the 3 new tests**

Replace (site with date `2099-01-01`):
```ts
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
```
with:
```ts
      .send({
        courtId,
        date: '2099-01-01',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
      })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      courtId,
      status: 'confirmed',
      totalPrice: 100000,
    });
```

Replace the `Promise.all` pair (date `2099-01-02`, both bodies identical apart from which customer's token is set):
```ts
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
```
with:
```ts
        .send({
          courtId,
          date: '2099-01-02',
          startTime: '08:00',
          endTime: '09:00',
          contactName: 'Nguyễn Văn A',
          contactPhone: '0900000000',
        }),
      request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${customerB.token}`)
        .send({
          courtId,
          date: '2099-01-02',
          startTime: '08:00',
          endTime: '09:00',
          contactName: 'Nguyễn Văn B',
          contactPhone: '0900000001',
        }),
```

Replace (site with date `2099-01-03`, the cutoff test):
```ts
      .send({
        courtId,
        date: '2099-01-03',
        startTime: '08:00',
        endTime: '09:00',
      })
      .expect(201);
    const bookingId = createResponse.body.id;
```
with:
```ts
      .send({
        courtId,
        date: '2099-01-03',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
      })
      .expect(201);
    const bookingId = createResponse.body.id;
```

Replace (site with date `2099-01-04`, the owner-list test):
```ts
      .send({
        courtId,
        date: '2099-01-04',
        startTime: '08:00',
        endTime: '09:00',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/bookings`)
```
with:
```ts
      .send({
        courtId,
        date: '2099-01-04',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/bookings`)
```

Now add these 3 new `it` blocks right before the file's final closing `});` (after the "lets a cashier staff create and cancel..." test):

```ts
  it('lets a guest without an account book a slot using contact info, and sends a confirmation email when provided', async () => {
    const owner = await createActiveUserAndLogin(
      'owner5@test.com',
      UserRole.OWNER,
    );
    const { venueId, courtId } = await createActiveVenueAndCourt(owner.userId);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .send({
        courtId,
        date: '2099-05-01',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Khách vãng lai',
        contactPhone: '0911111111',
        contactEmail: 'guest@test.com',
      })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      courtId,
      status: 'confirmed',
      customerId: null,
      contactName: 'Khách vãng lai',
      contactPhone: '0911111111',
    });
    expect(mockMailService.send).toHaveBeenCalledWith(
      'guest@test.com',
      'Xác nhận đặt sân',
      expect.stringContaining('Sân 1'),
    );

    const ownerBookings = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/bookings`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(ownerBookings.body[0]).toMatchObject({
      customerName: 'Khách vãng lai',
      customerPhone: '0911111111',
    });
  });

  it('does not send a guest confirmation email when contactEmail is omitted', async () => {
    const owner = await createActiveUserAndLogin(
      'owner6@test.com',
      UserRole.OWNER,
    );
    const { courtId } = await createActiveVenueAndCourt(owner.userId);

    await request(app.getHttpServer())
      .post('/bookings')
      .send({
        courtId,
        date: '2099-05-02',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Khách vãng lai 2',
        contactPhone: '0911111112',
      })
      .expect(201);

    expect(mockMailService.send).not.toHaveBeenCalledWith(
      expect.anything(),
      'Xác nhận đặt sân',
      expect.anything(),
    );
    expect(mockMailService.send).toHaveBeenCalledWith(
      'owner6@test.com',
      'Có booking mới',
      expect.any(String),
    );
  });

  it('lets a logged-in customer override the display contact info while keeping the booking linked to their account', async () => {
    const owner = await createActiveUserAndLogin(
      'owner7@test.com',
      UserRole.OWNER,
    );
    const { venueId, courtId } = await createActiveVenueAndCourt(owner.userId);
    const customer = await createActiveUserAndLogin(
      'customer7@test.com',
      UserRole.CUSTOMER,
    );

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        courtId,
        date: '2099-05-03',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Đặt hộ bạn',
        contactPhone: '0911111113',
      })
      .expect(201);

    const mine = await request(app.getHttpServer())
      .get('/bookings/mine')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(mine.body.map((b: { id: string }) => b.id)).toContain(
      createResponse.body.id,
    );

    const ownerBookings = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/bookings`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(ownerBookings.body[0]).toMatchObject({
      customerName: 'Đặt hộ bạn',
      customerPhone: '0911111113',
    });
  });
```

- [ ] **Step 6: Run the full suite**

Run (from `apps/api`): `npm test && npm run test:e2e`
Expected: both PASS, including the 3 new e2e tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/test/bookings.e2e-spec.ts apps/api/test/bookings-pricing.e2e-spec.ts apps/api/test/bookings-notification-settings.e2e-spec.ts apps/api/test/payments.e2e-spec.ts apps/api/test/payments-notification-settings.e2e-spec.ts
git commit -m "test(api): cover guest checkout end-to-end, fix POST /bookings fixtures"
```
