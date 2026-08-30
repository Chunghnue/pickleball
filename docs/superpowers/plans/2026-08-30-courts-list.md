# Trang "Danh sách sân" (owner) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the owner's `/owner` venue-list page with a "Danh sách sân" (courts list) page scoped to the currently selected branch, backed by a richer court data model (status enum, description, capacity, display order, real image upload), and move venue management to `/owner/branches`.

**Architecture:** NestJS API changes (migration, entities, DTOs, service, controller, local-disk file upload) land first and are independently testable via Jest. The Next.js frontend then gets a shared `BranchProvider` (localStorage-backed selected-venue context), moved venue-management routes, new route handlers proxying the new/changed API endpoints, and new page components for the courts list (metrics, search, table/grid views, add/edit dialog with image upload, delete).

**Tech Stack:** NestJS 11 + TypeORM (Postgres) on the API; Next.js App Router + react-hook-form + zod + Base UI (`@base-ui/react`) components on the web app; Jest (api) / Vitest (web) for tests.

## Global Constraints

- Backend validation limits must match `docs/superpowers/specs/2026-08-30-courts-list-design.md` §2/§6 exactly (e.g. `slotDurationMinutes` 15–240, `pricePerHour > 0.01`, image types JPG/PNG/WEBP ≤ 5MB).
- No hard delete of a court that has any booking history (409), matching the venue-delete precedent in `2026-08-26-branches-design.md`.
- Follow existing codebase conventions: no new UI-kit components beyond what's already in `apps/web/src/components/ui/` (native `<select>`/`<textarea>` for fields without a kit component, same as the existing `isActive` checkbox pattern); no `*.test.tsx` page/component tests (matches current repo convention — only `lib/*.test.ts` and `*.service.spec.ts` get tests).
- Vietnamese user-facing strings throughout, matching existing copy style.

---

## Task 1: Migration — court status/description/capacity/display_order + `court_images`

**Files:**
- Create: `apps/api/src/migrations/1787860000000-AddCourtDetailsAndImages.ts`

**Interfaces:**
- Produces: DB columns `courts.status` (enum `active`|`maintenance`|`closed`, replaces `courts.is_active`), `courts.description` (nullable varchar), `courts.capacity` (nullable int), `courts.display_order` (int, default 0); new table `court_images(id, court_id, url, created_at)` — no FK constraint, matching the existing `venue_images.venue_id` convention (plain reference column, cleanup handled in application code).

- [ ] **Step 1: Write the migration**

```typescript
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCourtDetailsAndImages1787860000000 implements MigrationInterface {
    name = 'AddCourtDetailsAndImages1787860000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."courts_status_enum" AS ENUM('active', 'maintenance', 'closed')`);
        await queryRunner.query(`ALTER TABLE "courts" ADD "status" "public"."courts_status_enum" NOT NULL DEFAULT 'active'`);
        await queryRunner.query(`UPDATE "courts" SET "status" = 'closed' WHERE "is_active" = false`);
        await queryRunner.query(`ALTER TABLE "courts" DROP COLUMN "is_active"`);
        await queryRunner.query(`ALTER TABLE "courts" ADD "description" character varying`);
        await queryRunner.query(`ALTER TABLE "courts" ADD "capacity" integer`);
        await queryRunner.query(`ALTER TABLE "courts" ADD "display_order" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`CREATE TABLE "court_images" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "court_id" character varying NOT NULL, "url" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_court_images_id" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "court_images"`);
        await queryRunner.query(`ALTER TABLE "courts" DROP COLUMN "display_order"`);
        await queryRunner.query(`ALTER TABLE "courts" DROP COLUMN "capacity"`);
        await queryRunner.query(`ALTER TABLE "courts" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "courts" ADD "is_active" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`UPDATE "courts" SET "is_active" = false WHERE "status" IN ('closed', 'maintenance')`);
        await queryRunner.query(`ALTER TABLE "courts" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."courts_status_enum"`);
    }
}
```

- [ ] **Step 2: Run the migration against the dev database**

Run: `cd apps/api && npm run migration:run`
Expected: output lists `AddCourtDetailsAndImages1787860000000` as applied, no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/migrations/1787860000000-AddCourtDetailsAndImages.ts
git commit -m "feat(api): add court status/description/capacity/display_order and court_images table"
```

---

## Task 2: Entities — `Court` (status enum + new fields) + `CourtImage`

**Files:**
- Modify: `apps/api/src/courts/entities/court.entity.ts`
- Create: `apps/api/src/courts/entities/court-image.entity.ts`

**Interfaces:**
- Produces: `CourtStatus` enum (`ACTIVE`/`MAINTENANCE`/`CLOSED`), `Court.status/description/capacity/displayOrder` fields (replacing `Court.isActive`), `CourtImage` entity with `id/courtId/url/createdAt`.
- Consumes: Task 1's DB columns.

- [ ] **Step 1: Rewrite the Court entity**

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum CourtStatus {
  ACTIVE = 'active',
  MAINTENANCE = 'maintenance',
  CLOSED = 'closed',
}

@Entity('courts')
export class Court {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'venue_id' })
  venueId: string;

  @Column()
  name: string;

  @Column({
    name: 'price_per_hour',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  pricePerHour: number;

  @Column({ name: 'open_time', type: 'time' })
  openTime: string;

  @Column({ name: 'close_time', type: 'time' })
  closeTime: string;

  @Column({ name: 'slot_duration_minutes', type: 'int' })
  slotDurationMinutes: number;

  @Column({
    type: 'enum',
    enum: CourtStatus,
    default: CourtStatus.ACTIVE,
  })
  status: CourtStatus;

  @Column({ nullable: true, type: 'varchar' })
  description: string | null;

  @Column({ nullable: true, type: 'int' })
  capacity: number | null;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Create the CourtImage entity**

```typescript
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('court_images')
export class CourtImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'court_id' })
  courtId: string;

  @Column()
  url: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

- [ ] **Step 3: Verify the project still typechecks (entity is used by service/DTOs updated in later tasks, so full build isn't expected to pass yet — just confirm the two entity files compile standalone)**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "court.entity|court-image.entity" || echo "no errors in entity files"`
Expected: `no errors in entity files` (errors elsewhere in courts.service.ts referencing the old `isActive` field are expected until Task 5 — ignore those for this step).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/courts/entities/court.entity.ts apps/api/src/courts/entities/court-image.entity.ts
git commit -m "feat(api): add CourtStatus enum and CourtImage entity"
```

---

## Task 3: DTOs — new fields + status

**Files:**
- Modify: `apps/api/src/courts/dto/create-court.dto.ts`
- Modify: `apps/api/src/courts/dto/update-court.dto.ts`

**Interfaces:**
- Consumes: `CourtStatus` from `../entities/court.entity` (Task 2).
- Produces: `CreateCourtDto.description?/capacity?/displayOrder?`, `UpdateCourtDto.description?/capacity?/displayOrder?/status?` (replacing `isActive?`).

- [ ] **Step 1: Update CreateCourtDto**

```typescript
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
import { TIME_PATTERN } from '../time.util';

export class CreateCourtDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsNumber()
  @Min(0.01)
  pricePerHour: number;

  @Matches(TIME_PATTERN, { message: 'openTime phải theo định dạng HH:mm' })
  openTime: string;

  @Matches(TIME_PATTERN, { message: 'closeTime phải theo định dạng HH:mm' })
  closeTime: string;

  @IsInt()
  @Min(15)
  @Max(240)
  slotDurationMinutes: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsInt()
  displayOrder?: number;
}
```

- [ ] **Step 2: Update UpdateCourtDto**

```typescript
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { TIME_PATTERN } from '../time.util';
import { CourtStatus } from '../entities/court.entity';

export class UpdateCourtDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  pricePerHour?: number;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'openTime phải theo định dạng HH:mm' })
  openTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'closeTime phải theo định dạng HH:mm' })
  closeTime?: string;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  slotDurationMinutes?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsInt()
  displayOrder?: number;

  @IsOptional()
  @IsEnum(CourtStatus)
  status?: CourtStatus;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/courts/dto/create-court.dto.ts apps/api/src/courts/dto/update-court.dto.ts
git commit -m "feat(api): add description/capacity/displayOrder/status to court DTOs"
```

---

## Task 4: CourtsModule wiring — register `CourtImage` + `Booking` repositories

**Files:**
- Modify: `apps/api/src/courts/courts.module.ts`

**Interfaces:**
- Consumes: `CourtImage` (Task 2), `Booking` entity from `apps/api/src/bookings/entities/booking.entity.ts` (already exists).
- Produces: `CourtsService` can inject `Repository<CourtImage>` and `Repository<Booking>` (needed by Tasks 5, 7, 8). Mirrors the existing cross-module pattern in `apps/api/src/dashboard/dashboard.module.ts` (import the entity directly via `TypeOrmModule.forFeature`, not the whole `BookingsModule` — `BookingsModule` already imports `CourtsModule`, so importing it back here would be circular).

- [ ] **Step 1: Update the module**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Venue } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';
import { Court } from './entities/court.entity';
import { CourtImage } from './entities/court-image.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { VenuesService } from './venues.service';
import { CourtsService } from './courts.service';
import { VenuesController } from './venues.controller';
import { CourtsController } from './courts.controller';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Venue, VenueImage, Court, CourtImage, Booking]),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [VenuesController, CourtsController],
  providers: [VenuesService, CourtsService],
  exports: [VenuesService, CourtsService],
})
export class CourtsModule {}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/courts/courts.module.ts
git commit -m "feat(api): register CourtImage and Booking repositories in CourtsModule"
```

---

## Task 5: CourtsService status logic + downstream `isActive` consumers

**Files:**
- Modify: `apps/api/src/courts/courts.service.ts`
- Modify: `apps/api/src/courts/courts.service.spec.ts`
- Modify: `apps/api/src/admin/admin-stats.service.ts:75`
- Modify: `apps/api/src/dashboard/dashboard.service.ts:170`
- Modify: `apps/api/src/bookings/bookings.service.ts:69-72`
- Modify: `apps/api/src/bookings/bookings.service.spec.ts`

**Interfaces:**
- Consumes: `CourtStatus` (Task 2), `CourtImage`/`Booking` repositories now available on the module (Task 4 — injected here but only used starting Task 7/8; this task only needs the `Court` repository).
- Produces: `CourtsService.create/update` write `description/capacity/displayOrder/status`; `findActiveByVenue`/`getSlotsForDate` filter by `status = CourtStatus.ACTIVE` instead of `isActive = true`. Downstream code that read `court.isActive` now reads `court.status === CourtStatus.ACTIVE` (or `!== CourtStatus.ACTIVE`).

- [ ] **Step 1: Update the failing tests first — `courts.service.spec.ts`**

Replace every `isActive: true`/`isActive: false` occurrence with the new `status` field, and add coverage for the new writable fields. Full updated file:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CourtsService } from './courts.service';
import { Court, CourtStatus } from './entities/court.entity';
import { CourtImage } from './entities/court-image.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { VenuesService } from './venues.service';

const mockCourtsRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  remove: jest.fn(),
});

const mockCourtImagesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  remove: jest.fn(),
  delete: jest.fn(),
});

const mockBookingsRepository = () => ({
  count: jest.fn(),
});

const mockVenuesService = () => ({
  getOwnedVenueOrThrow: jest.fn(),
  findPublicById: jest.fn(),
  findMineByOwner: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CourtsService,
      { provide: getRepositoryToken(Court), useFactory: mockCourtsRepository },
      {
        provide: getRepositoryToken(CourtImage),
        useFactory: mockCourtImagesRepository,
      },
      {
        provide: getRepositoryToken(Booking),
        useFactory: mockBookingsRepository,
      },
      { provide: VenuesService, useFactory: mockVenuesService },
    ],
  }).compile();

  return {
    service: module.get(CourtsService),
    courtsRepo: module.get(getRepositoryToken(Court)) as ReturnType<
      typeof mockCourtsRepository
    >,
    courtImagesRepo: module.get(getRepositoryToken(CourtImage)) as ReturnType<
      typeof mockCourtImagesRepository
    >,
    bookingsRepo: module.get(getRepositoryToken(Booking)) as ReturnType<
      typeof mockBookingsRepository
    >,
    venuesService: module.get(VenuesService) as ReturnType<
      typeof mockVenuesService
    >,
  };
}

describe('CourtsService.create', () => {
  it('creates a court on an owned venue with status active and default fields', async () => {
    const { service, courtsRepo, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsRepo.create.mockImplementation((data) => data);
    courtsRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'court-1', ...data }),
    );

    const result = await service.create('owner-1', 'venue-1', {
      name: 'Sân 1',
      pricePerHour: 100000,
      openTime: '08:00',
      closeTime: '20:00',
      slotDurationMinutes: 60,
    });

    expect(venuesService.getOwnedVenueOrThrow).toHaveBeenCalledWith(
      'owner-1',
      'venue-1',
    );
    expect(result.venueId).toBe('venue-1');
    expect(result.status).toBe(CourtStatus.ACTIVE);
    expect(result.displayOrder).toBe(0);
    expect(result.description).toBeNull();
    expect(result.capacity).toBeNull();
  });

  it('accepts optional description/capacity/displayOrder', async () => {
    const { service, courtsRepo, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsRepo.create.mockImplementation((data) => data);
    courtsRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'court-1', ...data }),
    );

    const result = await service.create('owner-1', 'venue-1', {
      name: 'Sân 1',
      pricePerHour: 100000,
      openTime: '08:00',
      closeTime: '20:00',
      slotDurationMinutes: 60,
      description: 'Sân ngoài trời',
      capacity: 8,
      displayOrder: 2,
    });

    expect(result.description).toBe('Sân ngoài trời');
    expect(result.capacity).toBe(8);
    expect(result.displayOrder).toBe(2);
  });

  it('rejects when openTime is not before closeTime', async () => {
    const { service, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });

    await expect(
      service.create('owner-1', 'venue-1', {
        name: 'Sân 1',
        pricePerHour: 100000,
        openTime: '20:00',
        closeTime: '08:00',
        slotDurationMinutes: 60,
      }),
    ).rejects.toThrow('openTime phải trước closeTime');
  });
});

describe('CourtsService.update', () => {
  it('merges partial updates and re-validates open/close order', async () => {
    const { service, courtsRepo, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsRepo.findOne.mockResolvedValue({
      id: 'court-1',
      venueId: 'venue-1',
      name: 'Sân 1',
      pricePerHour: 100000,
      openTime: '08:00',
      closeTime: '20:00',
      slotDurationMinutes: 60,
      status: CourtStatus.ACTIVE,
      description: null,
      capacity: null,
      displayOrder: 0,
    });
    courtsRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', 'court-1', {
      closeTime: '22:00',
    });

    expect(result.closeTime).toBe('22:00');
    expect(result.openTime).toBe('08:00');
  });

  it('updates status/description/capacity/displayOrder when provided', async () => {
    const { service, courtsRepo, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsRepo.findOne.mockResolvedValue({
      id: 'court-1',
      venueId: 'venue-1',
      name: 'Sân 1',
      pricePerHour: 100000,
      openTime: '08:00',
      closeTime: '20:00',
      slotDurationMinutes: 60,
      status: CourtStatus.ACTIVE,
      description: null,
      capacity: null,
      displayOrder: 0,
    });
    courtsRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', 'court-1', {
      status: CourtStatus.MAINTENANCE,
      description: 'Đang thay lưới',
      capacity: 6,
      displayOrder: 5,
    });

    expect(result.status).toBe(CourtStatus.MAINTENANCE);
    expect(result.description).toBe('Đang thay lưới');
    expect(result.capacity).toBe(6);
    expect(result.displayOrder).toBe(5);
  });

  it('throws NotFoundException when the court does not belong to the venue', async () => {
    const { service, courtsRepo, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.update('owner-1', 'venue-1', 'court-1', { name: 'X' }),
    ).rejects.toThrow('Court court-1 không tồn tại');
  });
});

describe('CourtsService.findActiveByVenue', () => {
  it('queries only courts with status active for the venue', async () => {
    const { service, courtsRepo } = await buildTestingModule();
    courtsRepo.find.mockResolvedValue([{ id: 'court-1' }]);

    const result = await service.findActiveByVenue('venue-1');

    expect(courtsRepo.find).toHaveBeenCalledWith({
      where: { venueId: 'venue-1', status: CourtStatus.ACTIVE },
    });
    expect(result).toEqual([{ id: 'court-1' }]);
  });
});

