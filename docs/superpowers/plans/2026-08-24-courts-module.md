# Courts Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Courts module backend (NestJS API): owners register venues and courts inside them, configure opening hours/price, admin approves venues, and the public can search venues and view generated time slots.

**Architecture:** A new `courts` NestJS module (mirroring the existing `users`/`auth`/`admin` module style) owns three TypeORM entities — `Venue`, `VenueImage`, `Court` — behind two services (`VenuesService`, `CourtsService`) and two controllers (`VenuesController`, `CourtsController`). Admin approval endpoints extend the existing `admin` module, following the exact pattern already used for owner approval (`AdminController` → `UsersService`). Time-slot generation is a pure function computed on request — no persisted slots table.

**Tech Stack:** NestJS 11, TypeORM (`^1.1.0` as pinned in this repo), PostgreSQL (via `docker-compose`, port 5433), class-validator, Jest (`ts-jest`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-24-courts-module-design.md`
- Backend-only in this plan — no frontend work.
- Approval happens at the **venue** level only; courts have no separate approval, only `is_active`.
- No hard delete anywhere — only `status` (venue) / `is_active` (court).
- Images are **URLs only** (owner pastes a link), matching the existing `avatarUrl` pattern — no file upload infra.
- `open_time < close_time`; `slot_duration_minutes` in `[15, 240]`; `price_per_hour > 0`.
- Editing an already-`active` venue/court does **not** trigger re-approval.
- Error messages user-facing from the service layer are in Vietnamese, matching `UsersService`/`AuthService` conventions (e.g. `"Venue ${id} không tồn tại"`).
- No TypeORM relation decorators (`@ManyToOne` etc.) or DB foreign-key constraints — this codebase stores foreign keys as plain columns (see `RefreshToken.userId`). Follow that convention for `ownerId`/`venueId`.
- All new migrations are **generated** via `npm run migration:generate`, never hand-written — matching every existing migration in `apps/api/src/migrations/`.

---

## Task 1: Data model — `Venue`, `VenueImage`, `Court` entities + migration

**Files:**
- Create: `apps/api/src/courts/entities/venue.entity.ts`
- Create: `apps/api/src/courts/entities/venue-image.entity.ts`
- Create: `apps/api/src/courts/entities/court.entity.ts`
- Create: `apps/api/src/migrations/<generated-timestamp>-CreateVenuesAndCourts.ts` (generated, not hand-written)

**Interfaces:**
- Consumes: nothing new (postgres running via `docker-compose`, already up on port 5433 per `.env`)
- Produces:
  - `Venue { id: string; ownerId: string; name: string; address: string; city: string; description: string | null; status: VenueStatus; createdAt: Date; updatedAt: Date }`
  - `VenueStatus` enum: `PENDING_APPROVAL = 'pending_approval'`, `ACTIVE = 'active'`, `REJECTED = 'rejected'`
  - `VenueImage { id: string; venueId: string; url: string; createdAt: Date }`
  - `Court { id: string; venueId: string; name: string; pricePerHour: number; openTime: string; closeTime: string; slotDurationMinutes: number; isActive: boolean; createdAt: Date; updatedAt: Date }`
  - DB tables `venues`, `venue_images`, `courts`

- [ ] **Step 1: Create the `Venue` entity**

```typescript
// apps/api/src/courts/entities/venue.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VenueStatus {
  PENDING_APPROVAL = 'pending_approval',
  ACTIVE = 'active',
  REJECTED = 'rejected',
}

@Entity('venues')
export class Venue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @Column()
  name: string;

  @Column()
  address: string;

  @Column()
  city: string;

  @Column({ nullable: true, type: 'varchar' })
  description: string | null;

  @Column({
    type: 'enum',
    enum: VenueStatus,
    default: VenueStatus.PENDING_APPROVAL,
  })
  status: VenueStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Create the `VenueImage` entity**

```typescript
// apps/api/src/courts/entities/venue-image.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('venue_images')
export class VenueImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'venue_id' })
  venueId: string;

  @Column()
  url: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
```

- [ ] **Step 3: Create the `Court` entity**

