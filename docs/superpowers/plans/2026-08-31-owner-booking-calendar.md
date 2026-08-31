# Owner Booking Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `/owner/bookings` "Coming Soon" placeholder with an hour×court booking grid for one venue, backed by minimal walk-in-customer and recurring-schedule support in the backend, and retire the old list-based booking section at `/owner/branches/[id]`.

**Architecture:** Backend (NestJS/TypeORM, `apps/api`): extend `BookingsService` with a shared `createBookingRecord` transaction helper reused by the existing customer flow, a new owner walk-in flow, and a new `RecurringSchedulesService`; add a small `CustomerContactsModule` for walk-in customers. Frontend (Next.js, `apps/web`): a page under `apps/web/src/app/owner/bookings/` that fetches courts + bookings for a date and derives grid cell state with a pure function, with two dialogs (quick-book, detail) driving all writes through new/existing BFF route handlers.

**Tech Stack:** NestJS 11, TypeORM (Postgres, hand-written migrations), class-validator/class-transformer, Jest (`apps/api`). Next.js App Router, React, react-hook-form + zod (forms), Vitest (`apps/web`), Tailwind, Base UI `Dialog` primitives, `sonner` toasts.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-31-owner-booking-calendar-design.md` — every task below implements a numbered section of it; re-read it if a step's rationale is unclear.
- Vietnamese user-facing strings and error messages throughout (matches existing codebase).
- No new npm dependencies. No pricing-rule engine, no cron, no drag-and-drop, no "Ghi chú" field on one-off bookings (backend `bookings` has no `note` column — dropped from the quick-book form; only `customer_contacts` and `recurring_schedules` have `note`).
- Backend migrations are hand-written raw SQL (`queryRunner.query(...)`), matching every existing file in `apps/api/src/migrations/` — this repo does not run `migration:generate` against a live DB for this plan.
- All new/changed backend endpoints are owner-only (`@Roles(UserRole.OWNER)`), scoped via `VenuesService.getOwnedVenueOrThrow`.
- Run backend tests from `apps/api` (`npx jest <path>`), frontend tests from `apps/web` (`npx vitest run <path>`).

---

### Task 1: Walk-in customer data model (`customer_contacts` + nullable `bookings.customer_id`)

**Files:**
- Create: `apps/api/src/customer-contacts/entities/customer-contact.entity.ts`
- Create: `apps/api/src/migrations/1787870000000-AddWalkInCustomersToBookings.ts`
- Modify: `apps/api/src/bookings/entities/booking.entity.ts`

**Interfaces:**
- Produces: `CustomerContact` entity (`id`, `ownerId`, `fullName`, `phone`, `email: string | null`, `address: string | null`, `note: string | null`, `createdAt`, `updatedAt`), used by Task 2+.
- Produces: `Booking.customerId: string | null`, `Booking.customerContactId: string | null` (new), used by Task 3+.

There is no test for a migration/entity-only task — verification is `npm run build` succeeding and the existing `bookings.service.spec.ts` suite still passing (no behavior changed yet).

- [ ] **Step 1: Create the `CustomerContact` entity**

```ts
// apps/api/src/customer-contacts/entities/customer-contact.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('customer_contacts')
@Index(['ownerId', 'phone'], { unique: true })
export class CustomerContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Column()
  phone: string;

  @Column({ nullable: true, type: 'varchar' })
  email: string | null;

  @Column({ nullable: true, type: 'varchar' })
  address: string | null;

  @Column({ nullable: true, type: 'varchar' })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Update the `Booking` entity**

In `apps/api/src/bookings/entities/booking.entity.ts`, replace:

```ts
  @Column({ name: 'customer_id' })
  customerId: string;
```

with:

```ts
  @Column({ name: 'customer_id', nullable: true, type: 'varchar' })
  customerId: string | null;

  @Column({ name: 'customer_contact_id', nullable: true, type: 'varchar' })
  customerContactId: string | null;
```

- [ ] **Step 3: Write the migration**

```ts
// apps/api/src/migrations/1787870000000-AddWalkInCustomersToBookings.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalkInCustomersToBookings1787870000000
  implements MigrationInterface
{
  name = 'AddWalkInCustomersToBookings1787870000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "customer_contacts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_id" character varying NOT NULL, "full_name" character varying NOT NULL, "phone" character varying NOT NULL, "email" character varying, "address" character varying, "note" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_customer_contacts_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_customer_contacts_owner_phone" ON "customer_contacts" ("owner_id", "phone")`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ALTER COLUMN "customer_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "customer_contact_id" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_customer_contact_id" FOREIGN KEY ("customer_contact_id") REFERENCES "customer_contacts"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "CHK_bookings_customer_xor" CHECK (("customer_id" IS NOT NULL) <> ("customer_contact_id" IS NOT NULL))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "CHK_bookings_customer_xor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_customer_contact_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN "customer_contact_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ALTER COLUMN "customer_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_customer_contacts_owner_phone"`,
    );
    await queryRunner.query(`DROP TABLE "customer_contacts"`);
  }
}
```

- [ ] **Step 4: Run the existing test suite to confirm nothing broke**

Run (from `apps/api`): `npx jest src/bookings/bookings.service.spec.ts`
Expected: all existing tests still PASS (entity typing change is compatible — `customerId` is still assigned a string everywhere in the current code).

- [ ] **Step 5: Build to catch type errors**

Run (from `apps/api`): `npm run build`
Expected: success, no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/customer-contacts/entities/customer-contact.entity.ts apps/api/src/migrations/1787870000000-AddWalkInCustomersToBookings.ts apps/api/src/bookings/entities/booking.entity.ts
git commit -m "feat(api): add customer_contacts table and nullable bookings.customer_id"
```

---

### Task 2: `CustomerContactsModule` — resolve/find-or-create walk-in customers

**Files:**
- Create: `apps/api/src/customer-contacts/dto/customer-selector.dto.ts`
- Create: `apps/api/src/customer-contacts/customer-contacts.service.ts`
- Create: `apps/api/src/customer-contacts/customer-contacts.module.ts`
- Create: `apps/api/src/customer-contacts/customer-contacts.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `CustomerContact` entity (Task 1), `UsersService.findById(id: string): Promise<User | null>` (existing).
- Produces: `CustomerContactsService.resolveSelector(ownerId: string, selector: { customerId?: string; customerContactId?: string; newCustomer?: { fullName: string; phone: string; email?: string; address?: string; note?: string } }): Promise<{ customerId?: string; customerContactId?: string }>`, `.findByIdForOwner(ownerId, id): Promise<CustomerContact>`, `.findById(id): Promise<CustomerContact | null>`, `.findOrCreate(ownerId, data): Promise<CustomerContact>` — all consumed by Task 4, 5, 8.
- Produces: `CustomerSelectorDto`, `NewCustomerDto` classes, consumed by Task 4, 8's DTOs via `extends`.

- [ ] **Step 1: Write the DTOs**

```ts
// apps/api/src/customer-contacts/dto/customer-selector.dto.ts
import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class NewCustomerDto {
  @IsString()
  @MinLength(1)
  fullName: string;

  @IsString()
  @MinLength(1)
  phone: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CustomerSelectorDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerContactId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NewCustomerDto)
  newCustomer?: NewCustomerDto;
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// apps/api/src/customer-contacts/customer-contacts.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { CustomerContactsService } from './customer-contacts.service';
import { CustomerContact } from './entities/customer-contact.entity';
import { UsersService } from '../users/users.service';

const mockRepository = () => ({
  findOne: jest.fn(),
  create: jest.fn((data: unknown) => data),
  save: jest.fn((data: unknown) => Promise.resolve({ id: 'contact-1', ...(data as object) })),
});

const mockUsersService = () => ({
  findById: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CustomerContactsService,
      { provide: getRepositoryToken(CustomerContact), useFactory: mockRepository },
      { provide: UsersService, useFactory: mockUsersService },
    ],
  }).compile();

  return {
    service: module.get(CustomerContactsService),
    repo: module.get(getRepositoryToken(CustomerContact)) as ReturnType<typeof mockRepository>,
    usersService: module.get(UsersService) as ReturnType<typeof mockUsersService>,
  };
}

describe('CustomerContactsService.resolveSelector', () => {
  it('throws BadRequestException when no selector field is provided', async () => {
    const { service } = await buildTestingModule();
    await expect(service.resolveSelector('owner-1', {})).rejects.toThrow(
      'Phải cung cấp đúng một trong customerId, customerContactId hoặc newCustomer',
    );
  });

  it('throws BadRequestException when more than one selector field is provided', async () => {
    const { service } = await buildTestingModule();
    await expect(
      service.resolveSelector('owner-1', { customerId: 'u1', customerContactId: 'c1' }),
    ).rejects.toThrow('Phải cung cấp đúng một trong customerId, customerContactId hoặc newCustomer');
  });

  it('resolves an existing customerId after checking it exists', async () => {
    const { service, usersService } = await buildTestingModule();
    usersService.findById.mockResolvedValue({ id: 'u1' });

    const result = await service.resolveSelector('owner-1', { customerId: 'u1' });

    expect(result).toEqual({ customerId: 'u1' });
  });

  it('throws NotFoundException when customerId does not exist', async () => {
    const { service, usersService } = await buildTestingModule();
    usersService.findById.mockResolvedValue(null);

    await expect(
      service.resolveSelector('owner-1', { customerId: 'missing' }),
    ).rejects.toThrow('Khách hàng missing không tồn tại');
  });

  it('resolves an existing customerContactId scoped to the owner', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({ id: 'contact-1', ownerId: 'owner-1' });

    const result = await service.resolveSelector('owner-1', { customerContactId: 'contact-1' });

    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'contact-1', ownerId: 'owner-1' } });
    expect(result).toEqual({ customerContactId: 'contact-1' });
  });

  it('creates a new contact when newCustomer has an unseen phone', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue(null);

    const result = await service.resolveSelector('owner-1', {
      newCustomer: { fullName: 'Nguyễn Văn A', phone: '0900000000' },
    });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'owner-1', fullName: 'Nguyễn Văn A', phone: '0900000000' }),
    );
    expect(result).toEqual({ customerContactId: 'contact-1' });
  });

  it('reuses an existing contact with the same phone instead of creating a duplicate', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({ id: 'contact-9', ownerId: 'owner-1', fullName: 'Old Name', phone: '0900000000' });

    const result = await service.resolveSelector('owner-1', {
      newCustomer: { fullName: 'New Name', phone: '0900000000' },
    });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'contact-9', fullName: 'New Name' }),
    );
    expect(result).toEqual({ customerContactId: 'contact-9' });
  });

  it('falls back to the winning row when a concurrent insert violates the unique index', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'contact-race', ownerId: 'owner-1' });
    const uniqueViolation = Object.assign(new QueryFailedError('INSERT', [], new Error('dup')), {
      code: '23505',
    });
    repo.save.mockRejectedValueOnce(uniqueViolation);

    const result = await service.resolveSelector('owner-1', {
      newCustomer: { fullName: 'Nguyễn Văn A', phone: '0900000000' },
    });

    expect(result).toEqual({ customerContactId: 'contact-race' });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (from `apps/api`): `npx jest src/customer-contacts/customer-contacts.service.spec.ts`
Expected: FAIL — `Cannot find module './customer-contacts.service'`.

- [ ] **Step 4: Implement `CustomerContactsService`**

```ts
// apps/api/src/customer-contacts/customer-contacts.service.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { CustomerContact } from './entities/customer-contact.entity';
import { UsersService } from '../users/users.service';

const UNIQUE_VIOLATION_CODE = '23505';

export interface CustomerSelector {
  customerId?: string;
  customerContactId?: string;
  newCustomer?: {
    fullName: string;
    phone: string;
    email?: string;
    address?: string;
    note?: string;
  };
}

export interface ResolvedCustomerRef {
  customerId?: string;
  customerContactId?: string;
}