describe('CourtsService.findByIdOrThrow', () => {
  it('returns the court regardless of status', async () => {
    const { service, courtsRepo } = await buildTestingModule();
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', status: CourtStatus.CLOSED });

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

describe('CourtsService.getSlotsForDate', () => {
  const FIXED_TODAY = new Date('2026-08-24T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_TODAY);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns generated slots for an active court on an active venue', async () => {
    const { service, courtsRepo, venuesService } = await buildTestingModule();
    courtsRepo.findOne.mockResolvedValue({
      id: 'court-1',
      venueId: 'venue-1',
      openTime: '08:00',
      closeTime: '10:00',
      slotDurationMinutes: 60,
      pricePerHour: 100000,
      status: CourtStatus.ACTIVE,
    });
    venuesService.findPublicById.mockResolvedValue({ id: 'venue-1' });

    const result = await service.getSlotsForDate('court-1', '2026-08-25');

    expect(result).toEqual([
      { start: '08:00', end: '09:00', price: 100000 },
      { start: '09:00', end: '10:00', price: 100000 },
    ]);
  });

  it('rejects a malformed date', async () => {
    const { service } = await buildTestingModule();

    await expect(
      service.getSlotsForDate('court-1', '25-08-2026'),
    ).rejects.toThrow('date phải theo định dạng YYYY-MM-DD');
  });

  it('rejects a date in the past', async () => {
    const { service } = await buildTestingModule();

    await expect(
      service.getSlotsForDate('court-1', '2026-08-01'),
    ).rejects.toThrow('Không thể xem khung giờ của ngày trong quá khứ');
  });

  it('throws NotFoundException when the court is missing or not active', async () => {
    const { service, courtsRepo } = await buildTestingModule();
    courtsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.getSlotsForDate('court-1', '2026-08-25'),
    ).rejects.toThrow('Court court-1 không tồn tại');
  });

  it('propagates NotFoundException when the venue is not active', async () => {
    const { service, courtsRepo, venuesService } = await buildTestingModule();
    courtsRepo.findOne.mockResolvedValue({
      id: 'court-1',
      venueId: 'venue-1',
      openTime: '08:00',
      closeTime: '10:00',
      slotDurationMinutes: 60,
      pricePerHour: 100000,
      status: CourtStatus.ACTIVE,
    });
    venuesService.findPublicById.mockRejectedValue(
      new Error('Venue venue-1 không tồn tại'),
    );

    await expect(
      service.getSlotsForDate('court-1', '2026-08-25'),
    ).rejects.toThrow('Venue venue-1 không tồn tại');
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail against the old service**

Run: `cd apps/api && npx jest courts.service.spec.ts`
Expected: FAIL — `CourtStatus`/`CourtImage` import errors and assertions on `result.status`/`description`/`capacity`/`displayOrder` failing since the service doesn't produce them yet.

- [ ] **Step 3: Rewrite `courts.service.ts` (status-aware create/update/findActiveByVenue/getSlotsForDate; constructor now also accepts the `CourtImage` and `Booking` repositories so Tasks 7–8 don't need another constructor-signature change)**

```typescript
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { unlink } from 'fs/promises';
import { basename, join } from 'path';
import { Court, CourtStatus } from './entities/court.entity';
import { CourtImage } from './entities/court-image.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { VenuesService } from './venues.service';
import { CreateCourtDto } from './dto/create-court.dto';
import { UpdateCourtDto } from './dto/update-court.dto';
import { generateSlots, Slot } from './slot-generator';
import { timeToMinutes } from './time.util';
import { getUploadsDir } from './court-image-upload.config';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface CourtWithImages extends Court {
  images: CourtImage[];
}

export interface CourtWithVenueName extends CourtWithImages {
  venueName: string;
}

@Injectable()
export class CourtsService {
  constructor(
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    @InjectRepository(CourtImage)
    private readonly courtImagesRepository: Repository<CourtImage>,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    private readonly venuesService: VenuesService,
  ) {}

  async create(
    ownerId: string,
    venueId: string,
    dto: CreateCourtDto,
  ): Promise<Court> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    this.assertOpenBeforeClose(dto.openTime, dto.closeTime);
    const court = this.courtsRepository.create({
      venueId,
      name: dto.name,
      pricePerHour: dto.pricePerHour,
      openTime: dto.openTime,
      closeTime: dto.closeTime,
      slotDurationMinutes: dto.slotDurationMinutes,
      description: dto.description ?? null,
      capacity: dto.capacity ?? null,
      displayOrder: dto.displayOrder ?? 0,
      status: CourtStatus.ACTIVE,
    });
    return this.courtsRepository.save(court);
  }

  async findByVenueForOwner(
    ownerId: string,
    venueId: string,
  ): Promise<CourtWithImages[]> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const courts = await this.courtsRepository.find({ where: { venueId } });
    return this.attachImages(courts);
  }

  async findAllForOwner(ownerId: string): Promise<CourtWithVenueName[]> {
    const venues = await this.venuesService.findMineByOwner(ownerId);
    if (venues.length === 0) {
      return [];
    }
    const venueNameById = new Map(venues.map((venue) => [venue.id, venue.name]));
    const courts = await this.courtsRepository.find({
      where: { venueId: In(venues.map((venue) => venue.id)) },
    });
    const withImages = await this.attachImages(courts);
    return withImages.map((court) => ({
      ...court,
      venueName: venueNameById.get(court.venueId) ?? '',
    }));
  }

  private async attachImages(courts: Court[]): Promise<CourtWithImages[]> {
    if (courts.length === 0) {
      return [];
    }
    const images = await this.courtImagesRepository.find({
      where: { courtId: In(courts.map((court) => court.id)) },
    });
    const imagesByCourtId = new Map<string, CourtImage[]>();
    for (const image of images) {
      const list = imagesByCourtId.get(image.courtId) ?? [];
      list.push(image);
      imagesByCourtId.set(image.courtId, list);
    }
    return courts.map((court) => ({
      ...court,
      images: imagesByCourtId.get(court.id) ?? [],
    }));
  }

  async update(
    ownerId: string,
    venueId: string,
    courtId: string,
    dto: UpdateCourtDto,
  ): Promise<Court> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const court = await this.courtsRepository.findOne({
      where: { id: courtId, venueId },
    });
    if (!court) {
      throw new NotFoundException(`Court ${courtId} không tồn tại`);
    }
    const nextOpenTime = dto.openTime ?? court.openTime;
    const nextCloseTime = dto.closeTime ?? court.closeTime;
    this.assertOpenBeforeClose(nextOpenTime, nextCloseTime);

    if (dto.name !== undefined) court.name = dto.name;
    if (dto.pricePerHour !== undefined) court.pricePerHour = dto.pricePerHour;
    court.openTime = nextOpenTime;
    court.closeTime = nextCloseTime;
    if (dto.slotDurationMinutes !== undefined) {
      court.slotDurationMinutes = dto.slotDurationMinutes;
    }
    if (dto.description !== undefined) court.description = dto.description;
    if (dto.capacity !== undefined) court.capacity = dto.capacity;
    if (dto.displayOrder !== undefined) court.displayOrder = dto.displayOrder;
    if (dto.status !== undefined) court.status = dto.status;

    return this.courtsRepository.save(court);
  }

  async remove(ownerId: string, venueId: string, courtId: string): Promise<void> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const court = await this.courtsRepository.findOne({
      where: { id: courtId, venueId },
    });
    if (!court) {
      throw new NotFoundException(`Court ${courtId} không tồn tại`);
    }
    const bookingCount = await this.bookingsRepository.count({
      where: { courtId },
    });
    if (bookingCount > 0) {
      throw new ConflictException(
        'Sân đã có lịch sử đặt sân, hãy chuyển sang trạng thái Tạm đóng thay vì xóa',
      );
    }
    await this.courtImagesRepository.delete({ courtId });
    await this.courtsRepository.remove(court);
  }

  async addImage(
    ownerId: string,
    venueId: string,
    courtId: string,
    file: Express.Multer.File,
  ): Promise<CourtImage> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const court = await this.courtsRepository.findOne({
      where: { id: courtId, venueId },
    });
    if (!court) {
      throw new NotFoundException(`Court ${courtId} không tồn tại`);
    }
    const image = this.courtImagesRepository.create({
      courtId,
      url: `/uploads/courts/${courtId}/${file.filename}`,
    });
    return this.courtImagesRepository.save(image);
  }

  async removeImage(
    ownerId: string,
    venueId: string,
    courtId: string,
    imageId: string,
  ): Promise<void> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const image = await this.courtImagesRepository.findOne({
      where: { id: imageId, courtId },
    });
    if (!image) {
      throw new NotFoundException(`Ảnh ${imageId} không tồn tại`);
    }
    const filePath = join(getUploadsDir(), 'courts', courtId, basename(image.url));
    await unlink(filePath).catch(() => undefined);
    await this.courtImagesRepository.remove(image);
  }

  findActiveByVenue(venueId: string): Promise<Court[]> {
    return this.courtsRepository.find({
      where: { venueId, status: CourtStatus.ACTIVE },
    });
  }

  async findByIdOrThrow(id: string): Promise<Court> {
    const court = await this.courtsRepository.findOne({ where: { id } });
    if (!court) {
      throw new NotFoundException(`Court ${id} không tồn tại`);
    }
    return court;
  }

  async getSlotsForDate(courtId: string, date: string): Promise<Slot[]> {
    if (!DATE_PATTERN.test(date)) {
      throw new BadRequestException('date phải theo định dạng YYYY-MM-DD');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (date < today) {
      throw new BadRequestException(
        'Không thể xem khung giờ của ngày trong quá khứ',
      );
    }

    const court = await this.courtsRepository.findOne({
      where: { id: courtId, status: CourtStatus.ACTIVE },
    });
    if (!court) {
      throw new NotFoundException(`Court ${courtId} không tồn tại`);
    }
    await this.venuesService.findPublicById(court.venueId);

    return generateSlots({
      openTime: court.openTime,
      closeTime: court.closeTime,
      slotDurationMinutes: court.slotDurationMinutes,
      pricePerHour: court.pricePerHour,
    });
  }

  private assertOpenBeforeClose(openTime: string, closeTime: string): void {
    if (timeToMinutes(openTime) >= timeToMinutes(closeTime)) {
      throw new BadRequestException('openTime phải trước closeTime');
    }
  }
}
```

This references `./court-image-upload.config` which is created in Task 8 — until then `findAllForOwner`/`remove`/`addImage`/`removeImage` exist but aren't wired to any route yet (that's Tasks 6–8). To keep this task's build green in isolation, create a minimal placeholder now and let Task 8 flesh it out:

```typescript
// apps/api/src/courts/court-image-upload.config.ts
import { join } from 'path';

export function getUploadsDir(): string {
  return process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd apps/api && npx jest courts.service.spec.ts`
Expected: PASS (all suites green).

- [ ] **Step 5: Fix downstream consumers of the old `isActive` field**

`apps/api/src/admin/admin-stats.service.ts:75` — change:
```typescript
      this.courtsRepository.count({ where: { isActive: true } }),
```
to:
```typescript
      this.courtsRepository.count({ where: { status: CourtStatus.ACTIVE } }),
```
and add the import `import { CourtStatus } from '../courts/entities/court.entity';` near the top of the file.

`apps/api/src/dashboard/dashboard.service.ts:170` — change:
```typescript
        active: courts.filter((court) => court.isActive).length,
```
to:
```typescript
        active: courts.filter((court) => court.status === CourtStatus.ACTIVE).length,
```
and add the import `import { CourtStatus } from '../courts/entities/court.entity';` near the top of the file.

`apps/api/src/bookings/bookings.service.ts:69-72` — change:
```typescript
    const court = await this.courtsService.findByIdOrThrow(dto.courtId);
    if (!court.isActive) {
      throw new NotFoundException(`Court ${dto.courtId} không tồn tại`);
    }
```
to:
```typescript
    const court = await this.courtsService.findByIdOrThrow(dto.courtId);
    if (court.status !== CourtStatus.ACTIVE) {
      throw new NotFoundException(`Court ${dto.courtId} không tồn tại`);
    }
```
and add the import `import { CourtStatus } from '../courts/entities/court.entity';` near the top of the file.

- [ ] **Step 6: Update the specs for those three consumers**

In `apps/api/src/bookings/bookings.service.spec.ts`, change the `ACTIVE_COURT` fixture (around line 136-145) from:
```typescript
  const ACTIVE_COURT = {
    id: 'court-1',
    venueId: 'venue-1',
    name: 'Sân 1',
    isActive: true,
    openTime: '08:00',
    closeTime: '20:00',
    slotDurationMinutes: 60,
    pricePerHour: 100000,
  };
```
to:
```typescript
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
```
and add `import { CourtStatus } from '../courts/entities/court.entity';` to the top of the file. Then change the override around line 270-275 from:
```typescript
  it('throws NotFoundException when the court is inactive', async () => {
    const { service, courtsService, venuesService } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue({
      ...ACTIVE_COURT,
      isActive: false,
    });
```
to:
```typescript
  it('throws NotFoundException when the court is inactive', async () => {
    const { service, courtsService, venuesService } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue({
      ...ACTIVE_COURT,
      status: CourtStatus.CLOSED,
    });
```

`admin-stats.service.spec.ts` and `dashboard.service.ts`'s own spec (if any) don't assert on the `isActive`/`status` field directly (they mock repository `count`/`find` return values, not the filter shape) — check by running the full suite in Step 7; only fix if it fails.

- [ ] **Step 7: Run the full API test suite**

Run: `cd apps/api && npm test`
Expected: PASS — 0 failures. If `admin-stats.service.spec.ts` or a dashboard spec fails on the `isActive`/`status` field, apply the same rename there.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/courts/courts.service.ts apps/api/src/courts/courts.service.spec.ts apps/api/src/courts/court-image-upload.config.ts apps/api/src/admin/admin-stats.service.ts apps/api/src/dashboard/dashboard.service.ts apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.service.spec.ts
git commit -m "feat(api): make CourtsService and its consumers status-aware instead of isActive"
```

---

## Task 6: Cross-venue courts listing (`GET /venues/mine/courts`)

**Files:**
- Modify: `apps/api/src/courts/venues.controller.ts`
- Create: `apps/web/src/app/api/venues/mine/courts/route.ts`

**Interfaces:**
- Consumes: `CourtsService.findAllForOwner` (Task 5).
- Produces: `GET /venues/mine/courts` → `CourtWithVenueName[]`; web route handler `GET /api/venues/mine/courts` proxying it.

**Why this lives on `VenuesController`, not `CourtsController`:** `CourtsController`'s routes for `venues/mine/:venueId/courts` are registered *after* `VenuesController`'s in `courts.module.ts` (`controllers: [VenuesController, CourtsController]`), and Express matches routes in registration order. `VenuesController` already has `@Get('mine/:id')` (full path `venues/mine/:id`) — if the new 3-segment route were declared on `CourtsController` (or anywhere after that method), a request to `/venues/mine/courts` would incorrectly match `mine/:id` first (treating `"courts"` as the id). Declaring it as a method on `VenuesController`, positioned before `findMineById`, avoids the collision.

- [ ] **Step 1: Add the endpoint to `VenuesController`, before `findMineById`**

In `apps/api/src/courts/venues.controller.ts`, insert this method directly after `findMine()` and before `findMineById()`:

```typescript
  @Get('mine/courts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  findAllMineCourts(@CurrentUser() user: AuthenticatedUser) {
    return this.courtsService.findAllForOwner(user.userId);
  }
```

(`this.courtsService` is already injected in the constructor; no other changes needed to the constructor.)

- [ ] **Step 2: Write a controller-level regression test for the route ordering**

Add to `apps/api/src/courts/courts.service.spec.ts` (new `describe` block, since `findAllForOwner` is a `CourtsService` method):

```typescript
describe('CourtsService.findAllForOwner', () => {
  it('returns courts across all of the owner venues with venueName and images attached', async () => {
    const { service, courtsRepo, courtImagesRepo, venuesService } = await buildTestingModule();
    venuesService.findMineByOwner.mockResolvedValue([
      { id: 'venue-1', name: 'Chi nhánh A' },
      { id: 'venue-2', name: 'Chi nhánh B' },
    ]);
    courtsRepo.find.mockResolvedValue([
      { id: 'court-1', venueId: 'venue-1', name: 'Sân 1' },
      { id: 'court-2', venueId: 'venue-2', name: 'Sân 2' },
    ]);
    courtImagesRepo.find.mockResolvedValue([
      { id: 'image-1', courtId: 'court-1', url: '/uploads/courts/court-1/a.jpg' },
    ]);

    const result = await service.findAllForOwner('owner-1');

    expect(result).toEqual([
      {
        id: 'court-1',
        venueId: 'venue-1',
        name: 'Sân 1',
        venueName: 'Chi nhánh A',
        images: [{ id: 'image-1', courtId: 'court-1', url: '/uploads/courts/court-1/a.jpg' }],
      },
      { id: 'court-2', venueId: 'venue-2', name: 'Sân 2', venueName: 'Chi nhánh B', images: [] },
    ]);
  });

  it('returns an empty array when the owner has no venues, without querying courts', async () => {
    const { service, courtsRepo, venuesService } = await buildTestingModule();
    venuesService.findMineByOwner.mockResolvedValue([]);

    const result = await service.findAllForOwner('owner-1');

    expect(result).toEqual([]);
    expect(courtsRepo.find).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test**

Run: `cd apps/api && npx jest courts.service.spec.ts -t "findAllForOwner"`
Expected: PASS (the service method was already implemented in Task 5, so this should pass immediately — this step is confirming that implementation, not driving new code).

- [ ] **Step 4: Add the Next.js route handler**

```typescript
// apps/web/src/app/api/venues/mine/courts/route.ts
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET() {
  const upstream = await fetchApi('/venues/mine/courts');
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 5: Manually verify the route ordering fix**

Run: `cd apps/api && npm run start:dev` (in one terminal), then in another terminal, log in as an owner and call:
`curl -H "Authorization: Bearer <token>" http://localhost:3001/venues/mine/courts`
Expected: a JSON array (possibly empty), **not** a 404 "Venue courts không tồn tại" error (which would indicate the old `mine/:id` route intercepted it).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/courts/venues.controller.ts apps/api/src/courts/courts.service.spec.ts apps/web/src/app/api/venues/mine/courts/route.ts
git commit -m "feat: expose GET /venues/mine/courts for the cross-branch courts list"
```

---

## Task 7: Court deletion with booking guard

**Files:**
- Modify: `apps/api/src/courts/courts.controller.ts`
- Modify: `apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/route.ts`

**Interfaces:**
- Consumes: `CourtsService.remove` (Task 5, already implemented and returns `void`, throws `ConflictException` on existing bookings).
- Produces: `DELETE /venues/mine/:venueId/courts/:id` (204 on success, 409 with message on booking history); web `DELETE /api/venues/mine/[venueId]/courts/[id]`.

- [ ] **Step 1: Write the service-level tests for `remove`**

Add to `apps/api/src/courts/courts.service.spec.ts`:

```typescript
describe('CourtsService.remove', () => {
  it('deletes the court and its images when it has no booking history', async () => {
    const { service, courtsRepo, courtImagesRepo, bookingsRepo, venuesService } =
      await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    bookingsRepo.count.mockResolvedValue(0);

    await service.remove('owner-1', 'venue-1', 'court-1');

    expect(courtImagesRepo.delete).toHaveBeenCalledWith({ courtId: 'court-1' });
    expect(courtsRepo.remove).toHaveBeenCalledWith({ id: 'court-1', venueId: 'venue-1' });
  });

  it('throws ConflictException when the court has booking history', async () => {
    const { service, courtsRepo, bookingsRepo, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    bookingsRepo.count.mockResolvedValue(3);

    await expect(service.remove('owner-1', 'venue-1', 'court-1')).rejects.toThrow(
      'Sân đã có lịch sử đặt sân, hãy chuyển sang trạng thái Tạm đóng thay vì xóa',
    );
  });

  it('throws NotFoundException when the court does not belong to the venue', async () => {
    const { service, courtsRepo, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsRepo.findOne.mockResolvedValue(null);

    await expect(service.remove('owner-1', 'venue-1', 'court-1')).rejects.toThrow(
      'Court court-1 không tồn tại',
    );
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `cd apps/api && npx jest courts.service.spec.ts -t "CourtsService.remove"`
Expected: PASS (implementation already exists from Task 5).

- [ ] **Step 3: Add the controller endpoint**

In `apps/api/src/courts/courts.controller.ts`, add `Delete` to the `@nestjs/common` import list and add this method after `update`:

```typescript
  @Delete('venues/mine/:venueId/courts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.courtsService.remove(user.userId, venueId, id);
  }
```

- [ ] **Step 4: Add the DELETE handler to the existing web route file**

Modify `apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/route.ts` to add a `DELETE` export alongside the existing `PATCH`:

```typescript
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string }> },
) {
  const { venueId, id } = await params;
  const body = await request.json();
  const upstream = await fetchApi(`/venues/mine/${venueId}/courts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string }> },
) {
  const { venueId, id } = await params;
  const upstream = await fetchApi(`/venues/mine/${venueId}/courts/${id}`, {
    method: 'DELETE',
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 5: Run the full API test suite**

Run: `cd apps/api && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/courts/courts.controller.ts apps/api/src/courts/courts.service.spec.ts apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/route.ts
git commit -m "feat: add DELETE court endpoint with booking-history guard"
```

---

## Task 8: Court image upload (local disk)

**Files:**
- Modify: `apps/api/src/courts/court-image-upload.config.ts` (created as a placeholder in Task 5)
- Modify: `apps/api/src/main.ts`
- Modify: `apps/api/src/courts/courts.controller.ts`
- Modify: `apps/api/.gitignore` (create if it doesn't exist)
- Create: `apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/images/route.ts`
- Create: `apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/images/[imageId]/route.ts`

**Interfaces:**
- Consumes: `CourtsService.addImage`/`removeImage` (Task 5).
- Produces: `POST /venues/mine/:venueId/courts/:courtId/images` (multipart `file` field, JPG/PNG/WEBP ≤ 5MB) → `CourtImage`; `DELETE /venues/mine/:venueId/courts/:courtId/images/:imageId`; files served at `/uploads/courts/<courtId>/<filename>`.

- [ ] **Step 1: Flesh out the upload config**

Replace the Task 5 placeholder in `apps/api/src/courts/court-image-upload.config.ts`:

```typescript
import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import type { Request } from 'express';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export function getUploadsDir(): string {
  return process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
}

export const courtImageUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: (req: Request, _file, callback) => {
      const courtId = req.params.courtId;
      const dir = join(getUploadsDir(), 'courts', courtId);
      mkdirSync(dir, { recursive: true });
      callback(null, dir);
    },
    filename: (_req, file, callback) => {
      callback(null, `${randomUUID()}${extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      callback(new BadRequestException('Chỉ chấp nhận ảnh JPG/PNG/WEBP'), false);
      return;
    }
    callback(null, true);
  },
};
```

- [ ] **Step 2: Serve the uploads directory as static assets in `main.ts`**

```typescript
import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { getUploadsDir } from './courts/court-image-upload.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
  app.useStaticAssets(getUploadsDir(), { prefix: '/uploads' });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
```

- [ ] **Step 3: Add the controller endpoints**

In `apps/api/src/courts/courts.controller.ts`, add `UploadedFile`, `UseInterceptors`, `BadRequestException` to the `@nestjs/common` import, add `import { FileInterceptor } from '@nestjs/platform-express';` and `import { courtImageUploadOptions } from './court-image-upload.config';`, then add these two methods after `remove`:

```typescript
  @Post('venues/mine/:venueId/courts/:courtId/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @UseInterceptors(FileInterceptor('file', courtImageUploadOptions))
  addImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file ảnh');
    }
    return this.courtsService.addImage(user.userId, venueId, courtId, file);
  }

  @Delete('venues/mine/:venueId/courts/:courtId/images/:imageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  removeImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.courtsService.removeImage(user.userId, venueId, courtId, imageId);
  }
```

- [ ] **Step 4: Ignore the local uploads directory**

Check `apps/api/.gitignore`; add a line `uploads/` if it isn't already ignored (create the file with that single line if it doesn't exist).

- [ ] **Step 5: Add the web route handlers**

```typescript
// apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/images/route.ts
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string }> },
) {
  const { venueId, id } = await params;
  const formData = await request.formData();
  const upstream = await fetchApi(`/venues/mine/${venueId}/courts/${id}/images`, {
    method: 'POST',
    body: formData,
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

```typescript
// apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/images/[imageId]/route.ts
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string; imageId: string }> },
) {
  const { venueId, id, imageId } = await params;
  const upstream = await fetchApi(
    `/venues/mine/${venueId}/courts/${id}/images/${imageId}`,
    { method: 'DELETE' },
  );
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

Not setting a `Content-Type` header when forwarding `formData` is intentional — `fetch` sets the correct `multipart/form-data` boundary automatically; setting it manually would break the boundary.

- [ ] **Step 6: Run the full API test suite**

Run: `cd apps/api && npm test`
Expected: PASS.

- [ ] **Step 7: Manual smoke test of the upload endpoint**

Run: `cd apps/api && npm run start:dev`, then:
```bash
curl -X POST -H "Authorization: Bearer <token>" \
  -F "file=@/path/to/test-image.jpg" \
  http://localhost:3001/venues/mine/<venueId>/courts/<courtId>/images
```
Expected: `201` with JSON `{ id, courtId, url, createdAt }`; the file exists at `apps/api/uploads/courts/<courtId>/<uuid>.jpg`; `curl http://localhost:3001/uploads/courts/<courtId>/<uuid>.jpg` returns the image.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/courts/court-image-upload.config.ts apps/api/src/main.ts apps/api/src/courts/courts.controller.ts apps/api/.gitignore apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/images
git commit -m "feat: add local-disk court image upload/delete endpoints"
```

---

## Task 9: Frontend schemas — new court fields + status

**Files:**
- Modify: `apps/web/src/lib/schemas.ts`
- Modify: `apps/web/src/lib/schemas.test.ts`

**Interfaces:**
- Produces: `createCourtSchema`/`updateCourtSchema` gain `description?/capacity?/displayOrder?`; `updateCourtSchema.status?` (enum) replaces `isActive?`. `CreateCourtInput`/`UpdateCourtInput` types update accordingly (consumed by Tasks 16-19).

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/src/lib/schemas.test.ts`, inside the existing `describe('createCourtSchema', ...)` block (after the `slotDurationMinutes above 240` test) and `describe('updateCourtSchema', ...)` block:

```typescript
  it('accepts optional description/capacity/displayOrder', () => {
    const result = createCourtSchema.safeParse({
      ...valid,
      description: 'Sân ngoài trời',
      capacity: '8',
      displayOrder: '2',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.capacity).toBe(8);
      expect(result.data.displayOrder).toBe(2);
    }
  });

  it('rejects a capacity of 0', () => {
    expect(
      createCourtSchema.safeParse({ ...valid, capacity: 0 }).success,
    ).toBe(false);
  });
```

and replace the `it('accepts isActive alone', ...)` test in `describe('updateCourtSchema', ...)` with:

```typescript
  it('accepts status alone', () => {
    expect(
      updateCourtSchema.safeParse({ status: 'maintenance' }).success,
    ).toBe(true);
  });

  it('rejects a status outside the enum', () => {
    expect(
      updateCourtSchema.safeParse({ status: 'archived' }).success,
    ).toBe(false);
  });

  it('rejects a displayOrder that is not an integer', () => {
    expect(
      updateCourtSchema.safeParse({ displayOrder: 1.5 }).success,
    ).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `cd apps/web && npx vitest run schemas.test.ts`
Expected: FAIL — `capacity`/`displayOrder`/`status` are not recognized keys yet (zod strips unknown keys by default so the "accepts" cases fail on the missing values, and the `status` enum test fails because `isActive` boolean coercion of the string `'maintenance'` behaves differently).

- [ ] **Step 3: Update the schemas**

In `apps/web/src/lib/schemas.ts`, replace `createCourtSchema` and `updateCourtSchema`:

```typescript
export const createCourtSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên sân'),
  pricePerHour: z.coerce.number().min(0.01, 'Giá phải lớn hơn 0'),
  openTime: z
    .string()
    .regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)'),
  closeTime: z
    .string()
    .regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)'),
  slotDurationMinutes: z.coerce
    .number()
    .int('Phải là số nguyên')
    .min(15, 'Tối thiểu 15 phút')
    .max(240, 'Tối đa 240 phút'),
  description: z.string().optional(),
  capacity: z.coerce.number().int('Phải là số nguyên').min(1, 'Phải lớn hơn 0').optional(),
  displayOrder: z.coerce.number().int('Phải là số nguyên').optional(),
});
export type CreateCourtInput = z.infer<typeof createCourtSchema>;

export const courtStatusValues = ['active', 'maintenance', 'closed'] as const;

export const updateCourtSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên sân').optional(),
  pricePerHour: z.coerce.number().min(0.01, 'Giá phải lớn hơn 0').optional(),
  openTime: z
    .string()
    .regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)')
    .optional(),
  closeTime: z
    .string()
    .regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)')
    .optional(),
  slotDurationMinutes: z.coerce
    .number()
    .int('Phải là số nguyên')
    .min(15, 'Tối thiểu 15 phút')
    .max(240, 'Tối đa 240 phút')
    .optional(),
  description: z.string().optional(),
  capacity: z.coerce.number().int('Phải là số nguyên').min(1, 'Phải lớn hơn 0').optional(),
  displayOrder: z.coerce.number().int('Phải là số nguyên').optional(),
  status: z.enum(courtStatusValues).optional(),
});
export type UpdateCourtInput = z.infer<typeof updateCourtSchema>;
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `cd apps/web && npx vitest run schemas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/schemas.ts apps/web/src/lib/schemas.test.ts
git commit -m "feat(web): add description/capacity/displayOrder/status to court schemas"
```

---

## Task 10: Shared owner types (`Venue`, `VenueImage`, `Court`, `CourtImage`)

**Files:**
- Create: `apps/web/src/app/owner/types.ts`
- Delete: `apps/web/src/app/owner/venues/[id]/types.ts` (removed in Task 11, once nothing references it)

**Interfaces:**
- Produces: `CourtStatus`, `Court`, `CourtImage`, `CourtWithVenueName`, `VenueImage`, `Venue` types — consumed by Tasks 11, 15-19.

- [ ] **Step 1: Create the shared types file**

```typescript
// apps/web/src/app/owner/types.ts
export type CourtStatus = "active" | "maintenance" | "closed";

export interface CourtImage {
  id: string;
  url: string;
}

export interface Court {
  id: string;
  venueId: string;
  name: string;
  pricePerHour: number;
  openTime: string;
  closeTime: string;
  slotDurationMinutes: number;
  status: CourtStatus;
  description: string | null;
  capacity: number | null;
  displayOrder: number;
  images: CourtImage[];
}

export interface CourtWithVenueName extends Court {
  venueName: string;
}

export interface VenueImage {
  id: string;
  url: string;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  description: string | null;
  phone: string | null;
  status: "pending_approval" | "active" | "rejected";
  images: VenueImage[];
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/owner/types.ts
git commit -m "feat(web): add shared owner Court/Venue types"
```

(The old `apps/web/src/app/owner/venues/[id]/types.ts` is deleted in Task 11 as part of moving its sibling files, not here — deleting it now would break `courts-section.tsx`/`bookings-section.tsx`/`page.tsx` imports that Task 11 hasn't updated yet.)

---

## Task 11: Move venue-detail page bundle to `/owner/branches/[id]`, drop courts management

**Files:**
- Create: `apps/web/src/app/owner/branches/[id]/page.tsx` (moved from `apps/web/src/app/owner/venues/[id]/page.tsx`, minus `CourtsSection`)
- Create: `apps/web/src/app/owner/branches/[id]/venue-info-section.tsx` (moved, import path updated)
- Create: `apps/web/src/app/owner/branches/[id]/venue-images-section.tsx` (moved, import path updated)
- Create: `apps/web/src/app/owner/branches/[id]/bookings-section.tsx` (moved, import path updated)
- Delete: `apps/web/src/app/owner/venues/[id]/page.tsx`
- Delete: `apps/web/src/app/owner/venues/[id]/venue-info-section.tsx`
- Delete: `apps/web/src/app/owner/venues/[id]/venue-images-section.tsx`
- Delete: `apps/web/src/app/owner/venues/[id]/bookings-section.tsx`
- Delete: `apps/web/src/app/owner/venues/[id]/courts-section.tsx`
- Delete: `apps/web/src/app/owner/venues/[id]/types.ts`

**Interfaces:**
- Consumes: `apps/web/src/app/owner/types.ts` (Task 10).
- Produces: `/owner/branches/[id]` renders venue info + venue images + the bookings scheduler, no longer renders court CRUD (moved to the new `/owner` page in Tasks 15-19).

- [ ] **Step 1: Read the three untouched section files to copy verbatim**

`venue-info-section.tsx` and `bookings-section.tsx` don't otherwise change — only their `import type {...} from "./types"` line changes to `from "../../types"`. `venue-images-section.tsx` likewise only needs its import path updated.

- [ ] **Step 2: Create `apps/web/src/app/owner/branches/[id]/venue-info-section.tsx`**

Copy `apps/web/src/app/owner/venues/[id]/venue-info-section.tsx` verbatim, changing only its `import type { Venue } from "./types";` line to `import type { Venue } from "../../types";`.

- [ ] **Step 3: Create `apps/web/src/app/owner/branches/[id]/venue-images-section.tsx`**

Copy `apps/web/src/app/owner/venues/[id]/venue-images-section.tsx` verbatim, changing only its `import type { VenueImage } from "./types";` line to `import type { VenueImage } from "../../types";`.

- [ ] **Step 4: Create `apps/web/src/app/owner/branches/[id]/bookings-section.tsx`**

Copy `apps/web/src/app/owner/venues/[id]/bookings-section.tsx` verbatim, changing only its `import type { Court } from "./types";` line to `import type { Court } from "../../types";`.

- [ ] **Step 5: Create `apps/web/src/app/owner/branches/[id]/page.tsx` (drops `CourtsSection`, keeps fetching courts for `BookingsSection`)**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { VenueInfoSection } from "./venue-info-section";
import { VenueImagesSection } from "./venue-images-section";
import { BookingsSection } from "./bookings-section";
import type { Court, Venue } from "../../types";

export default function OwnerBranchDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [courts, setCourts] = useState<Court[] | null>(null);

  useEffect(() => {
    fetch(`/api/venues/mine/${params.id}`)
      .then(async (res) => {
        if (res.status === 401) {
          router.push(`/login?returnTo=%2Fowner%2Fbranches%2F${params.id}`);
          return null;
        }
        if (res.status === 404) {
          router.push("/owner/branches");
          return null;
        }
        return (await res.json()) as Venue;
      })
      .then((data) => {
        if (!data) return;
        setVenue(data);
      });
  }, [params.id, router]);

  useEffect(() => {
    if (!venue) return;
    fetch(`/api/venues/mine/${venue.id}/courts`)
      .then((res) => res.json())
      .then((data) => setCourts(Array.isArray(data) ? data : []));
  }, [venue]);

  if (!venue) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p>Đang tải...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">{venue.name}</h1>

      <VenueInfoSection venue={venue} onUpdated={setVenue} />
      <VenueImagesSection
        venueId={venue.id}
        images={venue.images}
        onImagesChanged={(images) => setVenue({ ...venue, images })}
      />
      {courts && <BookingsSection venueId={venue.id} courts={courts} />}
    </main>
  );
}
```

- [ ] **Step 6: Delete the old `venues/[id]` directory contents**

```bash
git rm apps/web/src/app/owner/venues/[id]/page.tsx apps/web/src/app/owner/venues/[id]/venue-info-section.tsx apps/web/src/app/owner/venues/[id]/venue-images-section.tsx apps/web/src/app/owner/venues/[id]/bookings-section.tsx apps/web/src/app/owner/venues/[id]/courts-section.tsx apps/web/src/app/owner/venues/[id]/types.ts
```

- [ ] **Step 7: Verify the web app typechecks (some references will still be broken until Task 12 moves `venues/new`; that's expected)**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -v "venues/new"`
Expected: no errors referencing `owner/branches/[id]/*` or the deleted `owner/venues/[id]/*` files.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/owner/branches
git commit -m "feat(web): move venue-detail page to /owner/branches/[id], drop embedded court CRUD"
```

---

## Task 12: Move venue list/create pages to `/owner/branches`

**Files:**
- Modify: `apps/web/src/app/owner/branches/page.tsx` (currently `ComingSoon`; replaced with the moved venue-list content)
- Create: `apps/web/src/app/owner/branches/new/page.tsx` (moved from `apps/web/src/app/owner/venues/new/page.tsx`)
- Delete: `apps/web/src/app/owner/venues/new/page.tsx`
- Delete: `apps/web/src/app/owner/page.tsx` (its content becomes the new courts-list page in Task 19 — deleting it here just removes the old venue-list content; Task 19 creates the replacement)

**Interfaces:**
- Produces: `/owner/branches` lists the owner's venues with a "Thêm sân mới" (venue) entry point; `/owner/branches/new` creates a venue and redirects to `/owner/branches/[id]`.

- [ ] **Step 1: Replace `apps/web/src/app/owner/branches/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Venue {
  id: string;
  name: string;
  city: string;
  status: "pending_approval" | "active" | "rejected";
}

const STATUS_LABEL: Record<Venue["status"], string> = {
  pending_approval: "Đang chờ duyệt",
  active: "Đang hoạt động",
  rejected: "Bị từ chối",
};

const STATUS_CLASS: Record<Venue["status"], string> = {
  pending_approval: "text-amber-600",
  active: "text-emerald-600",
  rejected: "text-destructive",
};

export default function OwnerBranchesPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[] | null>(null);

  useEffect(() => {
    fetch("/api/venues/mine")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner%2Fbranches");
          return null;
        }
        return (await res.json()) as Venue[];
      })
      .then((data) => {
        if (!data) return;
        setVenues(data);
      });
  }, [router]);

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Chi nhánh</h1>
        <Link href="/owner/branches/new" className={buttonVariants()}>
          Thêm chi nhánh mới
        </Link>
      </div>

      {venues === null && <p>Đang tải...</p>}
      {venues !== null && venues.length === 0 && (
        <p className="text-muted-foreground">
          Bạn chưa có địa điểm nào. Hãy thêm chi nhánh mới để bắt đầu.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {venues?.map((venue) => (
          <Link key={venue.id} href={`/owner/branches/${venue.id}`}>
            <Card className="transition-colors hover:bg-muted">
              <CardHeader>
                <CardTitle className="text-base">{venue.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {venue.city}
                </span>
                <span
                  className={`text-sm font-medium ${STATUS_CLASS[venue.status]}`}
                >
                  {STATUS_LABEL[venue.status]}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
```

(Renamed the button label from "Thêm sân mới" to "Thêm chi nhánh mới" — this page creates a *venue*, and "Thêm sân mới" now belongs to the court-creation dialog on `/owner`, so keeping both labels identical would be confusing.)

- [ ] **Step 2: Create `apps/web/src/app/owner/branches/new/page.tsx`**

Copy `apps/web/src/app/owner/venues/new/page.tsx` verbatim, with two changes: the redirect target and the page title. Full file:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createVenueSchema, type CreateVenueInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

export default function NewBranchPage() {
  const router = useRouter();
  const form = useForm<CreateVenueInput>({
    resolver: zodResolver(createVenueSchema),
    defaultValues: { name: "", address: "", city: "", description: "" },
  });

  async function onSubmit(values: CreateVenueInput) {
    const response = await fetch("/api/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã tạo địa điểm, đang chờ admin duyệt");
    router.push(`/owner/branches/${data.id}`);
  }

  const { errors } = form.formState;

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Thêm chi nhánh mới</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Tên địa điểm</Label>
              <Input
                id="name"
                aria-invalid={!!errors.name}
                {...form.register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Địa chỉ</Label>
              <Input
                id="address"
                aria-invalid={!!errors.address}
                {...form.register("address")}
              />
              {errors.address && (
                <p className="text-sm text-destructive">
                  {errors.address.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Thành phố</Label>
              <Input
                id="city"
                aria-invalid={!!errors.city}
                {...form.register("city")}
              />
              {errors.city && (
                <p className="text-sm text-destructive">{errors.city.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Mô tả (tuỳ chọn)</Label>
              <Input id="description" {...form.register("description")} />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              Tạo địa điểm
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 3: Delete the old venue list/create pages**

```bash
git rm apps/web/src/app/owner/venues/new/page.tsx apps/web/src/app/owner/page.tsx
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/owner/branches/page.tsx apps/web/src/app/owner/branches/new/page.tsx
git commit -m "feat(web): move venue list/create pages to /owner/branches"
```

(`/owner` has no `page.tsx` after this commit — that's expected and temporary; Task 19 adds the new courts-list page there. Don't skip ahead: Tasks 13-18 build the pieces it depends on first.)

---

## Task 13: `BranchProvider` context + wire into layout + `BranchSwitcher` update

**Files:**
- Create: `apps/web/src/lib/branch-context.tsx`
- Modify: `apps/web/src/app/owner/layout.tsx`
- Modify: `apps/web/src/components/branch-switcher.tsx`

**Interfaces:**
- Produces: `BranchProvider`, `useBranch(): { selectedVenueId: string; setSelectedVenueId(id: string): void }`, `ALL_BRANCHES_ID = "all"` — consumed by `BranchSwitcher` here and by the new `/owner` page in Task 19.

- [ ] **Step 1: Create the context**

```tsx
// apps/web/src/lib/branch-context.tsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "selected-branch-id";
export const ALL_BRANCHES_ID = "all";

interface BranchContextValue {
  selectedVenueId: string;
  setSelectedVenueId: (venueId: string) => void;
}

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const [selectedVenueId, setSelectedVenueIdState] = useState(ALL_BRANCHES_ID);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setSelectedVenueIdState(stored);
    }
  }, []);

  function setSelectedVenueId(venueId: string) {
    setSelectedVenueIdState(venueId);
    localStorage.setItem(STORAGE_KEY, venueId);
  }

  return (
    <BranchContext.Provider value={{ selectedVenueId, setSelectedVenueId }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch(): BranchContextValue {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error("useBranch must be used within a BranchProvider");
  }
  return context;
}
```

- [ ] **Step 2: Wire the provider into the owner layout**

```tsx
// apps/web/src/app/owner/layout.tsx
import { OwnerSidebar } from "@/components/owner-sidebar";
import { AppShell } from "@/components/app-shell";
import { BranchProvider } from "@/lib/branch-context";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <BranchProvider>
      <AppShell sidebar={<OwnerSidebar />} accountHref="/owner/settings">
        {children}
      </AppShell>
    </BranchProvider>
  );
}
```

- [ ] **Step 3: Update `BranchSwitcher` to read/write the context instead of local state**

In `apps/web/src/components/branch-switcher.tsx`: remove the line `const ALL_BRANCHES_ID = "all";` and add `import { ALL_BRANCHES_ID, useBranch } from "@/lib/branch-context";`. Replace:
```tsx
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedId, setSelectedId] = useState(ALL_BRANCHES_ID);
```
with:
```tsx
  const [venues, setVenues] = useState<Venue[]>([]);
  const { selectedVenueId, setSelectedVenueId } = useBranch();
```
Then replace every remaining use of `selectedId` with `selectedVenueId` and every `setSelectedId` with `setSelectedVenueId` in the rest of the file (the `selectedLabel` computation and the two `DialogClose onClick` handlers and their `selectedId === ...` checks).

- [ ] **Step 4: Verify the web app typechecks**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors in `branch-context.tsx`, `owner/layout.tsx`, or `branch-switcher.tsx`. (Other pre-existing errors from Task 12's temporarily-missing `/owner/page.tsx` are expected until Task 19 — ignore those.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/branch-context.tsx apps/web/src/app/owner/layout.tsx apps/web/src/components/branch-switcher.tsx
git commit -m "feat(web): add BranchProvider context and wire BranchSwitcher to it"
```

---

## Task 14: (folded into Tasks 6, 7, 8 — no standalone work remains)

The three new/changed route handlers (`GET /api/venues/mine/courts`, `DELETE .../courts/[id]`, `POST`/`DELETE .../courts/[id]/images...`) were already created alongside their backend endpoints in Tasks 6-8, so the corresponding frontend proxy layer is complete. This task number is intentionally skipped to keep the plan's task numbering aligned with the order those files were actually touched — see Tasks 6, 7, 8.

---

## Task 15: `CourtMetrics` component

**Files:**
- Create: `apps/web/src/app/owner/court-metrics.tsx`

**Interfaces:**
- Consumes: `Court`/`CourtWithVenueName` from `apps/web/src/app/owner/types.ts` (Task 10).
- Produces: `CourtMetrics({ courts }: { courts: Court[] })` — 4 stat cards (Tổng sân/Hoạt động/Bảo trì/Tạm đóng), computed client-side.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/app/owner/court-metrics.tsx
import { Card, CardContent } from "@/components/ui/card";
import type { Court } from "./types";

interface CourtMetricsProps {
  courts: Pick<Court, "status">[];
}

export function CourtMetrics({ courts }: CourtMetricsProps) {
  const total = courts.length;
  const active = courts.filter((court) => court.status === "active").length;
  const maintenance = courts.filter((court) => court.status === "maintenance").length;
  const closed = courts.filter((court) => court.status === "closed").length;

  const items = [
    { label: "Tổng sân", value: total },
    { label: "Hoạt động", value: active },
    { label: "Bảo trì", value: maintenance },
    { label: "Tạm đóng", value: closed },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-sm text-muted-foreground">{item.label}</span>
            <span className="text-2xl font-bold">{item.value}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep court-metrics || echo "no errors"`
Expected: `no errors`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/court-metrics.tsx
git commit -m "feat(web): add CourtMetrics stat cards component"
```

---

## Task 16: `CourtFormDialog` (add/edit + image management)

**Files:**
- Create: `apps/web/src/app/owner/court-form-dialog.tsx`

**Interfaces:**
- Consumes: `createCourtSchema`/`updateCourtSchema` (Task 9), `Court`/`CourtImage` types (Task 10), `Dialog`/`DialogTrigger`/`DialogContent`/`DialogTitle`/`DialogClose` (`apps/web/src/components/ui/dialog.tsx`), `getSubmitErrorMessage`.
- Produces: `CourtFormDialog` — `mode: "create" | "edit"`, `venues: { id: string; name: string }[]`, `defaultVenueId?: string` (create mode only), `court?: Court` (edit mode, required), `trigger: React.ReactElement`, `onSaved: (court: Court) => void`. Consumed by Task 17 (edit trigger) and Task 19 (create trigger).

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/app/owner/court-form-dialog.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
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
  createCourtSchema,
  updateCourtSchema,
  type CreateCourtInput,
  type UpdateCourtInput,
} from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { Court, CourtImage } from "./types";

interface VenueOption {
  id: string;
  name: string;
}

interface CourtFormDialogProps {
  venues: VenueOption[];
  trigger: React.ReactElement;
  onSaved: (court: Court) => void;
  mode: "create";
  defaultVenueId?: string;
}

interface CourtFormDialogEditProps {
  venues: VenueOption[];
  trigger: React.ReactElement;
  onSaved: (court: Court) => void;
  mode: "edit";
  court: Court;
}

const STATUS_OPTIONS: { value: Court["status"]; label: string }[] = [
  { value: "active", label: "Hoạt động" },
  { value: "maintenance", label: "Bảo trì" },
  { value: "closed", label: "Tạm đóng" },
];

export function CourtFormDialog(
  props: CourtFormDialogProps | CourtFormDialogEditProps,
) {
  const { venues, trigger, onSaved, mode } = props;
  const [open, setOpen] = useState(false);
  const isEdit = mode === "edit";
  // Narrow on `props.mode` directly (not the extracted `isEdit`) so TypeScript
  // can prove which union member `props` is in each branch.
  const court = props.mode === "edit" ? props.court : undefined;
  const defaultVenueId = props.mode === "create" ? props.defaultVenueId : undefined;

  const form = useForm<
    z.input<typeof createCourtSchema | typeof updateCourtSchema>,
    unknown,
    CreateCourtInput | UpdateCourtInput
  >({
    resolver: zodResolver(isEdit ? updateCourtSchema : createCourtSchema),
    defaultValues: isEdit
      ? {
          name: court!.name,
          pricePerHour: court!.pricePerHour,
          openTime: court!.openTime.slice(0, 5),
          closeTime: court!.closeTime.slice(0, 5),
          slotDurationMinutes: court!.slotDurationMinutes,
          description: court!.description ?? "",
          capacity: court!.capacity ?? undefined,
          displayOrder: court!.displayOrder,
          status: court!.status,
        }
      : {
          name: "",
          pricePerHour: 0,
          openTime: "08:00",
          closeTime: "20:00",
          slotDurationMinutes: 60,
          capacity: 10,
          displayOrder: 0,
        },
  });
  const [venueId, setVenueId] = useState(
    isEdit ? court!.venueId : defaultVenueId ?? "",
  );

  async function onSubmit(values: CreateCourtInput | UpdateCourtInput) {
    if (!venueId) {
      toast.error("Vui lòng chọn chi nhánh");
      return;
    }
    const url = isEdit
      ? `/api/venues/mine/${venueId}/courts/${court!.id}`
      : `/api/venues/mine/${venueId}/courts`;
    const response = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success(isEdit ? "Đã lưu thay đổi" : "Đã thêm sân");
    onSaved(data as Court);
    if (!isEdit) {
      form.reset();
    }
    setOpen(false);
  }

  const { errors } = form.formState;

  return (
    <Dialog open={open} onOpenChange={(next) => setOpen(next)}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-md">
        <DialogTitle>{isEdit ? "Sửa sân" : "Thêm sân mới"}</DialogTitle>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="mt-4 flex max-h-[70vh] flex-col gap-4 overflow-y-auto"
        >
          <div className="space-y-2">
            <Label htmlFor="court-venue">Chi nhánh</Label>
            <select
              id="court-venue"
              value={venueId}
              onChange={(event) => setVenueId(event.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
            >
              <option value="" disabled>
                Chọn chi nhánh
              </option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="court-name">Tên sân</Label>
            <Input id="court-name" aria-invalid={!!errors.name} {...form.register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="court-price">Giá/giờ (VNĐ)</Label>
            <Input
              id="court-price"
              type="number"
              step="1000"
              aria-invalid={!!errors.pricePerHour}
              {...form.register("pricePerHour")}
            />
            {errors.pricePerHour && (
              <p className="text-sm text-destructive">{errors.pricePerHour.message}</p>
            )}
          </div>
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="court-open">Giờ mở cửa</Label>
              <Input id="court-open" type="time" {...form.register("openTime")} />
              {errors.openTime && (
                <p className="text-sm text-destructive">{errors.openTime.message}</p>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="court-close">Giờ đóng cửa</Label>
              <Input id="court-close" type="time" {...form.register("closeTime")} />
              {errors.closeTime && (
                <p className="text-sm text-destructive">{errors.closeTime.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="court-slot">Độ dài khung giờ (phút)</Label>
            <Input id="court-slot" type="number" {...form.register("slotDurationMinutes")} />
            {errors.slotDurationMinutes && (
              <p className="text-sm text-destructive">{errors.slotDurationMinutes.message}</p>
            )}
          </div>
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="court-capacity">Sức chứa</Label>
              <Input id="court-capacity" type="number" {...form.register("capacity")} />
              {errors.capacity && (
                <p className="text-sm text-destructive">{errors.capacity.message}</p>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="court-order">Thứ tự</Label>
              <Input id="court-order" type="number" {...form.register("displayOrder")} />
            </div>
          </div>
          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="court-status">Trạng thái</Label>
              <select
                id="court-status"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
                {...form.register("status")}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="court-description">Mô tả sân</Label>
            <textarea
              id="court-description"
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none"
              {...form.register("description")}
            />
          </div>
          {isEdit && (
            <CourtImagesField
              venueId={venueId}
              courtId={court!.id}
              initialImages={court!.images}
            />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose className="rounded-lg border px-2.5 py-1.5 text-sm">
              Hủy
            </DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Lưu sân
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface CourtImagesFieldProps {
  venueId: string;
  courtId: string;
  initialImages: CourtImage[];
}

function CourtImagesField({ venueId, courtId, initialImages }: CourtImagesFieldProps) {
  const [images, setImages] = useState<CourtImage[]>(initialImages ?? []);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(
      `/api/venues/mine/${venueId}/courts/${courtId}/images`,
      { method: "POST", body: formData },
    );
    const data = await response.json().catch(() => null);
    setUploading(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    setImages((previous) => [...previous, data as CourtImage]);
    toast.success("Đã thêm ảnh");
  }

  async function handleRemove(imageId: string) {
    const response = await fetch(
      `/api/venues/mine/${venueId}/courts/${courtId}/images/${imageId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      toast.error("Không thể xoá ảnh, vui lòng thử lại.");
      return;
    }
    setImages((previous) => previous.filter((image) => image.id !== imageId));
  }

  return (
    <div className="space-y-2">
      <Label>Ảnh sân</Label>
      {images.length === 0 && (
        <p className="text-sm text-muted-foreground">Chưa có ảnh nào.</p>
      )}
      <ul className="flex flex-wrap gap-2">
        {images.map((image) => (
          <li key={image.id} className="relative">
            <img src={image.url} alt="" className="size-16 rounded object-cover" />
            <button
              type="button"
              onClick={() => handleRemove(image.id)}
              className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground"
              aria-label="Xóa ảnh"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleUpload}
        disabled={uploading}
      />
    </div>
  );
}
```

Note: `CourtImagesField` takes `initialImages` from `court.images`, which Task 5 now attaches to every court returned by `findByVenueForOwner`/`findAllForOwner` — no extra fetch needed (mirrors how `VenueImagesSection` receives `images` as a prop rather than fetching them itself).

- [ ] **Step 2: Verify it typechecks**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep court-form-dialog || echo "no errors"`
Expected: `no errors`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/court-form-dialog.tsx
git commit -m "feat(web): add CourtFormDialog for create/edit with image upload"
```

---

## Task 17: `CourtActions` (view pricing / edit / delete)

**Files:**
- Create: `apps/web/src/app/owner/court-actions.tsx`

**Interfaces:**
- Consumes: `CourtFormDialog` (Task 16), `Court` type (Task 10).
- Produces: `CourtActions({ court, venues, onUpdated, onDeleted })` — 3 icon buttons, used by Task 18's table/grid rows.

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/app/owner/court-actions.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CourtFormDialog } from "./court-form-dialog";
import type { Court } from "./types";

interface VenueOption {
  id: string;
  name: string;
}

interface CourtActionsProps {
  court: Court;
  venues: VenueOption[];
  onUpdated: (court: Court) => void;
  onDeleted: (courtId: string) => void;
}

export function CourtActions({ court, venues, onUpdated, onDeleted }: CourtActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const response = await fetch(
      `/api/venues/mine/${court.venueId}/courts/${court.id}`,
      { method: "DELETE" },
    );
    setDeleting(false);
    if (response.status === 409) {
      const data = await response.json().catch(() => null);
      toast.error(
        data?.message ??
          "Sân đã có lịch sử đặt sân, hãy chuyển sang trạng thái Tạm đóng thay vì xóa.",
      );
      setDeleteOpen(false);
      return;
    }
    if (!response.ok) {
      toast.error("Không thể xóa sân, vui lòng thử lại.");
      return;
    }
    toast.success("Đã xóa sân");
    setDeleteOpen(false);
    onDeleted(court.id);
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon-sm"
        render={<Link href={`/owner/pricing?courtId=${court.id}`} aria-label="Xem bảng giá" />}
      >
        <Eye className="size-3.5" />
      </Button>
      <CourtFormDialog
        mode="edit"
        court={court}
        venues={venues}
        onSaved={onUpdated}
        trigger={
          <Button variant="outline" size="icon-sm" aria-label="Sửa sân">
            <Pencil className="size-3.5" />
          </Button>
        }
      />
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogTrigger
          render={
            <Button variant="destructive" size="icon-sm" aria-label="Xóa sân">
              <Trash2 className="size-3.5" />
            </Button>
          }
        />
        <DialogContent className="max-w-sm">
          <DialogTitle>Xóa sân "{court.name}"?</DialogTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            Hành động này không thể hoàn tác.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <DialogClose className="rounded-lg border px-2.5 py-1.5 text-sm">
              Hủy
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              Xóa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep court-actions || echo "no errors"`
Expected: `no errors`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/court-actions.tsx
git commit -m "feat(web): add CourtActions (view pricing / edit / delete)"
```

---

## Task 18: `CourtTable` + `CourtGrid` views

**Files:**
- Create: `apps/web/src/app/owner/court-table.tsx`
- Create: `apps/web/src/app/owner/court-grid.tsx`

**Interfaces:**
- Consumes: `CourtActions` (Task 17), `Table*` components (`apps/web/src/components/ui/table.tsx`), `Card` (`apps/web/src/components/ui/card.tsx`), `Court`/`CourtWithVenueName` types (Task 10).
- Produces: `CourtTable({ courts, venues, showVenueColumn, onUpdated, onDeleted })`, `CourtGrid({ courts, venues, showVenueBadge, onUpdated, onDeleted })` — consumed by Task 19.

- [ ] **Step 1: Write `CourtTable`**

```tsx
// apps/web/src/app/owner/court-table.tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CourtActions } from "./court-actions";
import type { Court, CourtWithVenueName } from "./types";

const STATUS_LABEL: Record<Court["status"], string> = {
  active: "Hoạt động",
  maintenance: "Bảo trì",
  closed: "Tạm đóng",
};

const STATUS_CLASS: Record<Court["status"], string> = {
  active: "text-emerald-600",
  maintenance: "text-amber-600",
  closed: "text-muted-foreground",
};

interface VenueOption {
  id: string;
  name: string;
}

interface CourtTableProps {
  courts: (Court | CourtWithVenueName)[];
  venues: VenueOption[];
  showVenueColumn: boolean;
  onUpdated: (court: Court) => void;
  onDeleted: (courtId: string) => void;
}

export function CourtTable({
  courts,
  venues,
  showVenueColumn,
  onUpdated,
  onDeleted,
}: CourtTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Sân</TableHead>
          {showVenueColumn && <TableHead>Chi nhánh</TableHead>}
          <TableHead>Sức chứa</TableHead>
          <TableHead>Trạng thái</TableHead>
          <TableHead>Thao tác</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {courts.map((court) => (
          <TableRow key={court.id}>
            <TableCell className="font-medium">{court.name}</TableCell>
            {showVenueColumn && (
              <TableCell>
                {"venueName" in court ? court.venueName : ""}
              </TableCell>
            )}
            <TableCell>{court.capacity ?? "—"}</TableCell>
            <TableCell className={STATUS_CLASS[court.status]}>
              {STATUS_LABEL[court.status]}
            </TableCell>
            <TableCell>
              <CourtActions
                court={court}
                venues={venues}
                onUpdated={onUpdated}
                onDeleted={onDeleted}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 2: Write `CourtGrid`**

```tsx
// apps/web/src/app/owner/court-grid.tsx
import { Card, CardContent } from "@/components/ui/card";
import { CourtActions } from "./court-actions";
import type { Court, CourtWithVenueName } from "./types";

const STATUS_LABEL: Record<Court["status"], string> = {
  active: "Hoạt động",
  maintenance: "Bảo trì",
  closed: "Tạm đóng",
};

const STATUS_CLASS: Record<Court["status"], string> = {
  active: "bg-emerald-100 text-emerald-700",
  maintenance: "bg-amber-100 text-amber-700",
  closed: "bg-muted text-muted-foreground",
};

interface VenueOption {
  id: string;
  name: string;
}

interface CourtGridProps {
  courts: (Court | CourtWithVenueName)[];
  venues: VenueOption[];
  showVenueBadge: boolean;
  onUpdated: (court: Court) => void;
  onDeleted: (courtId: string) => void;
}

export function CourtGrid({
  courts,
  venues,
  showVenueBadge,
  onUpdated,
  onDeleted,
}: CourtGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {courts.map((court) => (
        <Card key={court.id}>
          <CardContent className="flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{court.name}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[court.status]}`}
              >
                {STATUS_LABEL[court.status]}
              </span>
            </div>
            {showVenueBadge && "venueName" in court && (
              <span className="text-xs text-muted-foreground">{court.venueName}</span>
            )}
            <span className="text-sm text-muted-foreground">
              Sức chứa: {court.capacity ?? "—"}
            </span>
            {court.description && (
              <p className="line-clamp-2 text-sm text-muted-foreground">
                {court.description}
              </p>
            )}
            <div className="pt-2">
              <CourtActions
                court={court}
                venues={venues}
                onUpdated={onUpdated}
                onDeleted={onDeleted}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Verify it typechecks**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -E "court-table|court-grid" || echo "no errors"`
Expected: `no errors`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/owner/court-table.tsx apps/web/src/app/owner/court-grid.tsx
git commit -m "feat(web): add CourtTable and CourtGrid views"
```

---

## Task 19: `/owner` page — final wiring (Danh sách sân)

**Files:**
- Create: `apps/web/src/app/owner/page.tsx`

**Interfaces:**
- Consumes: `useBranch`/`ALL_BRANCHES_ID` (Task 13), `CourtMetrics` (Task 15), `CourtFormDialog` (Task 16), `CourtTable`/`CourtGrid` (Task 18), `Court`/`CourtWithVenueName` (Task 10).
- Produces: the page the sidebar's "Danh sách sân" link points to.

- [ ] **Step 1: Write the page**

```tsx
// apps/web/src/app/owner/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ALL_BRANCHES_ID, useBranch } from "@/lib/branch-context";
import { CourtMetrics } from "./court-metrics";
import { CourtTable } from "./court-table";
import { CourtGrid } from "./court-grid";
import { CourtFormDialog } from "./court-form-dialog";
import type { Court, CourtWithVenueName } from "./types";

interface VenueOption {
  id: string;
  name: string;
}

const VIEW_STORAGE_KEY = "courts-view-mode";

export default function OwnerCourtsPage() {
  const router = useRouter();
  const { selectedVenueId } = useBranch();
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [courts, setCourts] = useState<(Court | CourtWithVenueName)[] | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");

  useEffect(() => {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    if (stored === "grid" || stored === "table") {
      setViewMode(stored);
    }
  }, []);

  function changeViewMode(mode: "table" | "grid") {
    setViewMode(mode);
    localStorage.setItem(VIEW_STORAGE_KEY, mode);
  }

  useEffect(() => {
    fetch("/api/venues/mine")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner");
          return null;
        }
        return (await res.json()) as VenueOption[];
      })
      .then((data) => {
        if (data) setVenues(data);
      });
  }, [router]);

  useEffect(() => {
    setCourts(null);
    const url =
      selectedVenueId === ALL_BRANCHES_ID
        ? "/api/venues/mine/courts"
        : `/api/venues/mine/${selectedVenueId}/courts`;
    fetch(url)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCourts(Array.isArray(data) ? data : []));
  }, [selectedVenueId]);

  const filteredCourts = useMemo(() => {
    if (!courts) return [];
    const query = search.trim().toLowerCase();
    if (!query) return courts;
    return courts.filter(
      (court) =>
        court.name.toLowerCase().includes(query) ||
        (court.description ?? "").toLowerCase().includes(query),
    );
  }, [courts, search]);

  function handleCourtCreated(court: Court) {
    setCourts((previous) => (previous ? [...previous, court] : [court]));
  }

  function handleCourtUpdated(court: Court) {
    setCourts((previous) =>
      previous
        ? previous.map((item) => (item.id === court.id ? { ...item, ...court } : item))
        : previous,
    );
  }

  function handleCourtDeleted(courtId: string) {
    setCourts((previous) => previous?.filter((item) => item.id !== courtId) ?? previous);
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Danh sách sân</h1>
        {venues.length > 0 && (
          <CourtFormDialog
            mode="create"
            venues={venues}
            defaultVenueId={selectedVenueId === ALL_BRANCHES_ID ? undefined : selectedVenueId}
            onSaved={handleCourtCreated}
            trigger={<Button>+ Thêm sân mới</Button>}
          />
        )}
      </div>

      {venues.length === 0 && (
        <p className="text-muted-foreground">
          Bạn chưa có chi nhánh nào.{" "}
          <Link href="/owner/branches/new" className="text-primary underline">
            Tạo chi nhánh mới
          </Link>{" "}
          trước khi thêm sân.
        </p>
      )}

      {courts && <CourtMetrics courts={courts} />}

      <div className="flex items-center justify-between gap-4">
        <input
          type="text"
          placeholder="Tìm theo tên hoặc mô tả..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="h-9 max-w-sm flex-1 rounded-md border bg-background px-3 text-sm outline-none"
        />
        <div className="flex gap-1 rounded-md border p-1">
          <button
            type="button"
            onClick={() => changeViewMode("table")}
            className={`rounded px-2 py-1 text-sm ${viewMode === "table" ? "bg-muted font-medium" : ""}`}
          >
            Bảng
          </button>
          <button
            type="button"
            onClick={() => changeViewMode("grid")}
            className={`rounded px-2 py-1 text-sm ${viewMode === "grid" ? "bg-muted font-medium" : ""}`}
          >
            Lưới
          </button>
        </div>
      </div>

      {courts === null && <p>Đang tải...</p>}
      {courts !== null && filteredCourts.length === 0 && (
        <p className="text-muted-foreground">Không tìm thấy sân nào.</p>
      )}
      {courts !== null && filteredCourts.length > 0 && viewMode === "table" && (
        <CourtTable
          courts={filteredCourts}
          venues={venues}
          showVenueColumn={selectedVenueId === ALL_BRANCHES_ID}
          onUpdated={handleCourtUpdated}
          onDeleted={handleCourtDeleted}
        />
      )}
      {courts !== null && filteredCourts.length > 0 && viewMode === "grid" && (
        <CourtGrid
          courts={filteredCourts}
          venues={venues}
          showVenueBadge={selectedVenueId === ALL_BRANCHES_ID}
          onUpdated={handleCourtUpdated}
          onDeleted={handleCourtDeleted}
        />
      )}
    </main>
  );
}
```

Add the missing `Button` import at the top (`import { Button } from "@/components/ui/button";`) alongside the existing imports.

- [ ] **Step 2: Full web typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors anywhere in the project (this is the first point where every moved/created file is wired together, so this is the real gate for Tasks 10-19).

- [ ] **Step 3: Full web test suite**

Run: `cd apps/web && npm test`
Expected: PASS.

- [ ] **Step 4: Manual walkthrough**

Run `cd apps/api && npm run start:dev` and `cd apps/web && npm run dev`, then as an owner:
1. Visit `/owner` — see the courts list for the default selected branch (or "Tất cả chi nhánh" if none stored yet), metric cards, search box, table/grid toggle.
2. Click "+ Thêm sân mới" — dialog opens, chi nhánh defaults to the currently selected branch, submit creates a court and it appears in the list without a page reload.
3. Switch branches via the sidebar `BranchSwitcher` — the list refetches and shows only that branch's courts; switch to "Tất cả chi nhánh" — list shows courts from every branch with a "Chi nhánh" column/badge.
4. Click the pencil icon on a court — edit dialog opens pre-filled, upload an image, confirm it appears as a thumbnail with a working delete (×) button.
5. Click the trash icon on a court with no bookings — confirm dialog, delete succeeds, court disappears from the list.
6. Visit `/owner/branches` — see the venue list (renamed from the old `/owner`), "Thêm chi nhánh mới" creates a venue and redirects to `/owner/branches/[id]`, which shows venue info/images/bookings but no court management.

Expected: every step above behaves as described, no console errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/owner/page.tsx
git commit -m "feat(web): add /owner Danh sách sân page (metrics, search, table/grid, add court)"
```

---

## Self-Review Notes

- **Spec coverage:** §2 (data model) → Tasks 1-2. §3 (API) → Tasks 5-8. §4 (routing/state) → Tasks 11-13. §5 (page UI) → Tasks 15-19. §6 (schema/validation) → Task 9. §7 (out of scope) — deliberately not built (multi-sport, other pages reading `BranchProvider`, `/owner/pricing` filtering, image count limits, drag-reorder, object storage, full `branches-design.md` feature set).
- **Route collision risk** (`GET /venues/mine/courts` vs `GET /venues/mine/:id`) is called out explicitly in Task 6 with the fix (declare on `VenuesController`, before `findMineById`) and a manual verification step, since this is the kind of bug that would only surface at runtime, not in unit tests that mock the repository layer.
- **Type consistency:** `Court`/`CourtWithVenueName`/`CourtImage`/`CourtStatus` (frontend, Task 10) mirror `Court`/`CourtWithVenueName`/`CourtImage`/`CourtStatus` (backend, Tasks 2 & 5) field-for-field. `CourtFormDialog`'s `onSaved: (court: Court) => void` matches what `CourtActions`/`page.tsx` pass as `onUpdated`/`handleCourtCreated`.
- **No placeholders:** every step includes complete file contents or exact insertion points; the one explicit deferral (Task 8's storage-config placeholder introduced in Task 5) is because `CourtsService`'s constructor and method bodies need the import to exist to typecheck, and is fully resolved within the same plan (Task 8, not left dangling).
- **Court images plumbing:** caught during self-review that `CourtFormDialog`'s image section had nowhere to source the current image list from (no single-court-detail endpoint exists, and an earlier draft's in-render `fetch()` never read its response). Fixed by having `findByVenueForOwner`/`findAllForOwner` (Task 5) attach each court's `images: CourtImage[]` directly — mirroring how `VenuesController.findMineById` already attaches `images` to a venue — so `CourtImagesField` (Task 16) just takes `court.images` as a prop, no extra round trip.
- **Discriminated union narrowing:** an earlier draft of `CourtFormDialog` (Task 16) computed `isEdit` from a destructured `mode` variable and then branched on `isEdit` to access `props.court`/`props.defaultVenueId` — TypeScript can't narrow a union from a derived boolean, only from a check on the union value itself. Fixed by checking `props.mode === "edit"`/`props.mode === "create"` directly when extracting `court`/`defaultVenueId`.