```typescript
// apps/api/src/courts/entities/court.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

- [ ] **Step 4: Generate the migration**

`AppDataSource` (`apps/api/src/config/data-source.ts`) globs `src/**/*.entity.ts`, so the three new entities are picked up automatically — no config change needed.

Run (from `apps/api`):
```bash
npm run migration:generate -- src/migrations/CreateVenuesAndCourts
```
Expected: a new file `apps/api/src/migrations/<timestamp>-CreateVenuesAndCourts.ts` is created, containing `CREATE TYPE "public"."venues_status_enum" ...` and three `CREATE TABLE` statements (`venues`, `venue_images`, `courts`).

- [ ] **Step 5: Read the generated migration file and sanity-check it**

Confirm it contains exactly 3 `CREATE TABLE` statements and 1 `CREATE TYPE` statement, with column names matching the entities above (snake_case: `owner_id`, `venue_id`, `price_per_hour`, `open_time`, `close_time`, `slot_duration_minutes`, `is_active`, `created_at`, `updated_at`). If TypeORM emitted anything unexpected (e.g. a foreign key constraint), remove it manually to stay consistent with the rest of the codebase's FK-less convention.

- [ ] **Step 6: Run the migration**

```bash
npm run migration:run
```
Expected output ends with: `Migration CreateVenuesAndCourts<timestamp> has been executed successfully.`

- [ ] **Step 7: Verify the tables in Postgres**

```bash
docker exec pickleball-postgres-1 psql -U pickleball -d pickleball -c "\d venues"
docker exec pickleball-postgres-1 psql -U pickleball -d pickleball -c "\d venue_images"
docker exec pickleball-postgres-1 psql -U pickleball -d pickleball -c "\d courts"
```
Expected: each command prints a column listing matching the entity fields above.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/courts/entities apps/api/src/migrations
git commit -m "feat(api): add Venue, VenueImage, Court entities and migration"
```

---

## Task 2: Time utilities + slot generator (pure functions)

**Files:**
- Create: `apps/api/src/courts/time.util.ts`
- Create: `apps/api/src/courts/time.util.spec.ts`
- Create: `apps/api/src/courts/slot-generator.ts`
- Create: `apps/api/src/courts/slot-generator.spec.ts`

**Interfaces:**
- Consumes: nothing (pure, no DB/DI)
- Produces:
  - `TIME_PATTERN: RegExp` — matches `HH:mm` (24h)
  - `timeToMinutes(time: string): number`
  - `Slot { start: string; end: string; price: number }`
  - `GenerateSlotsInput { openTime: string; closeTime: string; slotDurationMinutes: number; pricePerHour: number }`
  - `generateSlots(input: GenerateSlotsInput): Slot[]`

- [ ] **Step 1: Write failing tests for `time.util.ts`**

```typescript
// apps/api/src/courts/time.util.spec.ts
import { TIME_PATTERN, timeToMinutes } from './time.util';

describe('TIME_PATTERN', () => {
  it('matches valid HH:mm times', () => {
    expect(TIME_PATTERN.test('00:00')).toBe(true);
    expect(TIME_PATTERN.test('23:59')).toBe(true);
    expect(TIME_PATTERN.test('09:05')).toBe(true);
  });

  it('rejects invalid times', () => {
    expect(TIME_PATTERN.test('24:00')).toBe(false);
    expect(TIME_PATTERN.test('9:05')).toBe(false);
    expect(TIME_PATTERN.test('09:60')).toBe(false);
    expect(TIME_PATTERN.test('not-a-time')).toBe(false);
  });
});

describe('timeToMinutes', () => {
  it('converts HH:mm to minutes since midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('01:30')).toBe(90);
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('ignores a trailing seconds component from Postgres time columns', () => {
    expect(timeToMinutes('08:00:00')).toBe(480);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx jest time.util.spec.ts
```
Expected: FAIL — `Cannot find module './time.util'`.

- [ ] **Step 3: Implement `time.util.ts`**

```typescript
// apps/api/src/courts/time.util.ts
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}
```

- [ ] **Step 4: Run and confirm pass**

```bash
npx jest time.util.spec.ts
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Write failing tests for `slot-generator.ts`**

```typescript
// apps/api/src/courts/slot-generator.spec.ts
import { generateSlots } from './slot-generator';

describe('generateSlots', () => {
  it('generates consecutive slots from open to close time', () => {
    const slots = generateSlots({
      openTime: '08:00',
      closeTime: '10:00',
      slotDurationMinutes: 60,
      pricePerHour: 100000,
    });

    expect(slots).toEqual([
      { start: '08:00', end: '09:00', price: 100000 },
      { start: '09:00', end: '10:00', price: 100000 },
    ]);
  });

  it('scales price to the slot duration', () => {
    const slots = generateSlots({
      openTime: '08:00',
      closeTime: '09:00',
      slotDurationMinutes: 30,
      pricePerHour: 100000,
    });

    expect(slots).toEqual([
      { start: '08:00', end: '08:30', price: 50000 },
      { start: '08:30', end: '09:00', price: 50000 },
    ]);
  });

  it('drops a trailing partial slot that does not fit evenly', () => {
    const slots = generateSlots({
      openTime: '08:00',
      closeTime: '09:50',
      slotDurationMinutes: 60,
      pricePerHour: 100000,
    });

    expect(slots).toEqual([{ start: '08:00', end: '09:00', price: 100000 }]);
  });

  it('handles times with a seconds component from the Postgres time column', () => {
    const slots = generateSlots({
      openTime: '08:00:00',
      closeTime: '09:00:00',
      slotDurationMinutes: 60,
      pricePerHour: 100000,
    });

    expect(slots).toEqual([{ start: '08:00', end: '09:00', price: 100000 }]);
  });

  it('returns no slots when the window is shorter than one slot', () => {
    const slots = generateSlots({
      openTime: '08:00',
      closeTime: '08:10',
      slotDurationMinutes: 60,
      pricePerHour: 100000,
    });

    expect(slots).toEqual([]);
  });
});
```

- [ ] **Step 6: Run and confirm failure**

```bash
npx jest slot-generator.spec.ts
```
Expected: FAIL — `Cannot find module './slot-generator'`.

- [ ] **Step 7: Implement `slot-generator.ts`**

```typescript
// apps/api/src/courts/slot-generator.ts
import { timeToMinutes } from './time.util';