@Injectable()
export class CustomerContactsService {
  constructor(
    @InjectRepository(CustomerContact)
    private readonly repository: Repository<CustomerContact>,
    private readonly usersService: UsersService,
  ) {}

  async resolveSelector(
    ownerId: string,
    selector: CustomerSelector,
  ): Promise<ResolvedCustomerRef> {
    const provided = [selector.customerId, selector.customerContactId, selector.newCustomer].filter(
      (value) => value !== undefined && value !== null,
    );
    if (provided.length !== 1) {
      throw new BadRequestException(
        'Phải cung cấp đúng một trong customerId, customerContactId hoặc newCustomer',
      );
    }

    if (selector.customerId) {
      const user = await this.usersService.findById(selector.customerId);
      if (!user) {
        throw new NotFoundException(`Khách hàng ${selector.customerId} không tồn tại`);
      }
      return { customerId: selector.customerId };
    }

    if (selector.customerContactId) {
      const contact = await this.findByIdForOwner(ownerId, selector.customerContactId);
      return { customerContactId: contact.id };
    }

    const contact = await this.findOrCreate(ownerId, selector.newCustomer!);
    return { customerContactId: contact.id };
  }

  async findByIdForOwner(ownerId: string, id: string): Promise<CustomerContact> {
    const contact = await this.repository.findOne({ where: { id, ownerId } });
    if (!contact) {
      throw new NotFoundException(`Khách hàng ${id} không tồn tại`);
    }
    return contact;
  }

  async findOrCreate(
    ownerId: string,
    data: { fullName: string; phone: string; email?: string; address?: string; note?: string },
  ): Promise<CustomerContact> {
    const existing = await this.repository.findOne({ where: { ownerId, phone: data.phone } });
    if (existing) {
      existing.fullName = data.fullName;
      return this.repository.save(existing);
    }
    try {
      return await this.repository.save(
        this.repository.create({
          ownerId,
          fullName: data.fullName,
          phone: data.phone,
          email: data.email ?? null,
          address: data.address ?? null,
          note: data.note ?? null,
        }),
      );
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as unknown as { code?: string }).code === UNIQUE_VIOLATION_CODE
      ) {
        const winner = await this.repository.findOne({ where: { ownerId, phone: data.phone } });
        if (winner) {
          return winner;
        }
      }
      throw error;
    }
  }

  findById(id: string): Promise<CustomerContact | null> {
    return this.repository.findOne({ where: { id } });
  }
}
```

- [ ] **Step 5: Write the module**

```ts
// apps/api/src/customer-contacts/customer-contacts.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerContact } from './entities/customer-contact.entity';
import { CustomerContactsService } from './customer-contacts.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerContact]), UsersModule],
  providers: [CustomerContactsService],
  exports: [CustomerContactsService],
})
export class CustomerContactsModule {}
```

- [ ] **Step 6: Register the module in `AppModule`**

In `apps/api/src/app.module.ts`, add the import:

```ts
import { CustomerContactsModule } from './customer-contacts/customer-contacts.module';
```

and add `CustomerContactsModule` to the `imports` array (any position, e.g. after `CourtsModule`).

- [ ] **Step 7: Run the tests to verify they pass**

Run (from `apps/api`): `npx jest src/customer-contacts/customer-contacts.service.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/customer-contacts apps/api/src/app.module.ts
git commit -m "feat(api): add CustomerContactsModule for walk-in booking customers"
```

---

### Task 3: Extract `BookingsService.createBookingRecord` (regression-safe refactor)

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts`

**Interfaces:**
- Produces: `BookingsService.createBookingRecord(params: { courtId: string; date: string; startTime: string; endTime: string; customerId?: string; customerContactId?: string; recurringScheduleId?: string; totalPriceOverride?: number }): Promise<{ booking: Booking; court: Court; venue: Venue }>` — consumed by Task 4 (`createForOwner`) and Task 8 (`RecurringSchedulesService`).
- `create()`'s external behavior and signature are unchanged — this task is a pure refactor validated by the existing test suite.

- [ ] **Step 1: Run the existing tests first to confirm the baseline is green**

Run (from `apps/api`): `npx jest src/bookings/bookings.service.spec.ts`
Expected: PASS (all existing tests, this is the safety net for the refactor).

- [ ] **Step 2: Extract the private `createBookingRecord` method**

In `apps/api/src/bookings/bookings.service.ts`, replace the entire `async create(customerId: string, dto: CreateBookingDto): Promise<Booking>` method with:

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
    await this.notificationsService.notifyNewBookingForOwner({
      to: owner?.email ?? '',
      venueName: venue.name,
      courtName: court.name,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      customerName: customer?.fullName ?? '',
      customerPhone: customer?.phone ?? null,
      totalPrice: booking.totalPrice,
    });

    return booking;
  }

  async createBookingRecord(params: {
    courtId: string;
    date: string;
    startTime: string;
    endTime: string;
    customerId?: string;
    customerContactId?: string;
    recurringScheduleId?: string;
    totalPriceOverride?: number;
  }): Promise<{ booking: Booking; court: Court; venue: Venue }> {
    if (!DATE_PATTERN.test(params.date)) {
      throw new BadRequestException('date phải theo định dạng YYYY-MM-DD');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (params.date < today) {
      throw new BadRequestException(
        'Không thể đặt sân cho ngày trong quá khứ',
      );
    }

    const court = await this.courtsService.findByIdOrThrow(params.courtId);
    if (court.status !== CourtStatus.ACTIVE) {
      throw new NotFoundException(`Court ${params.courtId} không tồn tại`);
    }
    const venue = await this.venuesService.findByIdOrThrow(court.venueId);
    if (venue.status !== VenueStatus.ACTIVE) {
      throw new NotFoundException(`Court ${params.courtId} không tồn tại`);
    }

    const slotStarts = generateBookingSlotStarts(params.startTime, params.endTime, {
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
    const computedPrice = Math.round(pricePerSlot * slotStarts.length * 100) / 100;
    const totalPrice = params.totalPriceOverride ?? computedPrice;

    try {
      const booking = await this.dataSource.transaction(async (manager) => {
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
        });
        const saved = await manager.save(entity);

        const slots = slotStarts.map((slotStart) =>
          manager.create(BookingSlot, {
            bookingId: saved.id,
            courtId: params.courtId,
            date: params.date,
            slotStart,
          }),
        );
        await manager.save(slots);
        await this.paymentsService.createForBooking(saved.id, manager);

        return saved;
      });
      return { booking, court, venue };
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
```

Add `RecurringSchedule` is not needed here; but the `Court` and `Venue` types used in the new method's return type are already imported at the top of the file (`import { Court, CourtStatus } from '../courts/entities/court.entity';` and `import { Venue, VenueStatus } from '../courts/entities/venue.entity';`) — no new imports required for this step.

- [ ] **Step 3: Run the tests to verify the refactor is behavior-preserving**

Run (from `apps/api`): `npx jest src/bookings/bookings.service.spec.ts`
Expected: PASS — same test count and assertions as Step 1, unchanged.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts
git commit -m "refactor(api): extract BookingsService.createBookingRecord for reuse"
```

---

### Task 4: Owner walk-in booking creation (`POST /venues/mine/:venueId/bookings`)

**Files:**
- Create: `apps/api/src/bookings/dto/create-owner-booking.dto.ts`
- Modify: `apps/api/src/bookings/bookings.service.ts`
- Modify: `apps/api/src/bookings/bookings.module.ts`
- Modify: `apps/api/src/bookings/bookings.controller.ts`
- Modify: `apps/api/src/bookings/bookings.service.spec.ts`

**Interfaces:**
- Consumes: `CustomerContactsService.resolveSelector` (Task 2), `BookingsService.createBookingRecord` (Task 3).
- Produces: `BookingsService.createForOwner(ownerId: string, venueId: string, dto: CreateOwnerBookingDto): Promise<Booking>`, and route `POST /venues/mine/:venueId/bookings`.

- [ ] **Step 1: Write the DTO**

```ts
// apps/api/src/bookings/dto/create-owner-booking.dto.ts
import { IsString, Matches, MinLength } from 'class-validator';
import { TIME_PATTERN } from '../../courts/time.util';
import { CustomerSelectorDto } from '../../customer-contacts/dto/customer-selector.dto';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateOwnerBookingDto extends CustomerSelectorDto {
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

Append to `apps/api/src/bookings/bookings.service.spec.ts` (add `CustomerContactsService` to the mocks first — see next sub-step):

At the top of the file, add the import:

```ts
import { CustomerContactsService } from '../customer-contacts/customer-contacts.service';
```

Add a mock factory near the other mocks:

```ts
const mockCustomerContactsService = () => ({
  resolveSelector: jest.fn(),
  findById: jest.fn(),
});
```

In `buildTestingModule()`, add the provider:

```ts
      { provide: CustomerContactsService, useFactory: mockCustomerContactsService },
```

and add the returned accessor:

```ts
    customerContactsService: module.get(CustomerContactsService) as ReturnType<
      typeof mockCustomerContactsService
    >,
```

Then append this new `describe` block at the end of the file:

```ts
describe('BookingsService.createForOwner', () => {
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
    name: 'Sân 1',
    status: CourtStatus.ACTIVE,
    openTime: '08:00',
    closeTime: '20:00',
    slotDurationMinutes: 60,
    pricePerHour: 100000,
  };
  const ACTIVE_VENUE = {
    id: 'venue-1',
    name: 'Venue A',
    ownerId: 'owner-1',
    status: VenueStatus.ACTIVE,
  };

  it('creates a walk-in booking via newCustomer and skips the customer email', async () => {
    const {
      service,
      courtsService,
      venuesService,
      customerContactsService,
      dataSource,
      notificationsService,
    } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue(ACTIVE_VENUE);
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    customerContactsService.resolveSelector.mockResolvedValue({
      customerContactId: 'contact-1',
    });
    const manager = buildMockManager();
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.createForOwner('owner-1', 'venue-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '10:00',
      newCustomer: { fullName: 'Khách vãng lai', phone: '0911111111' },
    });

    expect(customerContactsService.resolveSelector).toHaveBeenCalledWith('owner-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '10:00',
      newCustomer: { fullName: 'Khách vãng lai', phone: '0911111111' },
    });
    expect(result.customerContactId).toBe('contact-1');
    expect(result.totalPrice).toBe(200000);
    expect(notificationsService.notifyBookingConfirmed).not.toHaveBeenCalled();
  });

  it('sends the confirmation email when the resolved customer is a registered user', async () => {
    const {
      service,
      courtsService,
      venuesService,
      usersService,
      customerContactsService,
      dataSource,
      notificationsService,
    } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue(ACTIVE_VENUE);
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    customerContactsService.resolveSelector.mockResolvedValue({ customerId: 'customer-1' });
    usersService.findById.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@test.com',
      fullName: 'Nguyễn Văn A',
    });
    const manager = buildMockManager();
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    await service.createForOwner('owner-1', 'venue-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      customerId: 'customer-1',
    });

    expect(notificationsService.notifyBookingConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'customer@test.com' }),
    );
    expect(notificationsService.notifyNewBookingForOwner).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the court does not belong to the venue', async () => {
    const { service, courtsService, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue(ACTIVE_VENUE);
    courtsService.findByIdOrThrow.mockResolvedValue({ ...ACTIVE_COURT, venueId: 'other-venue' });

    await expect(
      service.createForOwner('owner-1', 'venue-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:00',
        endTime: '09:00',
        customerId: 'customer-1',
      }),
    ).rejects.toThrow('Court court-1 không tồn tại');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (from `apps/api`): `npx jest src/bookings/bookings.service.spec.ts`
Expected: FAIL — `service.createForOwner is not a function`.

- [ ] **Step 4: Implement `createForOwner` in `BookingsService`**

Add the `CustomerContactsService` import and constructor injection at the top of `apps/api/src/bookings/bookings.service.ts`:

```ts
import { CustomerContactsService } from '../customer-contacts/customer-contacts.service';
```

In the constructor, add the parameter:

```ts
    private readonly customerContactsService: CustomerContactsService,
```

Add this method (e.g. directly below `create`):

```ts
  async createForOwner(
    ownerId: string,
    venueId: string,
    dto: CreateOwnerBookingDto,
  ): Promise<Booking> {
    const venue = await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const court = await this.courtsService.findByIdOrThrow(dto.courtId);
    if (court.venueId !== venueId) {
      throw new NotFoundException(`Court ${dto.courtId} không tồn tại`);
    }

    const customerRef = await this.customerContactsService.resolveSelector(ownerId, dto);

    const { booking } = await this.createBookingRecord({
      courtId: dto.courtId,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      ...customerRef,
    });

    if (customerRef.customerId) {
      const customer = await this.usersService.findById(customerRef.customerId);
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
    }

    return booking;
  }
```

Add the import for the DTO near the top of the file:

```ts
import { CreateOwnerBookingDto } from './dto/create-owner-booking.dto';
```

- [ ] **Step 5: Wire `CustomerContactsModule` into `BookingsModule`**

In `apps/api/src/bookings/bookings.module.ts`, add the import:

```ts
import { CustomerContactsModule } from '../customer-contacts/customer-contacts.module';
```

and add `CustomerContactsModule` to the `imports` array.

- [ ] **Step 6: Add the controller endpoint**

In `apps/api/src/bookings/bookings.controller.ts`, add the import:

```ts
import { CreateOwnerBookingDto } from './dto/create-owner-booking.dto';
```

and add this method to `BookingsController` (e.g. right after `cancelForVenue`):

```ts
  @Post('venues/mine/:venueId/bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  createForVenue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Body() dto: CreateOwnerBookingDto,
  ) {
    return this.bookingsService.createForOwner(user.userId, venueId, dto);
  }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run (from `apps/api`): `npx jest src/bookings/bookings.service.spec.ts`
Expected: PASS (all tests, including the 3 new ones).

- [ ] **Step 8: Build**

Run (from `apps/api`): `npm run build`
Expected: success.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/bookings apps/api/src/customer-contacts
git commit -m "feat(api): add owner walk-in booking creation endpoint"
```

---

### Task 5: Booking code + walk-in-aware customer display on owner reads

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts`
- Create: `apps/api/src/bookings/booking-code.util.ts`
- Create: `apps/api/src/bookings/booking-code.util.spec.ts`
- Modify: `apps/api/src/bookings/bookings.service.spec.ts`

**Interfaces:**
- Produces: `buildBookingCode(id: string): string`, `BookingWithCustomerInfo.bookingCode: string` — consumed by the frontend (Task 11+) via the existing `GET /venues/mine/:venueId/bookings` response.
- `findByVenueForOwner` now resolves customer display name/phone from either `users` or `customer_contacts`, and `cancel()` skips the customer notification email when `booking.customerId` is null.

- [ ] **Step 1: Write the failing util test**

```ts
// apps/api/src/bookings/booking-code.util.spec.ts
import { buildBookingCode } from './booking-code.util';

describe('buildBookingCode', () => {
  it('formats the first 8 characters of the id, uppercased, with a DL- prefix', () => {
    expect(buildBookingCode('3f9a2b10-cccc-dddd-eeee-ffffffffffff')).toBe('DL-3F9A2B10');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `apps/api`): `npx jest src/bookings/booking-code.util.spec.ts`
Expected: FAIL — `Cannot find module './booking-code.util'`.

- [ ] **Step 3: Implement the util**

```ts
// apps/api/src/bookings/booking-code.util.ts
export function buildBookingCode(id: string): string {
  return `DL-${id.slice(0, 8).toUpperCase()}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run (from `apps/api`): `npx jest src/bookings/booking-code.util.spec.ts`
Expected: PASS.

- [ ] **Step 5: Update the existing `findByVenueForOwner` regression test**

In `apps/api/src/bookings/bookings.service.spec.ts`, add the import:

```ts
import { buildBookingCode } from './booking-code.util';
```

In the `describe('BookingsService.findByVenueForOwner', ...)` block, update the first test's expectation to include `bookingCode`:

```ts
    expect(result).toEqual([
      {
        id: 'booking-1',
        customerId: 'customer-1',
        customerName: 'Nguyễn Văn A',
        customerPhone: '0900000000',
        bookingCode: buildBookingCode('booking-1'),
        paymentStatus: PaymentStatus.UNPAID,
        paymentNote: null,
        paidAt: null,
        refundedAt: null,
      },
    ]);
```

Add a new test in the same `describe` block for the walk-in path:

```ts
  it('resolves customer name/phone from customer_contacts for walk-in bookings', async () => {
    const { service, bookingsRepo, courtsService, customerContactsService, paymentsService } =
      await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([{ id: 'court-1' }]);
    bookingsRepo.find.mockResolvedValue([
      { id: 'booking-2', customerId: null, customerContactId: 'contact-1' },
    ]);
    customerContactsService.findById.mockResolvedValue({
      id: 'contact-1',
      fullName: 'Khách vãng lai',
      phone: '0922222222',
    });
    paymentsService.findByBookingId.mockResolvedValue(null);

    const result = await service.findByVenueForOwner('owner-1', 'venue-1', {});

    expect(result[0]).toMatchObject({
      customerName: 'Khách vãng lai',
      customerPhone: '0922222222',
      bookingCode: buildBookingCode('booking-2'),
    });
  });
```

- [ ] **Step 6: Run the tests to verify the new/updated assertions fail**

Run (from `apps/api`): `npx jest src/bookings/bookings.service.spec.ts`
Expected: FAIL — `bookingCode` missing from the actual result, and `customerContactsService.findById` not called.

- [ ] **Step 7: Implement the changes in `BookingsService`**

Add the import at the top of `apps/api/src/bookings/bookings.service.ts`:

```ts
import { buildBookingCode } from './booking-code.util';
```

Update the `BookingWithCustomerInfo` type:

```ts
type BookingWithCustomerInfo = Booking & {
  customerName: string;
  customerPhone: string | null;
  bookingCode: string;
} & PaymentInfo;
```

Replace the body of `findByVenueForOwner`'s `Promise.all(...)` mapping (the part building the return value) with:

```ts
    return Promise.all(
      bookings.map(async (booking) => {
        const { name, phone } = await this.resolveCustomerDisplay(booking);
        const withPayment = await this.attachPaymentInfo(booking);
        return {
          ...withPayment,
          customerName: name,
          customerPhone: phone,
          bookingCode: buildBookingCode(booking.id),
        };
      }),
    );
```

Add this new private method (e.g. next to `attachPaymentInfo`):

```ts
  private async resolveCustomerDisplay(
    booking: Booking,
  ): Promise<{ name: string; phone: string | null }> {
    if (booking.customerId) {
      const customer = await this.usersService.findById(booking.customerId);
      return { name: customer?.fullName ?? 'Không rõ', phone: customer?.phone ?? null };
    }
    if (booking.customerContactId) {
      const contact = await this.customerContactsService.findById(booking.customerContactId);
      return { name: contact?.fullName ?? 'Không rõ', phone: contact?.phone ?? null };
    }
    return { name: 'Không rõ', phone: null };
  }
```

In the private `cancel()` method, replace:

```ts
    const customer = await this.usersService.findById(booking.customerId);
    await this.notificationsService.notifyBookingCancelled({
      to: customer?.email ?? '',
      venueName: venue.name,
      courtName: court.name,
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      cancelledBy: cancelledBy === booking.customerId ? 'customer' : 'owner',
    });

    return saved;
```

with:

```ts
    if (booking.customerId) {
      const customer = await this.usersService.findById(booking.customerId);
      await this.notificationsService.notifyBookingCancelled({
        to: customer?.email ?? '',
        venueName: venue.name,
        courtName: court.name,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        cancelledBy: cancelledBy === booking.customerId ? 'customer' : 'owner',
      });
    }

    return saved;
```

- [ ] **Step 8: Run the tests to verify they pass**

Run (from `apps/api`): `npx jest src/bookings/bookings.service.spec.ts`
Expected: PASS (all tests, including the new walk-in display test).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/bookings
git commit -m "feat(api): add booking codes and walk-in customer display on owner reads"
```

---

### Task 6: Recurring schedule data model (`recurring_schedules` + `bookings.recurring_schedule_id`)

**Files:**
- Create: `apps/api/src/recurring-schedules/entities/recurring-schedule.entity.ts`
- Create: `apps/api/src/migrations/1787880000000-AddRecurringSchedulesToBookings.ts`
- Modify: `apps/api/src/bookings/entities/booking.entity.ts`

**Interfaces:**
- Produces: `RecurringSchedule` entity, `RecurringScheduleStatus` enum — consumed by Task 8.
- Produces: `Booking.recurringScheduleId: string | null` — consumed by Task 5's already-written code (spread through `attachPaymentInfo`) with no further change needed, and by Task 8, and by the frontend (Task 11+).

- [ ] **Step 1: Create the `RecurringSchedule` entity**

```ts
// apps/api/src/recurring-schedules/entities/recurring-schedule.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { timeColumnTransformer } from '../../bookings/time-column.transformer';

export enum RecurringScheduleStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
}

@Entity('recurring_schedules')
export class RecurringSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'court_id' })
  courtId: string;

  @Column({ name: 'customer_id', nullable: true, type: 'varchar' })
  customerId: string | null;

  @Column({ name: 'customer_contact_id', nullable: true, type: 'varchar' })
  customerContactId: string | null;

  @Column({ name: 'day_of_week', type: 'int' })
  dayOfWeek: number;

  @Column({
    name: 'start_time',
    type: 'time',
    transformer: timeColumnTransformer,
  })
  startTime: string;

  @Column({
    name: 'end_time',
    type: 'time',
    transformer: timeColumnTransformer,
  })
  endTime: string;

  @Column({
    name: 'price_per_session',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  pricePerSession: number;

  @Column({
    name: 'discount_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) => (value === null ? null : parseFloat(value)),
    },
  })
  discountPercent: number | null;

  @Column({ name: 'valid_from', type: 'date' })
  validFrom: string;

  @Column({ name: 'valid_to', type: 'date' })
  validTo: string;

  @Column({ nullable: true, type: 'varchar' })
  note: string | null;

  @Column({
    type: 'enum',
    enum: RecurringScheduleStatus,
    default: RecurringScheduleStatus.ACTIVE,
  })
  status: RecurringScheduleStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Update the `Booking` entity**

In `apps/api/src/bookings/entities/booking.entity.ts`, add (below `customerContactId`):

```ts
  @Column({ name: 'recurring_schedule_id', nullable: true, type: 'varchar' })
  recurringScheduleId: string | null;
```

- [ ] **Step 3: Write the migration**

```ts
// apps/api/src/migrations/1787880000000-AddRecurringSchedulesToBookings.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecurringSchedulesToBookings1787880000000
  implements MigrationInterface
{
  name = 'AddRecurringSchedulesToBookings1787880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."recurring_schedules_status_enum" AS ENUM('active', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "recurring_schedules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "court_id" character varying NOT NULL, "customer_id" character varying, "customer_contact_id" character varying, "day_of_week" integer NOT NULL, "start_time" TIME NOT NULL, "end_time" TIME NOT NULL, "price_per_session" numeric(10,2) NOT NULL, "discount_percent" numeric(5,2), "valid_from" date NOT NULL, "valid_to" date NOT NULL, "note" character varying, "status" "public"."recurring_schedules_status_enum" NOT NULL DEFAULT 'active', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_recurring_schedules_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_recurring_schedules_customer_xor" CHECK (("customer_id" IS NOT NULL) <> ("customer_contact_id" IS NOT NULL)))`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "recurring_schedule_id" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_recurring_schedule_id" FOREIGN KEY ("recurring_schedule_id") REFERENCES "recurring_schedules"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_recurring_schedule_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN "recurring_schedule_id"`,
    );
    await queryRunner.query(`DROP TABLE "recurring_schedules"`);
    await queryRunner.query(
      `DROP TYPE "public"."recurring_schedules_status_enum"`,
    );
  }
}
```

- [ ] **Step 4: Run the existing suite and build**

Run (from `apps/api`): `npx jest src/bookings` then `npm run build`
Expected: both PASS/succeed (entity-only addition, no behavior change yet).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/recurring-schedules/entities apps/api/src/migrations/1787880000000-AddRecurringSchedulesToBookings.ts apps/api/src/bookings/entities/booking.entity.ts
git commit -m "feat(api): add recurring_schedules table and bookings.recurring_schedule_id"
```

---

### Task 7: `cancelFutureOccurrences` on `BookingsService`

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts`
- Modify: `apps/api/src/bookings/bookings.service.spec.ts`

**Interfaces:**
- Produces: `BookingsService.cancelFutureOccurrences(scheduleId: string, cancelledBy: string): Promise<void>` — consumed by Task 8's `RecurringSchedulesService.cancel`.

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/bookings/bookings.service.spec.ts`:

```ts
describe('BookingsService.cancelFutureOccurrences', () => {
  const FIXED_NOW = new Date('2026-08-24T10:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('cancels only confirmed future occurrences of the schedule and frees their slots', async () => {
    const { service, dataSource } = await buildTestingModule();
    const futureBooking = {
      id: 'booking-future',
      date: '2026-08-25',
      status: BookingStatus.CONFIRMED,
    };
    const pastBooking = {
      id: 'booking-past',
      date: '2026-08-01',
      status: BookingStatus.CONFIRMED,
    };
    const manager = {
      find: jest.fn().mockResolvedValue([futureBooking, pastBooking]),
      save: jest.fn((data: unknown) => Promise.resolve(data)),
      delete: jest.fn(),
    };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    await service.cancelFutureOccurrences('schedule-1', 'owner-1');

    expect(manager.find).toHaveBeenCalledWith(Booking, {
      where: { recurringScheduleId: 'schedule-1', status: BookingStatus.CONFIRMED },
    });
    expect(futureBooking.status).toBe(BookingStatus.CANCELLED);
    expect(manager.delete).toHaveBeenCalledWith(BookingSlot, { bookingId: 'booking-future' });
    expect(manager.delete).not.toHaveBeenCalledWith(BookingSlot, { bookingId: 'booking-past' });
    expect(pastBooking.status).toBe(BookingStatus.CONFIRMED);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `apps/api`): `npx jest src/bookings/bookings.service.spec.ts`
Expected: FAIL — `service.cancelFutureOccurrences is not a function`.

- [ ] **Step 3: Implement the method**

Add to `apps/api/src/bookings/bookings.service.ts` (e.g. below `createBookingRecord`):

```ts
  async cancelFutureOccurrences(scheduleId: string, cancelledBy: string): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    await this.dataSource.transaction(async (manager) => {
      const bookings = await manager.find(Booking, {
        where: { recurringScheduleId: scheduleId, status: BookingStatus.CONFIRMED },
      });
      for (const booking of bookings) {
        if (booking.date < today) {
          continue;
        }
        booking.status = BookingStatus.CANCELLED;
        booking.cancelledAt = new Date();
        booking.cancelledBy = cancelledBy;
        await manager.save(booking);
        await manager.delete(BookingSlot, { bookingId: booking.id });
      }
    });
  }
```

- [ ] **Step 4: Run it to verify it passes**

Run (from `apps/api`): `npx jest src/bookings/bookings.service.spec.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.service.spec.ts
git commit -m "feat(api): add BookingsService.cancelFutureOccurrences"
```

---

### Task 8: `RecurringSchedulesModule` — create (with occurrence generation) and cancel

**Files:**
- Create: `apps/api/src/recurring-schedules/occurrence-dates.util.ts`
- Create: `apps/api/src/recurring-schedules/occurrence-dates.util.spec.ts`
- Create: `apps/api/src/recurring-schedules/dto/create-recurring-schedule.dto.ts`
- Create: `apps/api/src/recurring-schedules/recurring-schedules.service.ts`
- Create: `apps/api/src/recurring-schedules/recurring-schedules.service.spec.ts`
- Create: `apps/api/src/recurring-schedules/recurring-schedules.controller.ts`
- Create: `apps/api/src/recurring-schedules/recurring-schedules.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `BookingsService.createBookingRecord`, `.cancelFutureOccurrences` (Tasks 3, 7); `CustomerContactsService.resolveSelector` (Task 2); `CourtsService.findByIdOrThrow`, `VenuesService.getOwnedVenueOrThrow` (existing).
- Produces: routes `POST /venues/mine/:venueId/recurring-schedules`, `POST /venues/mine/:venueId/recurring-schedules/:id/cancel`.

- [ ] **Step 1: Write the failing occurrence-dates test**

```ts
// apps/api/src/recurring-schedules/occurrence-dates.util.spec.ts
import { generateOccurrenceDates } from './occurrence-dates.util';

describe('generateOccurrenceDates', () => {
  it('returns every Monday (dayOfWeek 0) in the range, inclusive', () => {
    // 2024-01-01 is a Monday, 2024-01-14 is a Sunday.
    expect(generateOccurrenceDates('2024-01-01', '2024-01-14', 0)).toEqual([
      '2024-01-01',
      '2024-01-08',
    ]);
  });

  it('returns every Sunday (dayOfWeek 6) in the range, inclusive', () => {
    expect(generateOccurrenceDates('2024-01-01', '2024-01-14', 6)).toEqual([
      '2024-01-07',
      '2024-01-14',
    ]);
  });

  it('returns an empty array when the range is shorter than a week and does not include the day', () => {
    expect(generateOccurrenceDates('2024-01-02', '2024-01-03', 0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run (from `apps/api`): `npx jest src/recurring-schedules/occurrence-dates.util.spec.ts`
Expected: FAIL — `Cannot find module './occurrence-dates.util'`.

- [ ] **Step 3: Implement the util**

```ts
// apps/api/src/recurring-schedules/occurrence-dates.util.ts
export function generateOccurrenceDates(
  validFrom: string,
  validTo: string,
  dayOfWeek: number,
): string[] {
  const jsDay = (dayOfWeek + 1) % 7;
  const dates: string[] = [];
  const cursor = new Date(`${validFrom}T00:00:00Z`);
  const end = new Date(`${validTo}T00:00:00Z`);
  while (cursor <= end) {
    if (cursor.getUTCDay() === jsDay) {
      dates.push(cursor.toISOString().slice(0, 10));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run (from `apps/api`): `npx jest src/recurring-schedules/occurrence-dates.util.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the DTO**

```ts
// apps/api/src/recurring-schedules/dto/create-recurring-schedule.dto.ts
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { TIME_PATTERN } from '../../courts/time.util';
import { CustomerSelectorDto } from '../../customer-contacts/dto/customer-selector.dto';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateRecurringScheduleDto extends CustomerSelectorDto {
  @IsString()
  @MinLength(1)
  courtId: string;

  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @Matches(TIME_PATTERN, { message: 'startTime phải theo định dạng HH:mm' })
  startTime: string;

  @Matches(TIME_PATTERN, { message: 'endTime phải theo định dạng HH:mm' })
  endTime: string;

  @IsNumber()
  @Min(0.01)
  pricePerSession: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @Matches(DATE_PATTERN, { message: 'validFrom phải theo định dạng YYYY-MM-DD' })
  validFrom: string;

  @Matches(DATE_PATTERN, { message: 'validTo phải theo định dạng YYYY-MM-DD' })
  validTo: string;

  @IsOptional()
  @IsString()
  note?: string;
}
```

- [ ] **Step 6: Write the failing service tests**

```ts
// apps/api/src/recurring-schedules/recurring-schedules.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { RecurringSchedulesService } from './recurring-schedules.service';
import { RecurringSchedule, RecurringScheduleStatus } from './entities/recurring-schedule.entity';
import { CourtsService } from '../courts/courts.service';
import { VenuesService } from '../courts/venues.service';
import { CustomerContactsService } from '../customer-contacts/customer-contacts.service';
import { BookingsService } from '../bookings/bookings.service';

const mockRepository = () => ({
  create: jest.fn((data: unknown) => data),
  save: jest.fn((data: unknown) => Promise.resolve({ id: 'schedule-1', ...(data as object) })),
  findOne: jest.fn(),
});

const mockCourtsService = () => ({ findByIdOrThrow: jest.fn() });
const mockVenuesService = () => ({ getOwnedVenueOrThrow: jest.fn() });
const mockCustomerContactsService = () => ({ resolveSelector: jest.fn() });
const mockBookingsService = () => ({
  createBookingRecord: jest.fn(),
  cancelFutureOccurrences: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      RecurringSchedulesService,
      { provide: getRepositoryToken(RecurringSchedule), useFactory: mockRepository },
      { provide: CourtsService, useFactory: mockCourtsService },
      { provide: VenuesService, useFactory: mockVenuesService },
      { provide: CustomerContactsService, useFactory: mockCustomerContactsService },
      { provide: BookingsService, useFactory: mockBookingsService },
    ],
  }).compile();

  return {
    service: module.get(RecurringSchedulesService),
    repo: module.get(getRepositoryToken(RecurringSchedule)) as ReturnType<typeof mockRepository>,
    courtsService: module.get(CourtsService) as ReturnType<typeof mockCourtsService>,
    venuesService: module.get(VenuesService) as ReturnType<typeof mockVenuesService>,
    customerContactsService: module.get(CustomerContactsService) as ReturnType<
      typeof mockCustomerContactsService
    >,
    bookingsService: module.get(BookingsService) as ReturnType<typeof mockBookingsService>,
  };
}

describe('RecurringSchedulesService.create', () => {
  const ACTIVE_COURT = { id: 'court-1', venueId: 'venue-1' };

  it('creates the schedule and one booking occurrence per matching day, applying the discount', async () => {
    const { service, courtsService, venuesService, customerContactsService, bookingsService } =
      await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    customerContactsService.resolveSelector.mockResolvedValue({ customerContactId: 'contact-1' });
    bookingsService.createBookingRecord.mockResolvedValue({});

    const result = await service.create('owner-1', 'venue-1', {
      courtId: 'court-1',
      dayOfWeek: 0,
      startTime: '18:00',
      endTime: '19:00',
      pricePerSession: 100000,
      discountPercent: 10,
      validFrom: '2024-01-01',
      validTo: '2024-01-14',
      newCustomer: { fullName: 'Khách quen', phone: '0933333333' },
    });

    expect(bookingsService.createBookingRecord).toHaveBeenCalledTimes(2);
    expect(bookingsService.createBookingRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        courtId: 'court-1',
        date: '2024-01-01',
        startTime: '18:00',
        endTime: '19:00',
        customerContactId: 'contact-1',
        recurringScheduleId: 'schedule-1',
        totalPriceOverride: 90000,
      }),
    );
    expect(result).toEqual({
      schedule: expect.objectContaining({ id: 'schedule-1' }),
      generatedCount: 2,
      conflictingDates: [],
    });
  });

  it('collects conflicting dates instead of aborting the whole batch', async () => {
    const { service, courtsService, venuesService, customerContactsService, bookingsService } =
      await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    customerContactsService.resolveSelector.mockResolvedValue({ customerContactId: 'contact-1' });
    bookingsService.createBookingRecord
      .mockRejectedValueOnce(new ConflictException('Một hoặc nhiều khung giờ đã được đặt'))
      .mockResolvedValueOnce({});

    const result = await service.create('owner-1', 'venue-1', {
      courtId: 'court-1',
      dayOfWeek: 0,
      startTime: '18:00',
      endTime: '19:00',
      pricePerSession: 100000,
      validFrom: '2024-01-01',
      validTo: '2024-01-14',
      customerContactId: 'contact-1',
    });

    expect(result.generatedCount).toBe(1);
    expect(result.conflictingDates).toEqual(['2024-01-01']);
  });

  it('throws BadRequestException when the range exceeds 12 months', async () => {
    const { service, courtsService, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);

    await expect(
      service.create('owner-1', 'venue-1', {
        courtId: 'court-1',
        dayOfWeek: 0,
        startTime: '18:00',
        endTime: '19:00',
        pricePerSession: 100000,
        validFrom: '2024-01-01',
        validTo: '2025-06-01',
        customerContactId: 'contact-1',
      }),
    ).rejects.toThrow('Khoảng thời gian lịch cố định tối đa 12 tháng');
  });

  it('throws NotFoundException when the court does not belong to the venue', async () => {
    const { service, courtsService, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsService.findByIdOrThrow.mockResolvedValue({ id: 'court-1', venueId: 'other-venue' });

    await expect(
      service.create('owner-1', 'venue-1', {
        courtId: 'court-1',
        dayOfWeek: 0,
        startTime: '18:00',
        endTime: '19:00',
        pricePerSession: 100000,
        validFrom: '2024-01-01',
        validTo: '2024-01-14',
        customerContactId: 'contact-1',
      }),
    ).rejects.toThrow('Court court-1 không tồn tại');
  });
});