export interface Slot {
  start: string;
  end: string;
  price: number;
}

export interface GenerateSlotsInput {
  openTime: string;
  closeTime: string;
  slotDurationMinutes: number;
  pricePerHour: number;
}

function toTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function generateSlots(input: GenerateSlotsInput): Slot[] {
  const openMinutes = timeToMinutes(input.openTime);
  const closeMinutes = timeToMinutes(input.closeTime);
  const pricePerSlot = input.pricePerHour * (input.slotDurationMinutes / 60);

  const slots: Slot[] = [];
  for (
    let start = openMinutes;
    start + input.slotDurationMinutes <= closeMinutes;
    start += input.slotDurationMinutes
  ) {
    slots.push({
      start: toTimeString(start),
      end: toTimeString(start + input.slotDurationMinutes),
      price: Math.round(pricePerSlot * 100) / 100,
    });
  }
  return slots;
}
```

- [ ] **Step 8: Run and confirm pass**

```bash
npx jest slot-generator.spec.ts time.util.spec.ts
```
Expected: PASS, 9 tests total.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/courts/time.util.ts apps/api/src/courts/time.util.spec.ts apps/api/src/courts/slot-generator.ts apps/api/src/courts/slot-generator.spec.ts
git commit -m "feat(api): add time-parsing and slot-generation utilities"
```

---

## Task 3: `VenuesService`

**Files:**
- Create: `apps/api/src/courts/dto/create-venue.dto.ts`
- Create: `apps/api/src/courts/dto/update-venue.dto.ts`
- Create: `apps/api/src/courts/dto/add-venue-image.dto.ts`
- Create: `apps/api/src/courts/venues.service.ts`
- Create: `apps/api/src/courts/venues.service.spec.ts`

**Interfaces:**
- Consumes: `Venue`, `VenueStatus`, `VenueImage` from Task 1 (`./entities/venue.entity`, `./entities/venue-image.entity`)
- Produces (used by Tasks 4, 5, 6, 7):
  - `CreateVenueDto { name: string; address: string; city: string; description?: string }`
  - `UpdateVenueDto { name?: string; address?: string; city?: string; description?: string }`
  - `AddVenueImageDto { url: string }`
  - `VenuesService`:
    - `create(ownerId: string, dto: CreateVenueDto): Promise<Venue>`
    - `findMineByOwner(ownerId: string): Promise<Venue[]>`
    - `findMineById(ownerId: string, id: string): Promise<Venue>`
    - `update(ownerId: string, id: string, dto: UpdateVenueDto): Promise<Venue>`
    - `addImage(ownerId: string, venueId: string, dto: AddVenueImageDto): Promise<VenueImage>`
    - `removeImage(ownerId: string, venueId: string, imageId: string): Promise<void>`
    - `getOwnedVenueOrThrow(ownerId: string, venueId: string): Promise<Venue>` — throws `NotFoundException` if missing, `ForbiddenException` if owned by someone else
    - `findPendingVenues(): Promise<Venue[]>`
    - `approveVenue(id: string): Promise<Venue>`
    - `rejectVenue(id: string): Promise<Venue>`
    - `searchPublic(query?: string): Promise<Venue[]>` — only `ACTIVE` venues
    - `findPublicById(id: string): Promise<Venue>` — only `ACTIVE`, throws `NotFoundException` otherwise

- [ ] **Step 1: Create the DTOs**

```typescript
// apps/api/src/courts/dto/create-venue.dto.ts
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateVenueDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  address: string;

  @IsString()
  @MinLength(1)
  city: string;

  @IsOptional()
  @IsString()
  description?: string;
}
```

```typescript
// apps/api/src/courts/dto/update-venue.dto.ts
import { IsOptional, IsString, MinLength } from 'class-validator';

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
}
```

```typescript
// apps/api/src/courts/dto/add-venue-image.dto.ts
import { IsUrl } from 'class-validator';

export class AddVenueImageDto {
  @IsUrl()
  url: string;
}
```

- [ ] **Step 2: Write failing tests for `VenuesService`**