describe('RecurringSchedulesService.cancel', () => {
  it('marks the schedule cancelled and cancels its future occurrences', async () => {
    const { service, repo, courtsService, venuesService, bookingsService } =
      await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    repo.findOne.mockResolvedValue({
      id: 'schedule-1',
      courtId: 'court-1',
      status: RecurringScheduleStatus.ACTIVE,
    });
    courtsService.findByIdOrThrow.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });

    const result = await service.cancel('owner-1', 'venue-1', 'schedule-1');

    expect(result.status).toBe(RecurringScheduleStatus.CANCELLED);
    expect(bookingsService.cancelFutureOccurrences).toHaveBeenCalledWith('schedule-1', 'owner-1');
  });

  it('throws BadRequestException when the schedule is already cancelled', async () => {
    const { service, repo, courtsService, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    repo.findOne.mockResolvedValue({
      id: 'schedule-1',
      courtId: 'court-1',
      status: RecurringScheduleStatus.CANCELLED,
    });
    courtsService.findByIdOrThrow.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });

    await expect(service.cancel('owner-1', 'venue-1', 'schedule-1')).rejects.toThrow(
      'Lịch cố định đã bị huỷ',
    );
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run (from `apps/api`): `npx jest src/recurring-schedules/recurring-schedules.service.spec.ts`
Expected: FAIL — `Cannot find module './recurring-schedules.service'`.

- [ ] **Step 8: Implement `RecurringSchedulesService`**

```ts
// apps/api/src/recurring-schedules/recurring-schedules.service.ts
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecurringSchedule, RecurringScheduleStatus } from './entities/recurring-schedule.entity';
import { CreateRecurringScheduleDto } from './dto/create-recurring-schedule.dto';
import { generateOccurrenceDates } from './occurrence-dates.util';
import { CourtsService } from '../courts/courts.service';
import { VenuesService } from '../courts/venues.service';
import { CustomerContactsService } from '../customer-contacts/customer-contacts.service';
import { BookingsService } from '../bookings/bookings.service';

const MAX_SPAN_DAYS = 366;

@Injectable()
export class RecurringSchedulesService {
  constructor(
    @InjectRepository(RecurringSchedule)
    private readonly repository: Repository<RecurringSchedule>,
    private readonly courtsService: CourtsService,
    private readonly venuesService: VenuesService,
    private readonly customerContactsService: CustomerContactsService,
    private readonly bookingsService: BookingsService,
  ) {}

  async create(
    ownerId: string,
    venueId: string,
    dto: CreateRecurringScheduleDto,
  ): Promise<{ schedule: RecurringSchedule; generatedCount: number; conflictingDates: string[] }> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const court = await this.courtsService.findByIdOrThrow(dto.courtId);
    if (court.venueId !== venueId) {
      throw new NotFoundException(`Court ${dto.courtId} không tồn tại`);
    }
    if (dto.validFrom > dto.validTo) {
      throw new BadRequestException('validFrom phải trước hoặc bằng validTo');
    }
    const spanDays =
      (new Date(`${dto.validTo}T00:00:00Z`).getTime() -
        new Date(`${dto.validFrom}T00:00:00Z`).getTime()) /
      (24 * 60 * 60 * 1000);
    if (spanDays > MAX_SPAN_DAYS) {
      throw new BadRequestException('Khoảng thời gian lịch cố định tối đa 12 tháng');
    }

    const customerRef = await this.customerContactsService.resolveSelector(ownerId, dto);

    const schedule = await this.repository.save(
      this.repository.create({
        courtId: dto.courtId,
        ...customerRef,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        pricePerSession: dto.pricePerSession,
        discountPercent: dto.discountPercent ?? null,
        validFrom: dto.validFrom,
        validTo: dto.validTo,
        note: dto.note ?? null,
      }),
    );

    const sessionPrice =
      Math.round(dto.pricePerSession * (1 - (dto.discountPercent ?? 0) / 100) * 100) / 100;
    const dates = generateOccurrenceDates(dto.validFrom, dto.validTo, dto.dayOfWeek);
    const conflictingDates: string[] = [];
    let generatedCount = 0;

    for (const date of dates) {
      try {
        await this.bookingsService.createBookingRecord({
          courtId: dto.courtId,
          date,
          startTime: dto.startTime,
          endTime: dto.endTime,
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

    return { schedule, generatedCount, conflictingDates };
  }

  async cancel(ownerId: string, venueId: string, id: string): Promise<RecurringSchedule> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const schedule = await this.repository.findOne({ where: { id } });
    if (!schedule) {
      throw new NotFoundException(`Lịch cố định ${id} không tồn tại`);
    }
    const court = await this.courtsService.findByIdOrThrow(schedule.courtId);
    if (court.venueId !== venueId) {
      throw new NotFoundException(`Lịch cố định ${id} không tồn tại`);
    }
    if (schedule.status === RecurringScheduleStatus.CANCELLED) {
      throw new BadRequestException('Lịch cố định đã bị huỷ');
    }

    schedule.status = RecurringScheduleStatus.CANCELLED;
    await this.repository.save(schedule);
    await this.bookingsService.cancelFutureOccurrences(id, ownerId);
    return schedule;
  }
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run (from `apps/api`): `npx jest src/recurring-schedules/recurring-schedules.service.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 10: Write the controller**

```ts
// apps/api/src/recurring-schedules/recurring-schedules.controller.ts
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { RecurringSchedulesService } from './recurring-schedules.service';
import { CreateRecurringScheduleDto } from './dto/create-recurring-schedule.dto';

@Controller()
export class RecurringSchedulesController {
  constructor(private readonly recurringSchedulesService: RecurringSchedulesService) {}

  @Post('venues/mine/:venueId/recurring-schedules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Body() dto: CreateRecurringScheduleDto,
  ) {
    return this.recurringSchedulesService.create(user.userId, venueId, dto);
  }

  @Post('venues/mine/:venueId/recurring-schedules/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.recurringSchedulesService.cancel(user.userId, venueId, id);
  }
}
```

- [ ] **Step 11: Write the module and register it**

```ts
// apps/api/src/recurring-schedules/recurring-schedules.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecurringSchedule } from './entities/recurring-schedule.entity';
import { RecurringSchedulesService } from './recurring-schedules.service';
import { RecurringSchedulesController } from './recurring-schedules.controller';
import { CourtsModule } from '../courts/courts.module';
import { CustomerContactsModule } from '../customer-contacts/customer-contacts.module';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecurringSchedule]),
    CourtsModule,
    CustomerContactsModule,
    BookingsModule,
  ],
  controllers: [RecurringSchedulesController],
  providers: [RecurringSchedulesService],
})
export class RecurringSchedulesModule {}
```

In `apps/api/src/app.module.ts`, add the import:

```ts
import { RecurringSchedulesModule } from './recurring-schedules/recurring-schedules.module';
```

and add `RecurringSchedulesModule` to the `imports` array.

- [ ] **Step 12: Build the whole backend**

Run (from `apps/api`): `npm run build`
Expected: success, no TypeScript errors.

- [ ] **Step 13: Run the full backend test suite**

Run (from `apps/api`): `npx jest`
Expected: PASS — every existing and new test.

- [ ] **Step 14: Commit**

```bash
git add apps/api/src/recurring-schedules apps/api/src/app.module.ts
git commit -m "feat(api): add RecurringSchedulesModule (create + cancel)"
```

---

### Task 9: Frontend BFF route handler for owner booking creation

**Files:**
- Modify: `apps/web/src/app/api/venues/mine/[venueId]/bookings/route.ts`

**Interfaces:**
- Produces: `POST /api/venues/mine/[venueId]/bookings` — consumed by Task 14 (quick-book dialog).

Note: the recurring-schedules NestJS endpoints from Task 8 do not get a BFF proxy route in this plan — nothing in this plan's frontend calls them (recurring-schedule creation UI belongs to the future "Bảng giá" page per the spec's §8 Ngoài phạm vi). Add that route handler when that page is built, following this same pattern.

This task has no unit tests (a thin proxy handler, same pattern as every other route handler in this codebase, none of which are tested). Verification is manual via Task 14's end-to-end check plus `npm run build`.

- [ ] **Step 1: Add `POST` to the existing bookings route handler**

In `apps/web/src/app/api/venues/mine/[venueId]/bookings/route.ts`, keep the existing `GET` export and add:

```ts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await params;
  const body = await request.json();
  const upstream = await fetchApi(`/venues/mine/${venueId}/bookings`, {
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

- [ ] **Step 2: Build**

Run (from `apps/web`): `npm run build`
Expected: success, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/api/venues/mine/[venueId]/bookings/route.ts
git commit -m "feat(web): add BFF route for owner booking creation"
```

---

### Task 10: `lib/booking-grid.ts` — pure grid-cell derivation

**Files:**
- Create: `apps/web/src/lib/booking-grid.ts`
- Create: `apps/web/src/lib/booking-grid.test.ts`

**Interfaces:**
- Produces: `CellState` type, `GridCourt`, `GridBooking` interfaces, `buildHourAxis(courts: GridCourt[]): string[]`, `computeCellState(court: GridCourt, hour: string, bookings: GridBooking[], now: Date | null): { state: CellState; bookingIds: string[] }`, `computeMaxConsecutiveHours(court: GridCourt, startHour: string, bookings: GridBooking[]): number` — consumed by Task 13 (grid render component and page-level stat counting) and Task 14 (quick-book duration cap).

- [ ] **Step 1: Write the failing tests**