```typescript
// apps/api/src/courts/venues.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VenuesService } from './venues.service';
import { Venue, VenueStatus } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';

const mockVenuesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
});

const mockVenueImagesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      VenuesService,
      { provide: getRepositoryToken(Venue), useFactory: mockVenuesRepository },
      {
        provide: getRepositoryToken(VenueImage),
        useFactory: mockVenueImagesRepository,
      },
    ],
  }).compile();

  return {
    service: module.get(VenuesService),
    venuesRepo: module.get(getRepositoryToken(Venue)) as ReturnType<
      typeof mockVenuesRepository
    >,
    venueImagesRepo: module.get(getRepositoryToken(VenueImage)) as ReturnType<
      typeof mockVenueImagesRepository
    >,
  };
}

describe('VenuesService.create', () => {
  it('creates a venue with pending_approval status', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.create.mockImplementation((data) => data);
    venuesRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'venue-1', ...data }),
    );

    const result = await service.create('owner-1', {
      name: 'ABC Pickleball',
      address: '123 Le Loi',
      city: 'Ho Chi Minh',
    });

    expect(result.ownerId).toBe('owner-1');
    expect(result.status).toBe(VenueStatus.PENDING_APPROVAL);
  });
});

describe('VenuesService.getOwnedVenueOrThrow', () => {
  it('returns the venue when owned by the caller', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });

    const result = await service.getOwnedVenueOrThrow('owner-1', 'venue-1');

    expect(result.id).toBe('venue-1');
  });

  it('throws NotFoundException when the venue does not exist', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue(null);

    await expect(
      service.getOwnedVenueOrThrow('owner-1', 'venue-1'),
    ).rejects.toThrow('Venue venue-1 không tồn tại');
  });

  it('throws ForbiddenException when owned by someone else', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-2' });

    await expect(
      service.getOwnedVenueOrThrow('owner-1', 'venue-1'),
    ).rejects.toThrow('Bạn không có quyền truy cập venue này');
  });
});

describe('VenuesService.update', () => {
  it('updates only the provided fields', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      name: 'Old Name',
      address: 'Old Address',
      city: 'Old City',
      description: null,
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', {
      name: 'New Name',
    });

    expect(result.name).toBe('New Name');
    expect(result.address).toBe('Old Address');
  });
});

describe('VenuesService images', () => {
  it('addImage creates an image for an owned venue', async () => {
    const { service, venuesRepo, venueImagesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    venueImagesRepo.create.mockImplementation((data) => data);
    venueImagesRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'image-1', ...data }),
    );

    const result = await service.addImage('owner-1', 'venue-1', {
      url: 'https://example.com/a.jpg',
    });

    expect(result.venueId).toBe('venue-1');
    expect(result.url).toBe('https://example.com/a.jpg');
  });

  it('removeImage deletes an image belonging to an owned venue', async () => {
    const { service, venuesRepo, venueImagesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    venueImagesRepo.findOne.mockResolvedValue({ id: 'image-1', venueId: 'venue-1' });

    await service.removeImage('owner-1', 'venue-1', 'image-1');

    expect(venueImagesRepo.remove).toHaveBeenCalledWith({
      id: 'image-1',
      venueId: 'venue-1',
    });
  });

  it('removeImage throws NotFoundException when the image does not exist', async () => {
    const { service, venuesRepo, venueImagesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    venueImagesRepo.findOne.mockResolvedValue(null);

    await expect(
      service.removeImage('owner-1', 'venue-1', 'image-1'),
    ).rejects.toThrow('Ảnh image-1 không tồn tại');
  });
});

describe('VenuesService approval', () => {
  it('approveVenue activates a pending venue', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      status: VenueStatus.PENDING_APPROVAL,
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.approveVenue('venue-1');

    expect(result.status).toBe(VenueStatus.ACTIVE);
  });

  it('approveVenue rejects a venue that is not pending approval', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      status: VenueStatus.ACTIVE,
    });

    await expect(service.approveVenue('venue-1')).rejects.toThrow();
  });

  it('rejectVenue marks a pending venue as rejected', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      status: VenueStatus.PENDING_APPROVAL,
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.rejectVenue('venue-1');

    expect(result.status).toBe(VenueStatus.REJECTED);
  });

  it('findPendingVenues queries by pending_approval status', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1' }]);

    const result = await service.findPendingVenues();

    expect(venuesRepo.find).toHaveBeenCalledWith({
      where: { status: VenueStatus.PENDING_APPROVAL },
    });
    expect(result).toEqual([{ id: 'venue-1' }]);
  });
});

describe('VenuesService public reads', () => {
  it('searchPublic without a query returns only active venues', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1' }]);

    const result = await service.searchPublic();

    expect(venuesRepo.find).toHaveBeenCalledWith({
      where: { status: VenueStatus.ACTIVE },
    });
    expect(result).toEqual([{ id: 'venue-1' }]);
  });

  it('findPublicById throws NotFoundException for an inactive or missing venue', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue(null);

    await expect(service.findPublicById('venue-1')).rejects.toThrow(
      'Venue venue-1 không tồn tại',
    );
  });
});
```

- [ ] **Step 3: Run and confirm failure**

```bash
npx jest venues.service.spec.ts
```
Expected: FAIL — `Cannot find module './venues.service'`.

- [ ] **Step 4: Implement `VenuesService`**