```ts
// apps/web/src/lib/booking-grid.test.ts
import { describe, expect, it } from "vitest";
import {
  buildHourAxis,
  computeCellState,
  computeMaxConsecutiveHours,
  type GridBooking,
  type GridCourt,
} from "./booking-grid";

const COURT_A: GridCourt = { id: "court-a", status: "active", openTime: "08:00", closeTime: "11:00" };
const COURT_B: GridCourt = { id: "court-b", status: "active", openTime: "09:00", closeTime: "12:00" };
const MAINTENANCE_COURT: GridCourt = { id: "court-m", status: "maintenance", openTime: "08:00", closeTime: "20:00" };

describe("buildHourAxis", () => {
  it("unions the open/close range across active courts", () => {
    expect(buildHourAxis([COURT_A, COURT_B])).toEqual(["08:00", "09:00", "10:00", "11:00"]);
  });

  it("ignores non-active courts", () => {
    expect(buildHourAxis([MAINTENANCE_COURT])).toEqual([]);
  });

  it("returns an empty array when there are no courts", () => {
    expect(buildHourAxis([])).toEqual([]);
  });
});

describe("computeCellState", () => {
  const booking = (overrides: Partial<GridBooking>): GridBooking => ({
    id: "b1",
    courtId: "court-a",
    startTime: "08:00",
    endTime: "09:00",
    status: "confirmed",
    recurringScheduleId: null,
    ...overrides,
  });

  it("returns unavailable for a non-active court regardless of bookings", () => {
    expect(computeCellState(MAINTENANCE_COURT, "08:00", [], null)).toEqual({
      state: "unavailable",
      bookingIds: [],
    });
  });

  it("returns empty when no booking overlaps the hour", () => {
    expect(computeCellState(COURT_A, "10:00", [booking({})], null)).toEqual({
      state: "empty",
      bookingIds: [],
    });
  });

  it("returns booked when a confirmed booking overlaps and now is not provided", () => {
    expect(computeCellState(COURT_A, "08:00", [booking({})], null)).toEqual({
      state: "booked",
      bookingIds: ["b1"],
    });
  });

  it("ignores cancelled bookings", () => {
    expect(
      computeCellState(COURT_A, "08:00", [booking({ status: "cancelled" })], null),
    ).toEqual({ state: "empty", bookingIds: [] });
  });

  it("returns playing when now falls within the overlapping booking's window", () => {
    const now = new Date(2026, 7, 25, 8, 30);
    expect(computeCellState(COURT_A, "08:00", [booking({})], now)).toEqual({
      state: "playing",
      bookingIds: ["b1"],
    });
  });

  it("does not return playing when now is outside the booking's window", () => {
    const now = new Date(2026, 7, 25, 14, 0);
    expect(computeCellState(COURT_A, "08:00", [booking({})], now)).toEqual({
      state: "booked",
      bookingIds: ["b1"],
    });
  });

  it("returns recurring when the overlapping booking has a recurringScheduleId, even if it is currently playing", () => {
    const now = new Date(2026, 7, 25, 8, 30);
    expect(
      computeCellState(COURT_A, "08:00", [booking({ recurringScheduleId: "schedule-1" })], now),
    ).toEqual({ state: "recurring", bookingIds: ["b1"] });
  });

  it("reports every overlapping booking id when two half-hour bookings share the hour", () => {
    const bookings = [
      booking({ id: "b1", startTime: "08:00", endTime: "08:30" }),
      booking({ id: "b2", startTime: "08:30", endTime: "09:00" }),
    ];
    const result = computeCellState(COURT_A, "08:00", bookings, null);
    expect(result.state).toBe("booked");
    expect(result.bookingIds).toEqual(["b1", "b2"]);
  });
});

describe("computeMaxConsecutiveHours", () => {
  it("counts consecutive empty hours from the start hour until a booked hour or closing time", () => {
    const bookings = [
      {
        id: "b1",
        courtId: "court-a",
        startTime: "10:00",
        endTime: "11:00",
        status: "confirmed" as const,
        recurringScheduleId: null,
      },
    ];
    expect(computeMaxConsecutiveHours(COURT_A, "08:00", bookings)).toBe(2);
  });

  it("returns 0 when the start hour itself is booked", () => {
    const bookings = [
      {
        id: "b1",
        courtId: "court-a",
        startTime: "08:00",
        endTime: "09:00",
        status: "confirmed" as const,
        recurringScheduleId: null,
      },
    ];
    expect(computeMaxConsecutiveHours(COURT_A, "08:00", bookings)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/web`): `npx vitest run src/lib/booking-grid.test.ts`
Expected: FAIL — `Cannot find module './booking-grid'`.

- [ ] **Step 3: Implement `lib/booking-grid.ts`**

```ts
// apps/web/src/lib/booking-grid.ts
export type CellState = "empty" | "booked" | "playing" | "recurring" | "unavailable";

export interface GridCourt {
  id: string;
  status: "active" | "maintenance" | "closed";
  openTime: string;
  closeTime: string;
}

export interface GridBooking {
  id: string;
  courtId: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "cancelled" | "completed";
  recurringScheduleId: string | null;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function buildHourAxis(courts: GridCourt[]): string[] {
  const active = courts.filter((c) => c.status === "active");
  if (active.length === 0) return [];
  const openMinutes = Math.min(...active.map((c) => toMinutes(c.openTime)));
  const closeMinutes = Math.max(...active.map((c) => toMinutes(c.closeTime)));
  const hours: string[] = [];
  for (let m = openMinutes; m < closeMinutes; m += 60) {
    hours.push(toHHMM(m));
  }
  return hours;
}

export function computeCellState(
  court: GridCourt,
  hour: string,
  bookings: GridBooking[],
  now: Date | null,
): { state: CellState; bookingIds: string[] } {
  if (court.status !== "active") {
    return { state: "unavailable", bookingIds: [] };
  }
  const hourStart = toMinutes(hour);
  const hourEnd = hourStart + 60;
  const overlapping = bookings.filter((b) => {
    if (b.courtId !== court.id || b.status === "cancelled") return false;
    const start = toMinutes(b.startTime);
    const end = toMinutes(b.endTime);
    return start < hourEnd && end > hourStart;
  });
  if (overlapping.length === 0) {
    return { state: "empty", bookingIds: [] };
  }
  if (overlapping.some((b) => b.recurringScheduleId)) {
    return { state: "recurring", bookingIds: overlapping.map((b) => b.id) };
  }
  if (now) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const isPlaying = overlapping.some((b) => {
      const start = toMinutes(b.startTime);
      const end = toMinutes(b.endTime);
      return nowMinutes >= start && nowMinutes < end;
    });
    if (isPlaying) {
      return { state: "playing", bookingIds: overlapping.map((b) => b.id) };
    }
  }
  return { state: "booked", bookingIds: overlapping.map((b) => b.id) };
}

export function computeMaxConsecutiveHours(
  court: GridCourt,
  startHour: string,
  bookings: GridBooking[],
): number {
  const hours = buildHourAxis([court]).filter((hour) => hour >= startHour);
  let count = 0;
  for (const hour of hours) {
    const { state } = computeCellState(court, hour, bookings, null);
    if (state !== "empty") break;
    count += 1;
  }
  return count;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/web`): `npx vitest run src/lib/booking-grid.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/booking-grid.ts apps/web/src/lib/booking-grid.test.ts
git commit -m "feat(web): add pure booking-grid cell-state derivation"
```

---

### Task 11: `owner/bookings` page shell — types, data fetching, week/day navigation

**Files:**
- Create: `apps/web/src/app/owner/bookings/types.ts`
- Create: `apps/web/src/app/owner/bookings/week-day-nav.tsx`
- Modify: `apps/web/src/app/owner/bookings/page.tsx`

**Interfaces:**
- Produces: `BookingStatus`, `PaymentStatus`, `OwnerBooking` types (consumed by Task 12 Step 2, and Tasks 13, 14, 15).
- Produces: `WeekDayNav` component (`selectedDate: string`, `onSelectDate: (date: string) => void`), consumed by this task's `page.tsx`.
- `page.tsx` in this task fetches courts/bookings and renders the nav; the grid/status-bar/dialogs are wired in Tasks 13-15 (this task renders a placeholder in their place so the page is buildable and manually checkable after this task alone).

- [ ] **Step 1: Write `types.ts`**

```ts
// apps/web/src/app/owner/bookings/types.ts
export type BookingStatus = "confirmed" | "cancelled" | "completed";
export type PaymentStatus = "unpaid" | "paid" | "refunded";

export interface OwnerBooking {
  id: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  status: BookingStatus;
  customerName: string;
  customerPhone: string | null;
  paymentStatus: PaymentStatus;
  paymentNote: string | null;
  bookingCode: string;
  recurringScheduleId: string | null;
}
```

- [ ] **Step 2: Write `week-day-nav.tsx`**

```tsx
// apps/web/src/app/owner/bookings/week-day-nav.tsx
"use client";

interface WeekDayNavProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

function parseDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diff);
  return monday;
}

const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function WeekDayNav({ selectedDate, onSelectDate }: WeekDayNavProps) {
  const selected = parseDate(selectedDate);
  const monday = startOfWeek(selected);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const today = formatDate(new Date());

  function shiftWeek(deltaDays: number) {
    const next = new Date(selected);
    next.setDate(selected.getDate() + deltaDays);
    onSelectDate(formatDate(next));
  }

  const first = days[0];
  const last = days[6];
  const title = `Tuần ${first.getDate()}/${first.getMonth() + 1} – ${last.getDate()}/${last.getMonth() + 1}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => shiftWeek(-7)}
          className="rounded-lg border px-2 py-1 text-sm"
          aria-label="Tuần trước"
        >
          ←
        </button>
        <span className="text-sm font-medium">{title}</span>
        <button
          type="button"
          onClick={() => shiftWeek(7)}
          className="rounded-lg border px-2 py-1 text-sm"
          aria-label="Tuần sau"
        >
          →
        </button>
        <button
          type="button"
          onClick={() => onSelectDate(today)}
          className="ml-2 rounded-lg border px-2 py-1 text-sm"
        >
          Hôm nay
        </button>
      </div>
      <div className="flex gap-2">
        {days.map((d, i) => {
          const value = formatDate(d);
          const isSelected = value === selectedDate;
          const isToday = value === today;
          return (
            <button
              key={value}
              type="button"
              onClick={() => onSelectDate(value)}
              className={`flex flex-col items-center rounded-lg border px-3 py-1.5 text-sm ${
                isSelected ? "bg-blue-600 text-white" : "bg-transparent"
              }`}
            >
              <span>{DAY_LABELS[i]}</span>
              <span className="flex items-center gap-1">
                {d.getDate()}
                {isToday && <span className="size-1.5 rounded-full bg-blue-500" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `page.tsx` with data fetching and the week nav (grid/dialogs added in later tasks)**

```tsx
// apps/web/src/app/owner/bookings/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useBranch, ALL_BRANCHES_ID } from "@/lib/branch-context";
import { WeekDayNav } from "./week-day-nav";
import type { Court } from "../types";
import type { OwnerBooking } from "./types";

interface VenueOption {
  id: string;
  name: string;
}

const POLL_INTERVAL_MS = 60_000;

function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, "0");
  const d = now.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function OwnerBookingsPage() {
  const { selectedVenueId } = useBranch();
  const [venues, setVenues] = useState<VenueOption[] | null>(null);
  const [venueId, setVenueId] = useState<string>("");
  const [courts, setCourts] = useState<Court[]>([]);
  const [bookings, setBookings] = useState<OwnerBooking[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayString());

  useEffect(() => {
    fetch("/api/venues/mine")
      .then((res) => res.json())
      .then((data) => setVenues(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    if (selectedVenueId !== ALL_BRANCHES_ID) {
      setVenueId(selectedVenueId);
      return;
    }
    if (venues && venues.length > 0) {
      setVenueId((current) => current || venues[0].id);
    }
  }, [selectedVenueId, venues]);

  const loadCourts = useCallback(() => {
    if (!venueId) return;
    fetch(`/api/venues/mine/${venueId}/courts`)
      .then((res) => res.json())
      .then((data) => setCourts(Array.isArray(data) ? data : []));
  }, [venueId]);

  const loadBookings = useCallback(() => {
    if (!venueId) return;
    fetch(`/api/venues/mine/${venueId}/bookings?date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => setBookings(Array.isArray(data) ? data : []));
  }, [venueId, selectedDate]);

  useEffect(() => {
    loadCourts();
  }, [loadCourts]);

  useEffect(() => {
    loadBookings();
    const interval = setInterval(loadBookings, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadBookings]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Đặt lịch</h1>
        {venues && venues.length > 1 && (
          <select
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            className="h-9 rounded-lg border px-2.5 text-sm"
          >
            {venues.map((venue) => (
              <option key={venue.id} value={venue.id}>
                {venue.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <WeekDayNav selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      <p className="text-sm text-muted-foreground">
        {courts.length} sân · {bookings.length} lịch đặt ngày {selectedDate}
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Build**

Run (from `apps/web`): `npm run build`
Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/owner/bookings/types.ts apps/web/src/app/owner/bookings/week-day-nav.tsx apps/web/src/app/owner/bookings/page.tsx
git commit -m "feat(web): add owner bookings page shell with date/venue fetching"
```

---

### Task 12: Remove the old list-based booking section

**Files:**
- Delete: `apps/web/src/app/owner/branches/[id]/bookings-section.tsx`
- Modify: `apps/web/src/app/owner/branches/[id]/page.tsx`
- Modify: `apps/web/src/app/owner/dashboard/page.tsx`

**Interfaces:**
- Consumes: `BookingStatus` from `apps/web/src/app/owner/bookings/types.ts` (Task 11).

- [ ] **Step 1: Delete the file and its usage in the branch detail page**

Delete `apps/web/src/app/owner/branches/[id]/bookings-section.tsx`.

In `apps/web/src/app/owner/branches/[id]/page.tsx`, remove the import:

```ts
import { BookingsSection } from "./bookings-section";
```

and remove the line:

```tsx
      {courts && <BookingsSection venueId={venue.id} courts={courts} />}
```

- [ ] **Step 2: Re-point the `BookingStatus` type import used by the dashboard**

In `apps/web/src/app/owner/dashboard/page.tsx`, replace:

```ts
import type { BookingStatus } from "@/app/owner/branches/[id]/bookings-section";
```

with:

```ts
import type { BookingStatus } from "@/app/owner/bookings/types";
```

- [ ] **Step 3: Build**

Run (from `apps/web`): `npm run build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src/app/owner/branches/[id] apps/web/src/app/owner/dashboard/page.tsx
git commit -m "refactor(web): remove list-based owner booking section"
```

---

### Task 13: Status bar + booking grid render component

**Files:**
- Create: `apps/web/src/app/owner/bookings/status-bar.tsx`
- Create: `apps/web/src/app/owner/bookings/booking-grid.tsx`
- Modify: `apps/web/src/app/owner/bookings/page.tsx`

**Interfaces:**
- Consumes: `buildHourAxis`, `computeCellState`, `computeMaxConsecutiveHours` (Task 10).
- Produces: `StatusBar` component, `BookingGrid` component (`onCellClick: (court: Court, hour: string, state: CellState, bookingIds: string[]) => void`) — consumed by this task's `page.tsx`, and `page.tsx`'s cell-click handler is consumed by Tasks 14-15.

- [ ] **Step 1: Write `status-bar.tsx`**

```tsx
// apps/web/src/app/owner/bookings/status-bar.tsx
"use client";

import { Button } from "@/components/ui/button";

interface StatusBarProps {
  bookedCount: number;
  emptyCount: number;
  playingCount: number;
  totalCount: number;
  onRefresh: () => void;
  onQuickBook: () => void;
}

export function StatusBar({
  bookedCount,
  emptyCount,
  playingCount,
  totalCount,
  onRefresh,
  onQuickBook,
}: StatusBarProps) {
  const fillRate =
    totalCount > 0 ? Math.round(((bookedCount + playingCount) / totalCount) * 100) : 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
      <div className="flex flex-wrap gap-6 text-sm">
        <div>
          <p className="text-muted-foreground">Đã đặt</p>
          <p className="text-lg font-semibold">{bookedCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Trống</p>
          <p className="text-lg font-semibold">{emptyCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Đang chơi</p>
          <p className="text-lg font-semibold">{playingCount}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Lấp đầy</p>
          <p className="text-lg font-semibold">{fillRate}%</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={onRefresh}>
          Làm mới
        </Button>
        <Button type="button" onClick={onQuickBook}>
          ⚡ Đặt nhanh
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `booking-grid.tsx`**

```tsx
// apps/web/src/app/owner/bookings/booking-grid.tsx
"use client";

import { buildHourAxis, computeCellState, type CellState } from "@/lib/booking-grid";
import type { Court } from "../types";
import type { OwnerBooking } from "./types";

interface BookingGridProps {
  courts: Court[];
  bookings: OwnerBooking[];
  now: Date | null;
  onCellClick: (court: Court, hour: string, state: CellState, bookingIds: string[]) => void;
}

const STATE_CLASS: Record<CellState, string> = {
  empty: "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-950 dark:text-green-300",
  booked: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  playing: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  recurring: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  unavailable: "bg-muted text-muted-foreground cursor-not-allowed",
};

export function BookingGrid({ courts, bookings, now, onCellClick }: BookingGridProps) {
  const hours = buildHourAxis(
    courts.map((c) => ({ id: c.id, status: c.status, openTime: c.openTime, closeTime: c.closeTime })),
  );
  const gridBookings = bookings.map((b) => ({
    id: b.id,
    courtId: b.courtId,
    startTime: b.startTime,
    endTime: b.endTime,
    status: b.status,
    recurringScheduleId: b.recurringScheduleId,
  }));

  if (hours.length === 0) {
    return <p className="text-sm text-muted-foreground">Chi nhánh chưa có sân đang hoạt động.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-16 border-b p-2 text-left" />
            {courts.map((court) => (
              <th key={court.id} className="border-b p-2 text-left font-medium">
                {court.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map((hour) => (
            <tr key={hour}>
              <td className="border-b p-2 text-muted-foreground">{hour}</td>
              {courts.map((court) => {
                const gridCourt = {
                  id: court.id,
                  status: court.status,
                  openTime: court.openTime,
                  closeTime: court.closeTime,
                };
                const { state, bookingIds } = computeCellState(gridCourt, hour, gridBookings, now);
                const badge = bookingIds.length > 1 ? ` ${bookingIds.length}` : "";
                return (
                  <td key={court.id} className="border-b p-1">
                    <button
                      type="button"
                      disabled={state === "unavailable"}
                      onClick={() => onCellClick(court, hour, state, bookingIds)}
                      className={`flex h-10 w-full items-center justify-center rounded-md text-xs font-medium ${STATE_CLASS[state]}`}
                    >
                      {state === "empty" ? "+" : state === "unavailable" ? "" : `🔒${badge}`}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Wire the grid and stat counting into `page.tsx`**

In `apps/web/src/app/owner/bookings/page.tsx`, replace the imports block with:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useBranch, ALL_BRANCHES_ID } from "@/lib/branch-context";
import { buildHourAxis, computeCellState } from "@/lib/booking-grid";
import { WeekDayNav } from "./week-day-nav";
import { StatusBar } from "./status-bar";
import { BookingGrid } from "./booking-grid";
import type { Court } from "../types";
import type { OwnerBooking } from "./types";
```

Replace the closing `<p>...</p>` placeholder (from Task 11 Step 3) and everything after `<WeekDayNav .../>` with:

```tsx
      <WeekDayNav selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      <StatusBar
        bookedCount={counts.booked}
        emptyCount={counts.empty}
        playingCount={counts.playing}
        totalCount={counts.total}
        onRefresh={loadBookings}
        onQuickBook={() => {}}
      />

      <BookingGrid courts={courts} bookings={bookings} now={now} onCellClick={() => {}} />
```

(The `onQuickBook`/`onCellClick` no-ops are replaced in Tasks 14-15.)

Add this before the `return` statement, right after the existing `useEffect` hooks:

```tsx
  const now = selectedDate === todayString() ? new Date() : null;

  const counts = useMemo(() => {
    const activeCourts = courts.filter((c) => c.status === "active");
    const hours = buildHourAxis(
      activeCourts.map((c) => ({ id: c.id, status: c.status, openTime: c.openTime, closeTime: c.closeTime })),
    );
    const gridBookings = bookings.map((b) => ({
      id: b.id,
      courtId: b.courtId,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
      recurringScheduleId: b.recurringScheduleId,
    }));
    let empty = 0;
    let booked = 0;
    let playing = 0;
    for (const court of activeCourts) {
      for (const hour of hours) {
        const { state } = computeCellState(
          { id: court.id, status: court.status, openTime: court.openTime, closeTime: court.closeTime },
          hour,
          gridBookings,
          now,
        );
        if (state === "empty") empty += 1;
        else if (state === "playing") playing += 1;
        else if (state === "booked" || state === "recurring") booked += 1;
      }
    }
    return { empty, booked, playing, total: empty + booked + playing };
  }, [courts, bookings, now]);
```

- [ ] **Step 4: Build**

Run (from `apps/web`): `npm run build`
Expected: success.

- [ ] **Step 5: Manual check**

Run the dev server (`npm run dev` from `apps/web`, or use the project's `run` skill), log in as an owner with at least one venue and one active court, open `/owner/bookings`. Expected: the grid renders with green empty cells across the court's open/close hours, and the status bar shows correct counts (all "Trống" if no bookings exist yet for today).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/owner/bookings/status-bar.tsx apps/web/src/app/owner/bookings/booking-grid.tsx apps/web/src/app/owner/bookings/page.tsx
git commit -m "feat(web): render the owner booking grid and status bar"
```

---

### Task 14: Quick-book dialog (create booking, including walk-in customers)

**Files:**
- Create: `apps/web/src/app/owner/bookings/quick-book-dialog.tsx`
- Modify: `apps/web/src/app/owner/bookings/page.tsx`

**Interfaces:**
- Consumes: `computeMaxConsecutiveHours`, `buildHourAxis` (Task 10); `POST /api/venues/mine/[venueId]/bookings` (Task 9).
- Produces: `QuickBookDialog` component, wired into `page.tsx`'s empty-cell click and "⚡ Đặt nhanh" button.

- [ ] **Step 1: Write `quick-book-dialog.tsx`**

```tsx
// apps/web/src/app/owner/bookings/quick-book-dialog.tsx
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { buildHourAxis } from "@/lib/booking-grid";
import type { Court } from "../types";
import type { OwnerBooking } from "./types";

interface QuickBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  date: string;
  courts: Court[];
  initialCourtId?: string;
  initialHour?: string;
  maxDurationHours?: number;
  onCreated: (booking: OwnerBooking) => void;
}

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

function addHours(hour: string, hours: number): string {
  const [h, m] = hour.split(":").map(Number);
  const total = h * 60 + m + hours * 60;
  const hh = Math.floor(total / 60).toString().padStart(2, "0");
  const mm = (total % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

export function QuickBookDialog({
  open,
  onOpenChange,
  venueId,
  date,
  courts,
  initialCourtId,
  initialHour,
  maxDurationHours,
  onCreated,
}: QuickBookDialogProps) {
  const isPrefilled = Boolean(initialCourtId && initialHour);
  const activeCourts = courts.filter((c) => c.status === "active");
  const [courtId, setCourtId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(1);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCourtId(initialCourtId ?? activeCourts[0]?.id ?? "");
    setStartTime(initialHour ?? "");
    setDuration(Math.min(2, maxDurationHours ?? 8));
    setFullName("");
    setPhone("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialCourtId, initialHour, maxDurationHours]);

  const selectedCourt = activeCourts.find((c) => c.id === courtId);
  const startTimeOptions = selectedCourt
    ? buildHourAxis([
        {
          id: selectedCourt.id,
          status: selectedCourt.status,
          openTime: selectedCourt.openTime,
          closeTime: selectedCourt.closeTime,
        },
      ])
    : [];
  const endTime = startTime ? addHours(startTime, duration) : "";
  const estimatedTotal = selectedCourt ? selectedCourt.pricePerHour * duration : 0;
  const durationOptions = Array.from({ length: maxDurationHours ?? 8 }, (_, i) => i + 1);

  async function handleSubmit() {
    if (!courtId || !startTime || !fullName.trim() || !phone.trim()) {
      toast.error("Vui lòng nhập đủ thông tin bắt buộc");
      return;
    }
    setSubmitting(true);
    const response = await fetch(`/api/venues/mine/${venueId}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courtId,
        date,
        startTime,
        endTime,
        newCustomer: { fullName: fullName.trim(), phone: phone.trim() },
      }),
    });
    const data = await response.json().catch(() => null);
    setSubmitting(false);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã tạo lịch đặt sân");
    onCreated(data as OwnerBooking);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle className="text-lg font-semibold">Đặt sân nhanh</DialogTitle>
          <DialogClose
            className="text-muted-foreground outline-none hover:text-foreground"
            aria-label="Đóng"
          >
            ✕
          </DialogClose>
        </div>

        <div className="flex flex-col gap-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label htmlFor="qb-court">Sân *</Label>
            <select
              id="qb-court"
              value={courtId}
              onChange={(e) => setCourtId(e.target.value)}
              disabled={isPrefilled}
              className={SELECT_CLASS}
            >
              {activeCourts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="qb-start">Giờ bắt đầu *</Label>
              {isPrefilled ? (
                <Input id="qb-start" value={startTime} disabled />
              ) : (
                <select
                  id="qb-start"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="" disabled>
                    -- Chọn giờ --
                  </option>
                  {startTimeOptions.map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qb-duration">Thời lượng (giờ)</Label>
              <select
                id="qb-duration"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className={SELECT_CLASS}
              >
                {durationOptions.map((hours) => (
                  <option key={hours} value={hours}>
                    {hours} giờ
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="qb-name">Tên khách hàng *</Label>
            <Input id="qb-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qb-phone">Số điện thoại *</Label>
            <Input id="qb-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>

          {startTime && (
            <p className="text-sm text-muted-foreground">
              {startTime}–{endTime} · {estimatedTotal.toLocaleString("vi-VN")}đ
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="rounded-lg border px-4 py-2 text-sm font-medium">Hủy</DialogClose>
          <Button type="button" onClick={handleSubmit} disabled={submitting}>
            Xác nhận đặt sân
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire it into `page.tsx`**

Add the import:

```ts
import { computeMaxConsecutiveHours } from "@/lib/booking-grid";
import { QuickBookDialog } from "./quick-book-dialog";
```

Add state (near the other `useState` calls):

```ts
  const [quickBook, setQuickBook] = useState<{ courtId?: string; hour?: string; max?: number } | null>(
    null,
  );
```

Replace `onQuickBook={() => {}}` with `onQuickBook={() => setQuickBook({})}`.

Replace `onCellClick={() => {}}` with `onCellClick={handleCellClick}`, and add this handler function above the `return` statement:

Add this handler function above the `return` statement:

```tsx
  function handleCellClick(
    court: Court,
    hour: string,
    state: "empty" | "booked" | "playing" | "recurring" | "unavailable",
    bookingIds: string[],
  ) {
    if (state === "empty") {
      const gridBookings = bookings.map((b) => ({
        id: b.id,
        courtId: b.courtId,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        recurringScheduleId: b.recurringScheduleId,
      }));
      const max = computeMaxConsecutiveHours(
        { id: court.id, status: court.status, openTime: court.openTime, closeTime: court.closeTime },
        hour,
        gridBookings,
      );
      setQuickBook({ courtId: court.id, hour, max });
    }
  }
```

Add the dialog JSX right after `<BookingGrid .../>`:

```tsx
      <QuickBookDialog
        open={quickBook !== null}
        onOpenChange={(open) => !open && setQuickBook(null)}
        venueId={venueId}
        date={selectedDate}
        courts={courts}
        initialCourtId={quickBook?.courtId}
        initialHour={quickBook?.hour}
        maxDurationHours={quickBook?.max}
        onCreated={() => {
          setQuickBook(null);
          loadBookings();
        }}
      />
```

- [ ] **Step 3: Build**

Run (from `apps/web`): `npm run build`
Expected: success.

- [ ] **Step 4: Manual check**

With the dev server running, click an empty green cell on `/owner/bookings`: the dialog opens with the court/hour prefilled and disabled, the duration dropdown capped to the free run of hours, and the realtime total updates as duration changes. Fill in name/phone and submit: the cell turns red immediately (grid refetches). Click "⚡ Đặt nhanh": the dialog opens with an editable court dropdown and a start-time dropdown that populates once a court is chosen.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/owner/bookings/quick-book-dialog.tsx apps/web/src/app/owner/bookings/page.tsx
git commit -m "feat(web): add quick-book dialog for owner-created bookings"
```

---

### Task 15: Booking detail dialog (view, cancel, payment actions)

**Files:**
- Create: `apps/web/src/app/owner/bookings/booking-detail-dialog.tsx`
- Modify: `apps/web/src/app/owner/bookings/page.tsx`

**Interfaces:**
- Consumes: existing `POST /api/venues/mine/[venueId]/bookings/[id]/cancel`, `POST /api/venues/mine/[venueId]/bookings/[id]/payment/mark-paid`, `POST /api/venues/mine/[venueId]/bookings/[id]/payment/mark-refunded` route handlers (all pre-existing, unchanged).
- Produces: `BookingDetailDialog` component, wired into `page.tsx`'s non-empty cell click.

- [ ] **Step 1: Write `booking-detail-dialog.tsx`**

```tsx
// apps/web/src/app/owner/bookings/booking-detail-dialog.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { Court } from "../types";
import type { OwnerBooking } from "./types";

interface BookingDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  venueId: string;
  booking: OwnerBooking | null;
  court: Court | null;
  onUpdated: (booking: OwnerBooking) => void;
}

const STATUS_LABEL: Record<OwnerBooking["status"], string> = {
  confirmed: "Đã xác nhận",
  cancelled: "Đã huỷ",
  completed: "Hoàn thành",
};

const PAYMENT_STATUS_LABEL: Record<OwnerBooking["paymentStatus"], string> = {
  unpaid: "Chưa thanh toán",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
};

export function BookingDetailDialog({
  open,
  onOpenChange,
  venueId,
  booking,
  court,
  onUpdated,
}: BookingDetailDialogProps) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [paymentNote, setPaymentNote] = useState("");
  const [showPaymentNote, setShowPaymentNote] = useState<"pay" | "refund" | null>(null);

  if (!booking) return null;

  async function handleCancel() {
    const response = await fetch(`/api/venues/mine/${venueId}/bookings/${booking!.id}/cancel`, {
      method: "POST",
    });
    const data = await response.json().catch(() => null);
    setConfirmingCancel(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success("Đã huỷ lịch đặt");
    onUpdated({ ...booking!, status: "cancelled" });
    onOpenChange(false);
  }

  async function handlePayment(type: "pay" | "refund") {
    const path = type === "pay" ? "mark-paid" : "mark-refunded";
    const response = await fetch(
      `/api/venues/mine/${venueId}/bookings/${booking!.id}/payment/${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: paymentNote.trim() || undefined }),
      },
    );
    const data = await response.json().catch(() => null);
    setShowPaymentNote(null);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success(type === "pay" ? "Đã đánh dấu đã nhận tiền" : "Đã đánh dấu đã hoàn tiền");
    onUpdated({
      ...booking!,
      paymentStatus: type === "pay" ? "paid" : "refunded",
      paymentNote: paymentNote.trim() || booking!.paymentNote,
    });
    setPaymentNote("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle className="text-lg font-semibold">Chi tiết lịch đặt</DialogTitle>
          <DialogClose
            className="text-muted-foreground outline-none hover:text-foreground"
            aria-label="Đóng"
          >
            ✕
          </DialogClose>
        </div>

        <div className="flex flex-col gap-2 px-6 py-5 text-sm">
          <p className="font-medium">
            {court?.name ?? booking.courtId} · {booking.date}
          </p>
          <p>
            {booking.customerName} · {booking.customerPhone ?? "Chưa có"}
          </p>
          <p>
            {booking.startTime}–{booking.endTime} · {booking.totalPrice.toLocaleString("vi-VN")}đ
          </p>
          <p>Trạng thái: {STATUS_LABEL[booking.status]}</p>
          <p>Mã booking: {booking.bookingCode}</p>
          <p>
            {PAYMENT_STATUS_LABEL[booking.paymentStatus]}
            {booking.paymentNote ? ` · ${booking.paymentNote}` : ""}
          </p>

          {showPaymentNote && (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Ghi chú (tuỳ chọn)"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                className="h-8"
              />
              <Button size="sm" onClick={() => handlePayment(showPaymentNote)}>
                Xác nhận
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowPaymentNote(null)}>
                Thôi
              </Button>
            </div>
          )}
          {!showPaymentNote && booking.paymentStatus === "unpaid" && (
            <Button size="sm" variant="outline" onClick={() => setShowPaymentNote("pay")}>
              Đã nhận tiền
            </Button>
          )}
          {!showPaymentNote && booking.paymentStatus === "paid" && (
            <Button size="sm" variant="outline" onClick={() => setShowPaymentNote("refund")}>
              Đánh dấu đã hoàn tiền
            </Button>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="rounded-lg border px-4 py-2 text-sm font-medium">Đóng</DialogClose>
          {booking.status === "confirmed" &&
            (confirmingCancel ? (
              <>
                <Button variant="outline" onClick={() => setConfirmingCancel(false)}>
                  Thôi
                </Button>
                <Button variant="destructive" onClick={handleCancel}>
                  Xác nhận huỷ?
                </Button>
              </>
            ) : (
              <Button variant="destructive" onClick={() => setConfirmingCancel(true)}>
                Huỷ lịch
              </Button>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Wire it into `page.tsx`**

Add the import:

```ts
import { BookingDetailDialog } from "./booking-detail-dialog";
```

Add state:

```ts
  const [detail, setDetail] = useState<OwnerBooking | null>(null);
```

In `handleCellClick` (added in Task 14), add an `else` branch so non-empty, non-unavailable cells open the detail dialog — replace the function body with:

```tsx
  function handleCellClick(
    court: Court,
    hour: string,
    state: "empty" | "booked" | "playing" | "recurring" | "unavailable",
    bookingIds: string[],
  ) {
    if (state === "empty") {
      const gridBookings = bookings.map((b) => ({
        id: b.id,
        courtId: b.courtId,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        recurringScheduleId: b.recurringScheduleId,
      }));
      const max = computeMaxConsecutiveHours(
        { id: court.id, status: court.status, openTime: court.openTime, closeTime: court.closeTime },
        hour,
        gridBookings,
      );
      setQuickBook({ courtId: court.id, hour, max });
      return;
    }
    if (state === "unavailable") return;
    const found = bookings.find((b) => bookingIds.includes(b.id));
    if (found) setDetail(found);
  }
```

Add the dialog JSX right after `<QuickBookDialog .../>`:

```tsx
      <BookingDetailDialog
        open={detail !== null}
        onOpenChange={(open) => !open && setDetail(null)}
        venueId={venueId}
        booking={detail}
        court={courts.find((c) => c.id === detail?.courtId) ?? null}
        onUpdated={(updated) => {
          setDetail(updated);
          setBookings((current) => current.map((b) => (b.id === updated.id ? updated : b)));
        }}
      />
```

- [ ] **Step 3: Build**

Run (from `apps/web`): `npm run build`
Expected: success.

- [ ] **Step 4: Manual end-to-end check**

With the dev server running: click a red "booked" cell → detail dialog shows court/date/customer/phone/status/mã booking/payment status. Click "Đã nhận tiền" → status updates to "Đã thanh toán" in the dialog without closing it. Click "Huỷ lịch" → "Xác nhận huỷ?" → confirm → dialog closes, the grid cell turns green. Verify a booking created via `newCustomer` with the same phone twice reuses the same customer (check via two quick-books with the same phone, then confirm both bookings show the identical `customerName` after any edit — this exercises Task 2's find-or-create end to end through the UI).

- [ ] **Step 5: Full regression pass**

Run (from `apps/api`): `npx jest`
Run (from `apps/web`): `npx vitest run` and `npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/owner/bookings/booking-detail-dialog.tsx apps/web/src/app/owner/bookings/page.tsx
git commit -m "feat(web): add booking detail dialog with cancel and payment actions"
```