```typescript
// apps/api/src/courts/venues.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Venue, VenueStatus } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { AddVenueImageDto } from './dto/add-venue-image.dto';

@Injectable()
export class VenuesService {
  constructor(
    @InjectRepository(Venue)
    private readonly venuesRepository: Repository<Venue>,
    @InjectRepository(VenueImage)
    private readonly venueImagesRepository: Repository<VenueImage>,
  ) {}

  create(ownerId: string, dto: CreateVenueDto): Promise<Venue> {
    const venue = this.venuesRepository.create({
      ownerId,
      name: dto.name,
      address: dto.address,
      city: dto.city,
      description: dto.description ?? null,
      status: VenueStatus.PENDING_APPROVAL,
    });
    return this.venuesRepository.save(venue);
  }

  findMineByOwner(ownerId: string): Promise<Venue[]> {
    return this.venuesRepository.find({ where: { ownerId } });
  }

  findMineById(ownerId: string, id: string): Promise<Venue> {
    return this.getOwnedVenueOrThrow(ownerId, id);
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateVenueDto,
  ): Promise<Venue> {
    const venue = await this.getOwnedVenueOrThrow(ownerId, id);
    if (dto.name !== undefined) venue.name = dto.name;
    if (dto.address !== undefined) venue.address = dto.address;
    if (dto.city !== undefined) venue.city = dto.city;
    if (dto.description !== undefined) venue.description = dto.description;
    return this.venuesRepository.save(venue);
  }

  async addImage(
    ownerId: string,
    venueId: string,
    dto: AddVenueImageDto,
  ): Promise<VenueImage> {
    await this.getOwnedVenueOrThrow(ownerId, venueId);
    const image = this.venueImagesRepository.create({
      venueId,
      url: dto.url,
    });
    return this.venueImagesRepository.save(image);
  }

  async removeImage(
    ownerId: string,
    venueId: string,
    imageId: string,
  ): Promise<void> {
    await this.getOwnedVenueOrThrow(ownerId, venueId);
    const image = await this.venueImagesRepository.findOne({
      where: { id: imageId, venueId },
    });
    if (!image) {
      throw new NotFoundException(`Ảnh ${imageId} không tồn tại`);
    }
    await this.venueImagesRepository.remove(image);
  }

  async getOwnedVenueOrThrow(
    ownerId: string,
    venueId: string,
  ): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({
      where: { id: venueId },
    });
    if (!venue) {
      throw new NotFoundException(`Venue ${venueId} không tồn tại`);
    }
    if (venue.ownerId !== ownerId) {
      throw new ForbiddenException('Bạn không có quyền truy cập venue này');
    }
    return venue;
  }

  findPendingVenues(): Promise<Venue[]> {
    return this.venuesRepository.find({
      where: { status: VenueStatus.PENDING_APPROVAL },
    });
  }

  approveVenue(id: string): Promise<Venue> {
    return this.transitionStatus(id, VenueStatus.ACTIVE);
  }

  rejectVenue(id: string): Promise<Venue> {
    return this.transitionStatus(id, VenueStatus.REJECTED);
  }

  private async transitionStatus(
    id: string,
    nextStatus: VenueStatus,
  ): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({ where: { id } });
    if (!venue) {
      throw new NotFoundException(`Venue ${id} không tồn tại`);
    }
    if (venue.status !== VenueStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Chỉ có thể duyệt/từ chối venue đang chờ duyệt',
      );
    }
    venue.status = nextStatus;
    return this.venuesRepository.save(venue);
  }

  searchPublic(query?: string): Promise<Venue[]> {
    if (!query) {
      return this.venuesRepository.find({
        where: { status: VenueStatus.ACTIVE },
      });
    }
    return this.venuesRepository.find({
      where: [
        { status: VenueStatus.ACTIVE, name: ILike(`%${query}%`) },
        { status: VenueStatus.ACTIVE, address: ILike(`%${query}%`) },
        { status: VenueStatus.ACTIVE, city: ILike(`%${query}%`) },
      ],
    });
  }

  async findPublicById(id: string): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({
      where: { id, status: VenueStatus.ACTIVE },
    });
    if (!venue) {
      throw new NotFoundException(`Venue ${id} không tồn tại`);
    }
    return venue;
  }
}
```

- [ ] **Step 5: Run and confirm pass**

```bash
npx jest venues.service.spec.ts
```
Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/courts/dto/create-venue.dto.ts apps/api/src/courts/dto/update-venue.dto.ts apps/api/src/courts/dto/add-venue-image.dto.ts apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.service.spec.ts
git commit -m "feat(api): add VenuesService with owner/admin/public operations"
```

---

## Task 4: `CourtsService`

**Files:**
- Create: `apps/api/src/courts/dto/create-court.dto.ts`
- Create: `apps/api/src/courts/dto/update-court.dto.ts`
- Create: `apps/api/src/courts/courts.service.ts`
- Create: `apps/api/src/courts/courts.service.spec.ts`

**Interfaces:**
- Consumes: `Court` (Task 1), `VenuesService.getOwnedVenueOrThrow` / `.findPublicById` (Task 3), `generateSlots`, `Slot`, `GenerateSlotsInput` (Task 2), `timeToMinutes`, `TIME_PATTERN` (Task 2)
- Produces (used by Task 6):
  - `CreateCourtDto { name: string; pricePerHour: number; openTime: string; closeTime: string; slotDurationMinutes: number }`
  - `UpdateCourtDto { name?: string; pricePerHour?: number; openTime?: string; closeTime?: string; slotDurationMinutes?: number; isActive?: boolean }`
  - `CourtsService`:
    - `create(ownerId: string, venueId: string, dto: CreateCourtDto): Promise<Court>`
    - `findByVenueForOwner(ownerId: string, venueId: string): Promise<Court[]>`
    - `update(ownerId: string, venueId: string, courtId: string, dto: UpdateCourtDto): Promise<Court>`
    - `findActiveByVenue(venueId: string): Promise<Court[]>`
    - `getSlotsForDate(courtId: string, date: string): Promise<Slot[]>`

- [ ] **Step 1: Create the DTOs**

```typescript
// apps/api/src/courts/dto/create-court.dto.ts
import { IsInt, IsNumber, IsString, Matches, Max, Min, MinLength } from 'class-validator';
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
}
```

```typescript
// apps/api/src/courts/dto/update-court.dto.ts
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
import { TIME_PATTERN } from '../time.util';

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
  @IsBoolean()
  isActive?: boolean;
}
```

- [ ] **Step 2: Write failing tests for `CourtsService`**

```typescript
// apps/api/src/courts/courts.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CourtsService } from './courts.service';
import { Court } from './entities/court.entity';
import { VenuesService } from './venues.service';

const mockCourtsRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
});

const mockVenuesService = () => ({
  getOwnedVenueOrThrow: jest.fn(),
  findPublicById: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CourtsService,
      { provide: getRepositoryToken(Court), useFactory: mockCourtsRepository },
      { provide: VenuesService, useFactory: mockVenuesService },
    ],
  }).compile();

  return {
    service: module.get(CourtsService),
    courtsRepo: module.get(getRepositoryToken(Court)) as ReturnType<
      typeof mockCourtsRepository
    >,
    venuesService: module.get(VenuesService) as ReturnType<
      typeof mockVenuesService
    >,
  };
}

describe('CourtsService.create', () => {
  it('creates a court on an owned venue', async () => {
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
    expect(result.isActive).toBe(true);
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
      isActive: true,
    });
    courtsRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', 'court-1', {
      closeTime: '22:00',
    });

    expect(result.closeTime).toBe('22:00');
    expect(result.openTime).toBe('08:00');
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
  it('queries only active courts for the venue', async () => {
    const { service, courtsRepo } = await buildTestingModule();
    courtsRepo.find.mockResolvedValue([{ id: 'court-1' }]);

    const result = await service.findActiveByVenue('venue-1');

    expect(courtsRepo.find).toHaveBeenCalledWith({
      where: { venueId: 'venue-1', isActive: true },
    });
    expect(result).toEqual([{ id: 'court-1' }]);
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
      isActive: true,
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

  it('throws NotFoundException when the court is missing or inactive', async () => {
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
      isActive: true,
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

- [ ] **Step 3: Run and confirm failure**

```bash
npx jest courts.service.spec.ts
```
Expected: FAIL — `Cannot find module './courts.service'`.

- [ ] **Step 4: Implement `CourtsService`**

```typescript
// apps/api/src/courts/courts.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Court } from './entities/court.entity';
import { VenuesService } from './venues.service';
import { CreateCourtDto } from './dto/create-court.dto';
import { UpdateCourtDto } from './dto/update-court.dto';
import { generateSlots, Slot } from './slot-generator';
import { timeToMinutes } from './time.util';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class CourtsService {
  constructor(
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
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
      isActive: true,
    });
    return this.courtsRepository.save(court);
  }

  async findByVenueForOwner(
    ownerId: string,
    venueId: string,
  ): Promise<Court[]> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    return this.courtsRepository.find({ where: { venueId } });
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
    if (dto.isActive !== undefined) court.isActive = dto.isActive;

    return this.courtsRepository.save(court);
  }

  findActiveByVenue(venueId: string): Promise<Court[]> {
    return this.courtsRepository.find({
      where: { venueId, isActive: true },
    });
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
      where: { id: courtId, isActive: true },
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

- [ ] **Step 5: Run and confirm pass**

```bash
npx jest courts.service.spec.ts
```
Expected: PASS, all tests green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/courts/dto/create-court.dto.ts apps/api/src/courts/dto/update-court.dto.ts apps/api/src/courts/courts.service.ts apps/api/src/courts/courts.service.spec.ts
git commit -m "feat(api): add CourtsService with slot generation"
```

---

## Task 5: `CourtsModule` + `VenuesController` + wire into `AppModule`

**Files:**
- Create: `apps/api/src/courts/venues.controller.ts`
- Create: `apps/api/src/courts/courts.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `VenuesService` (Task 3), `CourtsService` (Task 4, registered as a provider though unused by any controller until Task 6), entities (Task 1), `JwtAuthGuard` (`../auth/guards/jwt-auth.guard`), `RolesGuard` (`../auth/guards/roles.guard`), `Roles` (`../auth/decorators/roles.decorator`), `CurrentUser`/`AuthenticatedUser` (`../auth/decorators/current-user.decorator`), `UserRole` (`../users/entities/user.entity`)
- Produces: `VenuesController` mounted at `/venues` with routes `POST /venues`, `GET /venues/mine`, `GET /venues/mine/:id`, `PATCH /venues/mine/:id`, `POST /venues/mine/:id/images`, `DELETE /venues/mine/:id/images/:imageId`, `GET /venues` (public search). `CourtsModule` exporting `VenuesService`, `CourtsService`.

**Important:** route declaration order inside `VenuesController` matters. `mine`/`mine/:id` routes must be declared before any catch-all `:id` route (added in Task 6), otherwise `GET /venues/mine` would be captured by `findOne(':id')` with `id = 'mine'`. This task doesn't yet add the public `GET /venues/:id` route (that comes in Task 6 alongside `CourtsService` wiring), so there's no ordering hazard yet — but preserve the method order below when Task 6 appends to this file.

- [ ] **Step 1: Create `VenuesController`**

```typescript
// apps/api/src/courts/venues.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { VenuesService } from './venues.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { AddVenueImageDto } from './dto/add-venue-image.dto';

@Controller('venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVenueDto) {
    return this.venuesService.create(user.userId, dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.venuesService.findMineByOwner(user.userId);
  }

  @Get('mine/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  findMineById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.venuesService.findMineById(user.userId, id);
  }

  @Patch('mine/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVenueDto,
  ) {
    return this.venuesService.update(user.userId, id, dto);
  }

  @Post('mine/:id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  addImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddVenueImageDto,
  ) {
    return this.venuesService.addImage(user.userId, id, dto);
  }

  @Delete('mine/:id/images/:imageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  removeImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.venuesService.removeImage(user.userId, id, imageId);
  }

  @Get()
  search(@Query('query') query?: string) {
    return this.venuesService.searchPublic(query);
  }
}
```

- [ ] **Step 2: Create `CourtsModule`**

```typescript
// apps/api/src/courts/courts.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Venue } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';
import { Court } from './entities/court.entity';
import { VenuesService } from './venues.service';
import { CourtsService } from './courts.service';
import { VenuesController } from './venues.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Venue, VenueImage, Court])],
  controllers: [VenuesController],
  providers: [VenuesService, CourtsService],
  exports: [VenuesService, CourtsService],
})
export class CourtsModule {}
```

- [ ] **Step 3: Register `CourtsModule` in `AppModule`**

In `apps/api/src/app.module.ts`, add the import and the module entry:

```typescript
import { CourtsModule } from './courts/courts.module';
```

```typescript
    UsersModule,
    MailModule,
    AuthModule,
    AdminModule,
    CourtsModule,
```

- [ ] **Step 4: Confirm the project builds**

```bash
npm run build
```
Expected: exits 0, no TypeScript errors.

- [ ] **Step 5: Manual smoke test**

In one terminal:
```bash
npm run start:dev
```
Wait for `Nest application successfully started`. In another terminal:
```bash
curl -i http://localhost:3001/venues
```
Expected: `HTTP/1.1 200 OK` with body `[]` (no venues yet).

```bash
curl -i -X POST http://localhost:3001/venues -H "Content-Type: application/json" -d "{\"name\":\"Test\",\"address\":\"Test\",\"city\":\"Test\"}"
```
Expected: `HTTP/1.1 401 Unauthorized` (no JWT provided — the owner-only route is guarded).

Stop the dev server (`Ctrl+C`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/courts/venues.controller.ts apps/api/src/courts/courts.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): wire up CourtsModule and expose venue owner/public routes"
```

---

## Task 6: `CourtsController` + combined venue detail

**Files:**
- Create: `apps/api/src/courts/courts.controller.ts`
- Modify: `apps/api/src/courts/venues.controller.ts`
- Modify: `apps/api/src/courts/courts.module.ts`

**Interfaces:**
- Consumes: `CourtsService` (Task 4), `VenuesService` (Task 3), same auth guards/decorators as Task 5
- Produces: `CourtsController` with routes `POST /venues/mine/:venueId/courts`, `GET /venues/mine/:venueId/courts`, `PATCH /venues/mine/:venueId/courts/:id`, `GET /courts/:id/slots?date=YYYY-MM-DD`. `VenuesController` gains `GET /venues/:id` returning the venue plus its active courts.

- [ ] **Step 1: Create `CourtsController`**

```typescript
// apps/api/src/courts/courts.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { CourtsService } from './courts.service';
import { CreateCourtDto } from './dto/create-court.dto';
import { UpdateCourtDto } from './dto/update-court.dto';

@Controller()
export class CourtsController {
  constructor(private readonly courtsService: CourtsService) {}

  @Post('venues/mine/:venueId/courts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Body() dto: CreateCourtDto,
  ) {
    return this.courtsService.create(user.userId, venueId, dto);
  }

  @Get('venues/mine/:venueId/courts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
  ) {
    return this.courtsService.findByVenueForOwner(user.userId, venueId);
  }

  @Patch('venues/mine/:venueId/courts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCourtDto,
  ) {
    return this.courtsService.update(user.userId, venueId, id, dto);
  }

  @Get('courts/:id/slots')
  getSlots(@Param('id') id: string, @Query('date') date: string) {
    return this.courtsService.getSlotsForDate(id, date);
  }
}
```

- [ ] **Step 2: Add the public venue detail route to `VenuesController`**

Modify `apps/api/src/courts/venues.controller.ts`:

Add `CourtsService` to the imports:
```typescript
import { CourtsService } from './courts.service';
```

Update the constructor:
```typescript
  constructor(
    private readonly venuesService: VenuesService,
    private readonly courtsService: CourtsService,
  ) {}
```

Add this method **after** `search()` (so it stays after all the `mine`-prefixed routes — see the route-ordering note in Task 5):
```typescript
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const venue = await this.venuesService.findPublicById(id);
    const courts = await this.courtsService.findActiveByVenue(id);
    return { ...venue, courts };
  }
```

- [ ] **Step 3: Register `CourtsController` in `CourtsModule`**

Modify `apps/api/src/courts/courts.module.ts`:

```typescript
import { CourtsController } from './courts.controller';
```

```typescript
  controllers: [VenuesController, CourtsController],
```

- [ ] **Step 4: Confirm the project builds**

```bash
npm run build
```
Expected: exits 0, no TypeScript errors.

- [ ] **Step 5: Manual smoke test**

```bash
npm run start:dev
```
In another terminal:
```bash
curl -i http://localhost:3001/venues/00000000-0000-0000-0000-000000000000
```
Expected: `HTTP/1.1 404 Not Found` (venue doesn't exist).

```bash
curl -i "http://localhost:3001/courts/00000000-0000-0000-0000-000000000000/slots?date=2026-08-25"
```
Expected: `HTTP/1.1 404 Not Found`.

```bash
curl -i "http://localhost:3001/courts/00000000-0000-0000-0000-000000000000/slots?date=not-a-date"
```
Expected: `HTTP/1.1 400 Bad Request`.

Stop the dev server (`Ctrl+C`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/courts/courts.controller.ts apps/api/src/courts/venues.controller.ts apps/api/src/courts/courts.module.ts
git commit -m "feat(api): add CourtsController and combined public venue detail"
```

---

## Task 7: Admin venue approval

**Files:**
- Create: `apps/api/src/admin/admin-venues.controller.ts`
- Modify: `apps/api/src/admin/admin.module.ts`

**Interfaces:**
- Consumes: `VenuesService.findPendingVenues` / `.approveVenue` / `.rejectVenue` (Task 3), `JwtAuthGuard`, `RolesGuard`, `Roles`, `UserRole.ADMIN`
- Produces: `GET /admin/venues/pending`, `POST /admin/venues/:id/approve`, `POST /admin/venues/:id/reject`

- [ ] **Step 1: Create `AdminVenuesController`**

```typescript
// apps/api/src/admin/admin-venues.controller.ts
import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { VenuesService } from '../courts/venues.service';

@Controller('admin/venues')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminVenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get('pending')
  findPending() {
    return this.venuesService.findPendingVenues();
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.venuesService.approveVenue(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.venuesService.rejectVenue(id);
  }
}
```

- [ ] **Step 2: Wire it into `AdminModule`**

Replace the contents of `apps/api/src/admin/admin.module.ts`:

```typescript
// apps/api/src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CourtsModule } from '../courts/courts.module';
import { AdminController } from './admin.controller';
import { AdminVenuesController } from './admin-venues.controller';

@Module({
  imports: [UsersModule, CourtsModule],
  controllers: [AdminController, AdminVenuesController],
})
export class AdminModule {}
```

- [ ] **Step 3: Confirm the project builds**

```bash
npm run build
```
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Run the full test suite**

```bash
npm test
```
Expected: all suites pass, including every `*.service.spec.ts` file added in this plan.

- [ ] **Step 5: Manual smoke test**

```bash
npm run start:dev
```
In another terminal:
```bash
curl -i http://localhost:3001/admin/venues/pending
```
Expected: `HTTP/1.1 401 Unauthorized` (no JWT — admin-only route is guarded, same as the existing `/admin/owners/pending`).

Stop the dev server (`Ctrl+C`).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/admin/admin-venues.controller.ts apps/api/src/admin/admin.module.ts
git commit -m "feat(api): add admin venue approval endpoints"
```
