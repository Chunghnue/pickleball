# Branches Module Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `venues` table and `VenuesService`/`VenuesController` so an owner can manage branches per [2026-08-26-branches-design.md](../specs/2026-08-26-branches-design.md): public slug, district, coordinates, contact email, hide-from-public, set-as-default, and delete-with-history-guard — unblocking the frontend plan derived from [2026-09-02-branches-frontend-design.md](../specs/2026-09-02-branches-frontend-design.md).

**Architecture:** No new module — `venues` already belongs to `CourtsModule`/`VenuesService`/`VenuesController` (per the spec's explicit decision not to split out a separate "Branches" module). Add columns to `venues`, a small `venue_slug_history` table for the slug rate-limit, and extend the existing service/controller/DTOs in place. Slug generation and the 180-day/60-day rate limit live in `VenuesService`; the per-venue quick-stats (courts/bookings/revenue this month) reuse the same SQL patterns already used by `DashboardService`.

**Tech Stack:** NestJS 11, TypeORM 1.1 (raw-SQL migrations, no `synchronize`), class-validator, Jest (unit specs mocked-repo style + e2e specs against a real `pickleball_test` Postgres DB via Supertest).

## Global Constraints

- `slug`: lowercase letters/digits/hyphens only (`^[a-z0-9]+(-[a-z0-9]+)*$`), unique system-wide. Empty/omitted on create → auto-generate from `name` (Vietnamese-aware slugify); collision while auto-generating → append a random 4-digit numeric suffix and retry. An explicit, owner-supplied slug that collides → `409`, never auto-suffixed (spec §8).
- `slug` change limit (spec §6): reject (`400`) the 4th change within a trailing 180-day window; reject (`400`) any change made less than 60 days after the previous change. The venue's very first auto-generated slug (at creation) never counts as a "change".
- `is_hidden` is independent of `status` (admin approval). A venue with `is_hidden = true`, or `status != active`, must 404 on every **public** read (`GET /venues`, `GET /venues/:id`, `GET /venues/by-slug/:slug`) — spec §2.
- `DELETE /venues/mine/:id` is blocked (`409`) if **any** booking, in any status, ever existed for any court of that venue (spec §5). Otherwise hard-delete cascades `pricing_rules`, `court_images`, `courts`, `venue_images`, `venue_slug_history`, then the venue itself. (Spec §5 also mentions a `venue_operating_hours` table — no such table exists anywhere in this codebase; per-court open/close times already live on `courts`, so this plan does not create or touch anything by that name.)
- Deleting the default venue promotes the **oldest remaining** venue (by `created_at`) of that owner to default; if none remain, there is simply no default (spec §4).
- No new npm dependencies — slugify is hand-rolled (~10 lines), no library needed.
- Every task must leave `npm test` (from `apps/api`) green. Tasks that touch e2e-covered surface must also leave `npm run test:e2e` green — run it at minimum after Task 1 (migration) and again at the end (Task 10).
- **"Lượt xem 7D" (spec §7) is explicitly out of scope for this plan.** The spec cites it as reusing an already-built `GET /analytics/page-views/summary` from [page-view-analytics-design.md](../specs/2026-08-26-page-view-analytics-design.md), but that module was never implemented — there is no `page-views`/`analytics`/`PageView` anything anywhere in `apps/api/src`. This plan only produces `courtsCount`/`bookingsThisMonth`/`revenueThisMonth` (Task 8); a Page View Analytics backend plan is a separate prerequisite before the frontend plan can wire up that one stat.

---

## File Structure

**New files:**
- `apps/api/src/migrations/1787940000000-AddBranchFieldsToVenues.ts` — schema migration
- `apps/api/src/courts/entities/venue-slug-history.entity.ts` — `VenueSlugHistory` entity
- `apps/api/src/courts/slug.util.ts` — `slugify()`, `SLUG_PATTERN`
- `apps/api/src/courts/slug.util.spec.ts`
- `apps/api/src/courts/dto/list-venues.dto.ts` — `ListVenuesDto` (query params for `GET /venues/mine`)
- `apps/api/test/venues-branches.e2e-spec.ts`

**Modified files:**
- `apps/api/src/courts/entities/venue.entity.ts` — `slug`, `district`, `latitude`, `longitude`, `email`, `isHidden` columns
- `apps/api/src/courts/courts.module.ts` — register `VenueSlugHistory` in `TypeOrmModule.forFeature`
- `apps/api/src/courts/dto/create-venue.dto.ts` — `slug?`, `district?`, `latitude?`, `longitude?`, `email?`
- `apps/api/src/courts/dto/update-venue.dto.ts` — same fields + `isHidden?`
- `apps/api/src/courts/venues.service.ts` — slug generation/rate-limit, `setDefault`, `remove`, `findMineWithMetrics`, `findPublicBySlug`, `isHidden` filtering on existing public reads
- `apps/api/src/courts/venues.service.spec.ts` — new/updated unit tests for all of the above
- `apps/api/src/courts/venues.controller.ts` — `POST mine/:id/set-default`, `DELETE mine/:id`, `GET by-slug/:slug`, `GET mine` now takes `ListVenuesDto`

---

### Task 1: Migration — branch fields on `venues` + `venue_slug_history`

**Files:**
- Create: `apps/api/src/migrations/1787940000000-AddBranchFieldsToVenues.ts`

**Interfaces:**
- Produces: `venues.slug` (nullable varchar, partial unique index), `venues.district`/`.email` (nullable varchar), `venues.latitude`/`.longitude` (nullable double precision), `venues.is_hidden` (boolean not null default false), table `venue_slug_history(id, venue_id, old_slug, changed_at)` — consumed by the entity in Task 2.

- [ ] **Step 1: Write the migration**

`slug` is left **nullable** at the DB level (partial unique index, `WHERE "slug" IS NOT NULL` — the same technique already used for `users.email`/`users.phone` in `1787930000000-AddStaffSupportToUsers.ts`). This means no backfill is needed: existing rows (including everything inserted directly by test fixtures, bypassing `VenuesService.create`) simply keep `slug = NULL` and are unaffected. Every venue created through the real API from Task 4 onward always gets a non-null slug from the service layer.

Create `apps/api/src/migrations/1787940000000-AddBranchFieldsToVenues.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBranchFieldsToVenues1787940000000
  implements MigrationInterface
{
  name = 'AddBranchFieldsToVenues1787940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "venues" ADD "slug" character varying`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "venues_slug_unique_idx" ON "venues" ("slug") WHERE "slug" IS NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "venues" ADD "district" character varying`);
    await queryRunner.query(`ALTER TABLE "venues" ADD "latitude" double precision`);
    await queryRunner.query(`ALTER TABLE "venues" ADD "longitude" double precision`);
    await queryRunner.query(`ALTER TABLE "venues" ADD "email" character varying`);
    await queryRunner.query(
      `ALTER TABLE "venues" ADD "is_hidden" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(
      `CREATE TABLE "venue_slug_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venue_id" character varying NOT NULL, "old_slug" character varying, "changed_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_venue_slug_history_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_venue_slug_history_venue_id" ON "venue_slug_history" ("venue_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_venue_slug_history_venue_id"`);
    await queryRunner.query(`DROP TABLE "venue_slug_history"`);
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "is_hidden"`);
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "email"`);
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "longitude"`);
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "latitude"`);
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "district"`);
    await queryRunner.query(`DROP INDEX "public"."venues_slug_unique_idx"`);
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "slug"`);
  }
}
```

- [ ] **Step 2: Run the migration against the dev database**

Run (from `apps/api`): `npm run migration:run`
Expected: output lists `AddBranchFieldsToVenues1787940000000` as applied.
Verify: `npx typeorm-ts-node-commonjs -d src/config/data-source.ts migration:show` — the new migration shows `[X]`.

- [ ] **Step 3: Confirm the existing suite is unaffected**

Run (from `apps/api`): `npm test && npm run test:e2e`
Expected: both pass unchanged (new nullable columns/table don't affect any existing code path yet).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/migrations/1787940000000-AddBranchFieldsToVenues.ts
git commit -m "feat(api): add slug, district, coordinates, email, is_hidden to venues"
```

---

### Task 2: Entities — `Venue` gets branch fields, new `VenueSlugHistory`

**Files:**
- Modify: `apps/api/src/courts/entities/venue.entity.ts`
- Create: `apps/api/src/courts/entities/venue-slug-history.entity.ts`
- Modify: `apps/api/src/courts/courts.module.ts`

**Interfaces:**
- Produces: `Venue.slug: string | null`, `Venue.district: string | null`, `Venue.latitude: number | null`, `Venue.longitude: number | null`, `Venue.email: string | null`, `Venue.isHidden: boolean`; `VenueSlugHistory { id, venueId, oldSlug, changedAt }` — consumed by Tasks 3–9.

- [ ] **Step 1: Add the new columns to `Venue`**

In `apps/api/src/courts/entities/venue.entity.ts`, add after the existing `phone` column (before `createdAt`):

```ts
  @Column({ nullable: true, type: 'varchar' })
  slug: string | null;

  @Column({ nullable: true, type: 'varchar' })
  district: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  @Column({ nullable: true, type: 'varchar' })
  email: string | null;

  @Column({ name: 'is_hidden', default: false })
  isHidden: boolean;
```

- [ ] **Step 2: Create the `VenueSlugHistory` entity**

Create `apps/api/src/courts/entities/venue-slug-history.entity.ts`:

```ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('venue_slug_history')
export class VenueSlugHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'venue_id' })
  venueId: string;

  @Column({ name: 'old_slug', nullable: true, type: 'varchar' })
  oldSlug: string | null;

  @CreateDateColumn({ name: 'changed_at' })
  changedAt: Date;
}
```

- [ ] **Step 3: Register the new entity in `CourtsModule`**

In `apps/api/src/courts/courts.module.ts`, add the import and include it in `forFeature`:

```ts
import { VenueSlugHistory } from './entities/venue-slug-history.entity';
```

```ts
    TypeOrmModule.forFeature([Venue, VenueImage, Court, CourtImage, Booking, VenueSlugHistory]),
```

- [ ] **Step 4: Type-check and run the existing suite**

Run (from `apps/api`): `npx tsc --noEmit -p . && npm test`
Expected: both exit 0 — new nullable/defaulted columns don't change any existing behavior or test expectation.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/courts/entities/venue.entity.ts apps/api/src/courts/entities/venue-slug-history.entity.ts apps/api/src/courts/courts.module.ts
git commit -m "feat(api): add branch fields to Venue entity, add VenueSlugHistory entity"
```

---

### Task 3: `slug.util.ts` — Vietnamese-aware slugify

**Files:**
- Create: `apps/api/src/courts/slug.util.ts`
- Test: `apps/api/src/courts/slug.util.spec.ts`

**Interfaces:**
- Produces: `slugify(input: string): string`, `SLUG_PATTERN: RegExp` — consumed by Task 4/5 DTOs and `VenuesService`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/courts/slug.util.spec.ts`:

```ts
import { slugify } from './slug.util';

describe('slugify', () => {
  it('lowercases and hyphenates a plain ASCII name', () => {
    expect(slugify('ABC Pickleball Club')).toBe('abc-pickleball-club');
  });

  it('strips Vietnamese diacritics, including đ', () => {
    expect(slugify('Sân Đình Văn Chung')).toBe('san-dinh-van-chung');
  });

  it('collapses repeated separators and trims leading/trailing hyphens', () => {
    expect(slugify('  Quận 1 -- Chi nhánh!!  ')).toBe('quan-1-chi-nhanh');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest slug.util --config apps/api/package.json` (or `cd apps/api && npx jest slug.util`)
Expected: FAIL — `Cannot find module './slug.util'`.

- [ ] **Step 3: Implement `slugify` and `SLUG_PATTERN`**

Create `apps/api/src/courts/slug.util.ts`:

```ts
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const COMBINING_MARK_MIN = 0x0300;
const COMBINING_MARK_MAX = 0x036f;

export function slugify(input: string): string {
  const withoutCombiningMarks = Array.from(input.normalize('NFD'))
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < COMBINING_MARK_MIN || code > COMBINING_MARK_MAX;
    })
    .join('');
  return withoutCombiningMarks
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest slug.util`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/courts/slug.util.ts apps/api/src/courts/slug.util.spec.ts
git commit -m "feat(api): add Vietnamese-aware slugify util"
```

---

### Task 4: `CreateVenueDto` + `VenuesService.create` — slug generation, new fields

**Files:**
- Modify: `apps/api/src/courts/dto/create-venue.dto.ts`
- Modify: `apps/api/src/courts/venues.service.ts`
- Test: `apps/api/src/courts/venues.service.spec.ts`

**Interfaces:**
- Consumes: `slugify`, `SLUG_PATTERN` (Task 3).
- Produces: `VenuesService.create` now sets `slug`/`district`/`latitude`/`longitude`/`email` — consumed by Task 5 (`update` reuses the same slug-uniqueness check) and Task 8 (list response includes these fields).

- [ ] **Step 1: Extend `CreateVenueDto`**

Replace `apps/api/src/courts/dto/create-venue.dto.ts`:

```ts
import { IsEmail, IsNumber, IsOptional, IsString, Matches, Max, Min, MinLength, ValidateIf } from 'class-validator';
import { SLUG_PATTERN } from '../slug.util';

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

  @ValidateIf((o) => !!o.slug)
  @IsString()
  @Matches(SLUG_PATTERN, {
    message: 'Đường dẫn chỉ được chứa chữ thường, số và dấu gạch ngang',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @ValidateIf((o) => o.latitude !== undefined)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ValidateIf((o) => o.longitude !== undefined)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsEmail()
  email?: string;
}
```

- [ ] **Step 2: Write the failing tests**

In `apps/api/src/courts/venues.service.spec.ts`, add these `describe` blocks after the existing `describe('VenuesService.create — isDefault', ...)` block:

```ts
describe('VenuesService.create — slug', () => {
  it('generates a slug from the name when not provided', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);
    venuesRepo.findOne.mockResolvedValue(null);
    venuesRepo.create.mockImplementation((data) => data);
    venuesRepo.save.mockImplementation((data) => Promise.resolve({ id: 'venue-1', ...data }));

    const result = await service.create('owner-1', {
      name: 'Sân Đình Văn Chung',
      address: '123 Le Loi',
      city: 'Ho Chi Minh',
    });

    expect(result.slug).toBe('san-dinh-van-chung');
  });

  it('appends a random 4-digit suffix when the generated slug is taken', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);
    venuesRepo.findOne
      .mockResolvedValueOnce({ id: 'other-venue', slug: 'abc-pickleball' })
      .mockResolvedValueOnce(null);
    venuesRepo.create.mockImplementation((data) => data);
    venuesRepo.save.mockImplementation((data) => Promise.resolve({ id: 'venue-2', ...data }));

    const result = await service.create('owner-1', {
      name: 'ABC Pickleball',
      address: '123 Le Loi',
      city: 'Ho Chi Minh',
    });

    expect(result.slug).toMatch(/^abc-pickleball-\d{4}$/);
  });

  it('uses the requested slug when provided and available', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);
    venuesRepo.findOne.mockResolvedValue(null);
    venuesRepo.create.mockImplementation((data) => data);
    venuesRepo.save.mockImplementation((data) => Promise.resolve({ id: 'venue-1', ...data }));

    const result = await service.create('owner-1', {
      name: 'ABC Pickleball',
      address: '123 Le Loi',
      city: 'Ho Chi Minh',
      slug: 'my-custom-slug',
    });

    expect(result.slug).toBe('my-custom-slug');
  });

  it('throws ConflictException when the requested slug is already taken', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);
    venuesRepo.findOne.mockResolvedValue({ id: 'other-venue', slug: 'taken-slug' });

    await expect(
      service.create('owner-1', {
        name: 'ABC Pickleball',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        slug: 'taken-slug',
      }),
    ).rejects.toThrow('Đường dẫn này đã được sử dụng');
  });

  it('sets district/latitude/longitude/email when provided, null otherwise', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);
    venuesRepo.findOne.mockResolvedValue(null);
    venuesRepo.create.mockImplementation((data) => data);
    venuesRepo.save.mockImplementation((data) => Promise.resolve({ id: 'venue-1', ...data }));

    const withFields = await service.create('owner-1', {
      name: 'ABC Pickleball',
      address: '123 Le Loi',
      city: 'Ho Chi Minh',
      district: 'Quan 1',
      latitude: 10.77,
      longitude: 106.7,
      email: 'branch@test.com',
    });
    expect(withFields.district).toBe('Quan 1');
    expect(withFields.latitude).toBe(10.77);
    expect(withFields.longitude).toBe(106.7);
    expect(withFields.email).toBe('branch@test.com');

    const withoutFields = await service.create('owner-1', {
      name: 'XYZ Pickleball',
      address: '456 Le Loi',
      city: 'Ho Chi Minh',
    });
    expect(withoutFields.district).toBeNull();
    expect(withoutFields.latitude).toBeNull();
    expect(withoutFields.longitude).toBeNull();
    expect(withoutFields.email).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/api && npx jest venues.service`
Expected: FAIL — `result.slug` is `undefined`, `TypeError` or similar (`create` doesn't set `slug`/`district`/etc. yet).

- [ ] **Step 4: Implement slug generation in `VenuesService`**

In `apps/api/src/courts/venues.service.ts`, update the imports:

```ts
import {
  BadRequestException,
  ConflictException,
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
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { slugify } from './slug.util';
```

Replace the `create` method and add the two new private helpers right after it:

```ts
  async create(ownerId: string, dto: CreateVenueDto): Promise<Venue> {
    const existingCount = await this.venuesRepository.count({ where: { ownerId } });
    const slug = await this.resolveSlugForCreate(dto.slug, dto.name);
    const venue = this.venuesRepository.create({
      ownerId,
      name: dto.name,
      address: dto.address,
      city: dto.city,
      district: dto.district ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      email: dto.email ?? null,
      description: dto.description ?? null,
      status: VenueStatus.PENDING_APPROVAL,
      isDefault: existingCount === 0,
      slug,
    });
    return this.venuesRepository.save(venue);
  }

  private async resolveSlugForCreate(
    requested: string | undefined,
    name: string,
  ): Promise<string> {
    const trimmed = requested?.trim();
    if (trimmed) {
      const taken = await this.venuesRepository.findOne({ where: { slug: trimmed } });
      if (taken) {
        throw new ConflictException('Đường dẫn này đã được sử dụng');
      }
      return trimmed;
    }
    return this.generateUniqueSlug(name);
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    for (let attempt = 0; attempt < 20; attempt++) {
      const taken = await this.venuesRepository.findOne({ where: { slug: candidate } });
      if (!taken) {
        return candidate;
      }
      const suffix = Math.floor(1000 + Math.random() * 9000);
      candidate = `${base}-${suffix}`;
    }
    throw new ConflictException('Không thể tạo đường dẫn duy nhất, vui lòng thử lại');
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx jest venues.service`
Expected: PASS (all `VenuesService` tests, including the 5 new ones).

- [ ] **Step 6: Type-check**

Run (from `apps/api`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/courts/dto/create-venue.dto.ts apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.service.spec.ts
git commit -m "feat(api): generate/validate venue slug and accept district/coordinates/email on create"
```

---

### Task 5: `UpdateVenueDto` + `VenuesService.update` — slug change rate limit, `isHidden`

**Files:**
- Modify: `apps/api/src/courts/dto/update-venue.dto.ts`
- Modify: `apps/api/src/courts/venues.service.ts`
- Test: `apps/api/src/courts/venues.service.spec.ts`

**Interfaces:**
- Consumes: `VenueSlugHistory` entity (Task 2), `SLUG_PATTERN` (Task 3).
- Produces: `VenuesService.update` now accepts `slug?/district?/latitude?/longitude?/email?/isHidden?` and enforces the 180-day/60-day slug limit.

- [ ] **Step 1: Extend `UpdateVenueDto`**

Replace `apps/api/src/courts/dto/update-venue.dto.ts`:

```ts
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SLUG_PATTERN } from '../slug.util';

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

  @IsOptional()
  @IsString()
  phone?: string;

  @ValidateIf((o) => !!o.slug)
  @IsString()
  @Matches(SLUG_PATTERN, {
    message: 'Đường dẫn chỉ được chứa chữ thường, số và dấu gạch ngang',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @ValidateIf((o) => o.latitude !== undefined)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ValidateIf((o) => o.longitude !== undefined)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;
}
```

- [ ] **Step 2: Write the failing tests**

In `apps/api/src/courts/venues.service.spec.ts`, add `slugHistoryRepo: jest.fn()`-style mock and `DataSource` to the shared test harness. Replace the mock factories and `buildTestingModule` at the top of the file with:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { VenuesService } from './venues.service';
import { Venue, VenueStatus } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';
import { VenueSlugHistory } from './entities/venue-slug-history.entity';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

const mockVenuesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
});

const mockVenueImagesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  find: jest.fn(),
});

const mockSlugHistoryRepository = () => ({
  count: jest.fn(),
  findOne: jest.fn(),
});

const mockUsersService = () => ({
  findById: jest.fn(),
});

const mockNotificationsService = () => ({
  notifyVenueApproved: jest.fn().mockResolvedValue(undefined),
  notifyVenueRejected: jest.fn().mockResolvedValue(undefined),
});

const mockDataSource = () => ({
  transaction: jest.fn(),
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
      {
        provide: getRepositoryToken(VenueSlugHistory),
        useFactory: mockSlugHistoryRepository,
      },
      { provide: UsersService, useFactory: mockUsersService },
      { provide: NotificationsService, useFactory: mockNotificationsService },
      { provide: DataSource, useFactory: mockDataSource },
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
    slugHistoryRepo: module.get(getRepositoryToken(VenueSlugHistory)) as ReturnType<
      typeof mockSlugHistoryRepository
    >,
    usersService: module.get(UsersService) as ReturnType<
      typeof mockUsersService
    >,
    notificationsService: module.get(NotificationsService) as ReturnType<
      typeof mockNotificationsService
    >,
    dataSource: module.get(DataSource) as ReturnType<typeof mockDataSource>,
  };
}
```

(This replaces the existing top-of-file mock setup 1:1 — same exports, three additions: the `VenueSlugHistory`/`DataSource` imports, the `mockSlugHistoryRepository`/`mockDataSource` factories, and their entries in `providers`/the returned object.)

Then add this `describe` block after `describe('VenuesService.update', ...)`:

```ts
describe('VenuesService.update — district/coordinates/email/isHidden', () => {
  it('sets district/latitude/longitude/email/isHidden when provided', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      slug: 'venue-1-slug',
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', {
      district: 'Quan 1',
      latitude: 10.77,
      longitude: 106.7,
      email: 'branch@test.com',
      isHidden: true,
    });

    expect(result.district).toBe('Quan 1');
    expect(result.latitude).toBe(10.77);
    expect(result.longitude).toBe(106.7);
    expect(result.email).toBe('branch@test.com');
    expect(result.isHidden).toBe(true);
  });
});

describe('VenuesService.update — slug', () => {
  const FIXED_NOW = new Date('2026-09-02T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('changes the slug and records history when available and under the limit', async () => {
    const { service, venuesRepo, slugHistoryRepo, dataSource } = await buildTestingModule();
    venuesRepo.findOne
      .mockResolvedValueOnce({
        id: 'venue-1',
        ownerId: 'owner-1',
        slug: 'old-slug',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      })
      .mockResolvedValueOnce(null);
    slugHistoryRepo.count.mockResolvedValue(0);
    slugHistoryRepo.findOne.mockResolvedValue(null);
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));
    const manager = { insert: jest.fn().mockResolvedValue(undefined) };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.update('owner-1', 'venue-1', { slug: 'new-slug' });

    expect(result.slug).toBe('new-slug');
    expect(manager.insert).toHaveBeenCalledWith(VenueSlugHistory, {
      venueId: 'venue-1',
      oldSlug: 'old-slug',
    });
  });

  it('does nothing slug-related when the slug is unchanged', async () => {
    const { service, venuesRepo, slugHistoryRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      slug: 'same-slug',
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    await service.update('owner-1', 'venue-1', { slug: 'same-slug' });

    expect(slugHistoryRepo.count).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the new slug is already used by another venue', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne
      .mockResolvedValueOnce({ id: 'venue-1', ownerId: 'owner-1', slug: 'old-slug' })
      .mockResolvedValueOnce({ id: 'venue-2', slug: 'taken-slug' });

    await expect(
      service.update('owner-1', 'venue-1', { slug: 'taken-slug' }),
    ).rejects.toThrow('Đường dẫn này đã được sử dụng');
  });

  it('throws BadRequestException at 3 changes already within the last 180 days', async () => {
    const { service, venuesRepo, slugHistoryRepo } = await buildTestingModule();
    venuesRepo.findOne
      .mockResolvedValueOnce({ id: 'venue-1', ownerId: 'owner-1', slug: 'old-slug' })
      .mockResolvedValueOnce(null);
    slugHistoryRepo.count.mockResolvedValue(3);

    await expect(
      service.update('owner-1', 'venue-1', { slug: 'new-slug' }),
    ).rejects.toThrow('Đã đạt giới hạn đổi đường dẫn (3 lần/180 ngày)');
  });

  it('throws BadRequestException when the last change was under 60 days ago', async () => {
    const { service, venuesRepo, slugHistoryRepo } = await buildTestingModule();
    venuesRepo.findOne
      .mockResolvedValueOnce({ id: 'venue-1', ownerId: 'owner-1', slug: 'old-slug' })
      .mockResolvedValueOnce(null);
    slugHistoryRepo.count.mockResolvedValue(1);
    slugHistoryRepo.findOne.mockResolvedValue({
      changedAt: new Date('2026-08-20T00:00:00Z'),
    });

    await expect(
      service.update('owner-1', 'venue-1', { slug: 'new-slug' }),
    ).rejects.toThrow('Cần đợi đủ 60 ngày kể từ lần đổi trước');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/api && npx jest venues.service`
Expected: FAIL — compile error (`VenueSlugHistory`/`DataSource` not injected yet) or `result.district`/`result.slug` undefined.

- [ ] **Step 4: Implement in `VenuesService`**

Update the imports at the top of `apps/api/src/courts/venues.service.ts` — add:

```ts
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, MoreThanOrEqual, Repository } from 'typeorm';
import { VenueSlugHistory } from './entities/venue-slug-history.entity';
```

Update the constructor:

```ts
  constructor(
    @InjectRepository(Venue)
    private readonly venuesRepository: Repository<Venue>,
    @InjectRepository(VenueImage)
    private readonly venueImagesRepository: Repository<VenueImage>,
    @InjectRepository(VenueSlugHistory)
    private readonly slugHistoryRepository: Repository<VenueSlugHistory>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}
```

Replace the `update` method and add `changeSlug` right after it:

```ts
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
    if (dto.cancellationCutoffHours !== undefined) {
      venue.cancellationCutoffHours = dto.cancellationCutoffHours;
    }
    if (dto.phone !== undefined) venue.phone = dto.phone;
    if (dto.district !== undefined) venue.district = dto.district;
    if (dto.latitude !== undefined) venue.latitude = dto.latitude;
    if (dto.longitude !== undefined) venue.longitude = dto.longitude;
    if (dto.email !== undefined) venue.email = dto.email;
    if (dto.isHidden !== undefined) venue.isHidden = dto.isHidden;
    if (dto.slug !== undefined && dto.slug !== venue.slug) {
      await this.changeSlug(venue, dto.slug);
    }
    return this.venuesRepository.save(venue);
  }

  private async changeSlug(venue: Venue, nextSlug: string): Promise<void> {
    const taken = await this.venuesRepository.findOne({ where: { slug: nextSlug } });
    if (taken && taken.id !== venue.id) {
      throw new ConflictException('Đường dẫn này đã được sử dụng');
    }

    const cutoff180 = new Date();
    cutoff180.setDate(cutoff180.getDate() - 180);
    const recentChangeCount = await this.slugHistoryRepository.count({
      where: { venueId: venue.id, changedAt: MoreThanOrEqual(cutoff180) },
    });
    if (recentChangeCount >= 3) {
      throw new BadRequestException('Đã đạt giới hạn đổi đường dẫn (3 lần/180 ngày)');
    }

    const lastChange = await this.slugHistoryRepository.findOne({
      where: { venueId: venue.id },
      order: { changedAt: 'DESC' },
    });
    const lastChangeAt = lastChange?.changedAt ?? venue.updatedAt;
    const cutoff60 = new Date();
    cutoff60.setDate(cutoff60.getDate() - 60);
    if (lastChangeAt > cutoff60) {
      throw new BadRequestException('Cần đợi đủ 60 ngày kể từ lần đổi trước');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.insert(VenueSlugHistory, {
        venueId: venue.id,
        oldSlug: venue.slug,
      });
    });
    venue.slug = nextSlug;
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx jest venues.service`
Expected: PASS (all tests, including the 7 new ones).

- [ ] **Step 6: Type-check**

Run (from `apps/api`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/courts/dto/update-venue.dto.ts apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.service.spec.ts
git commit -m "feat(api): enforce slug change rate limit, accept district/coordinates/email/isHidden on update"
```

---

### Task 6: `POST /venues/mine/:id/set-default`

**Files:**
- Modify: `apps/api/src/courts/venues.service.ts`
- Modify: `apps/api/src/courts/venues.controller.ts`
- Test: `apps/api/src/courts/venues.service.spec.ts`

**Interfaces:**
- Consumes: `DataSource` (already injected in Task 5).
- Produces: `VenuesService.setDefault(ownerId, id): Promise<Venue>` — consumed by the controller and by Task 7's e2e default-reassignment test.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/courts/venues.service.spec.ts`, add after `describe('VenuesService.update — slug', ...)`:

```ts
describe('VenuesService.setDefault', () => {
  it('unsets every other venue of the owner and sets the target as default', async () => {
    const { service, venuesRepo, dataSource } = await buildTestingModule();
    venuesRepo.findOne
      .mockResolvedValueOnce({ id: 'venue-2', ownerId: 'owner-1', isDefault: false })
      .mockResolvedValueOnce({ id: 'venue-2', ownerId: 'owner-1', isDefault: true });
    const manager = { update: jest.fn().mockResolvedValue(undefined) };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.setDefault('owner-1', 'venue-2');

    expect(manager.update).toHaveBeenCalledWith(
      Venue,
      { ownerId: 'owner-1' },
      { isDefault: false },
    );
    expect(manager.update).toHaveBeenCalledWith(Venue, { id: 'venue-2' }, { isDefault: true });
    expect(result.isDefault).toBe(true);
  });

  it('throws NotFoundException for a venue not owned by the caller', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue(null);

    await expect(service.setDefault('owner-1', 'venue-2')).rejects.toThrow(
      'Venue venue-2 không tồn tại',
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest venues.service`
Expected: FAIL — `service.setDefault is not a function`.

- [ ] **Step 3: Implement `setDefault`**

In `apps/api/src/courts/venues.service.ts`, add this method after `update`/`changeSlug`:

```ts
  async setDefault(ownerId: string, id: string): Promise<Venue> {
    await this.getOwnedVenueOrThrow(ownerId, id);
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Venue, { ownerId }, { isDefault: false });
      await manager.update(Venue, { id }, { isDefault: true });
    });
    return this.getOwnedVenueOrThrow(ownerId, id);
  }
```

- [ ] **Step 4: Add the controller route**

In `apps/api/src/courts/venues.controller.ts`, add after the `update` handler:

```ts
  @Post('mine/:id/set-default')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  setDefault(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
  ) {
    return this.venuesService.setDefault(effectiveOwnerId, id);
  }
```

- [ ] **Step 5: Run the tests to verify they pass, type-check**

Run (from `apps/api`): `npx jest venues.service && npx tsc --noEmit -p .`
Expected: both pass/exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.controller.ts apps/api/src/courts/venues.service.spec.ts
git commit -m "feat(api): add POST /venues/mine/:id/set-default"
```

---

### Task 7: `DELETE /venues/mine/:id` — booking-history guard, cascade, default reassignment

**Files:**
- Modify: `apps/api/src/courts/venues.service.ts`
- Modify: `apps/api/src/courts/venues.controller.ts`
- Test: `apps/api/src/courts/venues.service.spec.ts`

**Interfaces:**
- Consumes: `Court`, `CourtImage`, `Booking` entities; `PricingRule` entity (import only — no repository injection needed, `manager.delete` addresses it by entity class + column criteria).
- Produces: `VenuesService.remove(ownerId, id): Promise<void>` — consumed by the controller and Task 10's e2e delete tests.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/courts/venues.service.spec.ts`, update the imports at the top to add:

```ts
import { Court } from './entities/court.entity';
```

and add `courtsRepo`/`bookingsRepo` to the shared harness. Replace the mock-factory/`buildTestingModule` block (already modified in Task 5) with this version — same as before plus `Court`/`Booking` repos:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { VenuesService } from './venues.service';
import { Venue, VenueStatus } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';
import { VenueSlugHistory } from './entities/venue-slug-history.entity';
import { Court } from './entities/court.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

const mockVenuesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockVenueImagesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  find: jest.fn(),
});

const mockSlugHistoryRepository = () => ({
  count: jest.fn(),
  findOne: jest.fn(),
});

const mockCourtsRepository = () => ({
  find: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockBookingsRepository = () => ({
  count: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockUsersService = () => ({
  findById: jest.fn(),
});

const mockNotificationsService = () => ({
  notifyVenueApproved: jest.fn().mockResolvedValue(undefined),
  notifyVenueRejected: jest.fn().mockResolvedValue(undefined),
});

const mockDataSource = () => ({
  transaction: jest.fn(),
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
      {
        provide: getRepositoryToken(VenueSlugHistory),
        useFactory: mockSlugHistoryRepository,
      },
      { provide: getRepositoryToken(Court), useFactory: mockCourtsRepository },
      { provide: getRepositoryToken(Booking), useFactory: mockBookingsRepository },
      { provide: UsersService, useFactory: mockUsersService },
      { provide: NotificationsService, useFactory: mockNotificationsService },
      { provide: DataSource, useFactory: mockDataSource },
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
    slugHistoryRepo: module.get(getRepositoryToken(VenueSlugHistory)) as ReturnType<
      typeof mockSlugHistoryRepository
    >,
    courtsRepo: module.get(getRepositoryToken(Court)) as ReturnType<
      typeof mockCourtsRepository
    >,
    bookingsRepo: module.get(getRepositoryToken(Booking)) as ReturnType<
      typeof mockBookingsRepository
    >,
    usersService: module.get(UsersService) as ReturnType<
      typeof mockUsersService
    >,
    notificationsService: module.get(NotificationsService) as ReturnType<
      typeof mockNotificationsService
    >,
    dataSource: module.get(DataSource) as ReturnType<typeof mockDataSource>,
  };
}
```

(`createQueryBuilder` mocks are added now so Task 8 doesn't need to touch this block again.)

Then add after `describe('VenuesService.setDefault', ...)`:

```ts
describe('VenuesService.remove', () => {
  it('throws ConflictException when any court in the venue has booking history', async () => {
    const { service, venuesRepo, courtsRepo, bookingsRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1', isDefault: false });
    courtsRepo.find.mockResolvedValue([{ id: 'court-1', venueId: 'venue-1' }]);
    bookingsRepo.count.mockResolvedValue(1);

    await expect(service.remove('owner-1', 'venue-1')).rejects.toThrow(
      'Chi nhánh đã có lịch sử đặt sân',
    );
  });

  it('deletes the venue and its courts when there is no booking history', async () => {
    const { service, venuesRepo, courtsRepo, bookingsRepo, dataSource } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1', isDefault: false });
    courtsRepo.find.mockResolvedValue([{ id: 'court-1', venueId: 'venue-1' }]);
    bookingsRepo.count.mockResolvedValue(0);
    const manager = { delete: jest.fn().mockResolvedValue(undefined) };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    await service.remove('owner-1', 'venue-1');

    expect(manager.delete).toHaveBeenCalledWith(Venue, { id: 'venue-1' });
  });

  it('promotes the oldest remaining venue to default when the deleted venue was default', async () => {
    const { service, venuesRepo, courtsRepo, bookingsRepo, dataSource } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1', isDefault: true });
    courtsRepo.find.mockResolvedValue([]);
    bookingsRepo.count.mockResolvedValue(0);
    const manager = { delete: jest.fn().mockResolvedValue(undefined) };
    dataSource.transaction.mockImplementation((cb) => cb(manager));
    const remainingVenue = { id: 'venue-2', ownerId: 'owner-1', isDefault: false };
    venuesRepo.find.mockResolvedValue([remainingVenue]);
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    await service.remove('owner-1', 'venue-1');

    expect(venuesRepo.find).toHaveBeenCalledWith({
      where: { ownerId: 'owner-1' },
      order: { createdAt: 'ASC' },
    });
    expect(venuesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'venue-2', isDefault: true }),
    );
  });

  it('does not touch other venues when the deleted venue was not default', async () => {
    const { service, venuesRepo, courtsRepo, bookingsRepo, dataSource } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1', isDefault: false });
    courtsRepo.find.mockResolvedValue([]);
    bookingsRepo.count.mockResolvedValue(0);
    const manager = { delete: jest.fn().mockResolvedValue(undefined) };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    await service.remove('owner-1', 'venue-1');

    expect(venuesRepo.find).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest venues.service`
Expected: FAIL — `service.remove is not a function`.

- [ ] **Step 3: Implement `remove`**

In `apps/api/src/courts/venues.service.ts`:

Update imports — add `ConflictException` (already added in Task 4), `In` to the `typeorm` import, and the `Court`/`CourtImage`/`Booking`/`PricingRule` entity imports:

```ts
import { DataSource, ILike, In, MoreThanOrEqual, Repository } from 'typeorm';
import { Court } from './entities/court.entity';
import { CourtImage } from './entities/court-image.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { PricingRule } from '../pricing/entities/pricing-rule.entity';
```

Update the constructor to inject `Court` and `Booking` repositories (both are already registered in `CourtsModule`'s `TypeOrmModule.forFeature`, so no module change is needed):

```ts
  constructor(
    @InjectRepository(Venue)
    private readonly venuesRepository: Repository<Venue>,
    @InjectRepository(VenueImage)
    private readonly venueImagesRepository: Repository<VenueImage>,
    @InjectRepository(VenueSlugHistory)
    private readonly slugHistoryRepository: Repository<VenueSlugHistory>,
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}
```

Add the `remove` method after `setDefault`:

```ts
  async remove(ownerId: string, id: string): Promise<void> {
    const venue = await this.getOwnedVenueOrThrow(ownerId, id);
    const courts = await this.courtsRepository.find({ where: { venueId: id } });
    const courtIds = courts.map((court) => court.id);

    if (courtIds.length > 0) {
      const bookingCount = await this.bookingsRepository.count({
        where: { courtId: In(courtIds) },
      });
      if (bookingCount > 0) {
        throw new ConflictException(
          'Chi nhánh đã có lịch sử đặt sân, không thể xoá. Hãy dùng tính năng "Ẩn" thay thế.',
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      if (courtIds.length > 0) {
        await manager.delete(PricingRule, { courtId: In(courtIds) });
        await manager.delete(CourtImage, { courtId: In(courtIds) });
        await manager.delete(Court, { id: In(courtIds) });
      }
      await manager.delete(VenueImage, { venueId: id });
      await manager.delete(VenueSlugHistory, { venueId: id });
      await manager.delete(Venue, { id });
    });

    if (venue.isDefault) {
      const remaining = await this.venuesRepository.find({
        where: { ownerId },
        order: { createdAt: 'ASC' },
      });
      if (remaining.length > 0) {
        remaining[0].isDefault = true;
        await this.venuesRepository.save(remaining[0]);
      }
    }
  }
```

- [ ] **Step 4: Add the controller route**

In `apps/api/src/courts/venues.controller.ts`, add after `setDefault`:

```ts
  @Delete('mine/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  remove(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
  ) {
    return this.venuesService.remove(effectiveOwnerId, id);
  }
```

- [ ] **Step 5: Run the tests to verify they pass, type-check**

Run (from `apps/api`): `npx jest venues.service && npx tsc --noEmit -p .`
Expected: both pass/exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.controller.ts apps/api/src/courts/venues.service.spec.ts
git commit -m "feat(api): add DELETE /venues/mine/:id with booking-history guard and default reassignment"
```

---

### Task 8: `GET /venues/mine` — status/search/sort + per-venue quick stats

**Files:**
- Create: `apps/api/src/courts/dto/list-venues.dto.ts`
- Modify: `apps/api/src/courts/venues.service.ts`
- Modify: `apps/api/src/courts/venues.controller.ts`
- Test: `apps/api/src/courts/venues.service.spec.ts`

**Interfaces:**
- Consumes: `getCurrentMonthRange` (`apps/api/src/common/date-range.utils.ts`, already exists), `Payment`/`PaymentStatus` entity.
- Produces: `VenuesService.findMineWithMetrics(ownerId, opts): Promise<VenueWithMetrics[]>` where `VenueWithMetrics extends Venue { courtsCount, bookingsThisMonth, revenueThisMonth }` — this is the shape `GET /venues/mine` now returns, consumed by the frontend plan derived from `2026-09-02-branches-frontend-design.md`.

Note: `findMineByOwner` (used internally by `CourtsService.findAllForOwner` and `DashboardService.getSummary`) is left untouched — this task adds a new, separate method rather than changing an existing one's return shape, so those two call sites are unaffected.

- [ ] **Step 1: Create `ListVenuesDto`**

Create `apps/api/src/courts/dto/list-venues.dto.ts`:

```ts
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListVenuesDto {
  @IsOptional()
  @IsIn(['active', 'hidden', 'all'])
  status?: 'active' | 'hidden' | 'all';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['default', 'name', 'newest'])
  sort?: 'default' | 'name' | 'newest';
}
```

- [ ] **Step 2: Write the failing tests**

In `apps/api/src/courts/venues.service.spec.ts`, add these two helpers right after the `buildTestingModule` function:

```ts
function buildMockQueryBuilder<T>(result: T[]) {
  const qb: Record<string, jest.Mock> = {};
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.getMany = jest.fn().mockResolvedValue(result);
  return qb;
}

function buildMockRawQueryBuilder<T>(result: T[]) {
  const qb: Record<string, jest.Mock> = {};
  qb.select = jest.fn().mockReturnValue(qb);
  qb.addSelect = jest.fn().mockReturnValue(qb);
  qb.innerJoin = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.groupBy = jest.fn().mockReturnValue(qb);
  qb.getRawMany = jest.fn().mockResolvedValue(result);
  return qb;
}
```

Add a `paymentsRepo` to the harness: update the mock-factory/`buildTestingModule` block (same one modified in Task 7) by adding a `Payment` import, a `mockPaymentsRepository` factory, and its provider/return entry:

```ts
import { Payment } from '../payments/entities/payment.entity';
```

```ts
const mockPaymentsRepository = () => ({
  createQueryBuilder: jest.fn(),
});
```

Add `{ provide: getRepositoryToken(Payment), useFactory: mockPaymentsRepository },` to `providers`, and `paymentsRepo: module.get(getRepositoryToken(Payment)) as ReturnType<typeof mockPaymentsRepository>,` to the returned object.

Then add this `describe` block after `describe('VenuesService.remove', ...)`:

```ts
describe('VenuesService.findMineWithMetrics', () => {
  it('returns venues enriched with courtsCount/bookingsThisMonth/revenueThisMonth', async () => {
    const { service, venuesRepo, courtsRepo, bookingsRepo, paymentsRepo } =
      await buildTestingModule();
    venuesRepo.createQueryBuilder.mockReturnValue(
      buildMockQueryBuilder([
        {
          id: 'venue-1',
          name: 'A',
          ownerId: 'owner-1',
          isDefault: true,
          createdAt: new Date('2026-01-01'),
        },
      ]),
    );
    courtsRepo.find.mockResolvedValue([{ id: 'court-1', venueId: 'venue-1' }]);
    bookingsRepo.createQueryBuilder.mockReturnValue(
      buildMockRawQueryBuilder([{ courtId: 'court-1', count: '2' }]),
    );
    paymentsRepo.createQueryBuilder.mockReturnValue(
      buildMockRawQueryBuilder([{ courtId: 'court-1', revenue: '300000' }]),
    );

    const result = await service.findMineWithMetrics('owner-1');

    expect(result).toEqual([
      expect.objectContaining({
        id: 'venue-1',
        courtsCount: 1,
        bookingsThisMonth: 2,
        revenueThisMonth: 300000,
      }),
    ]);
  });

  it('returns an empty array without querying courts/bookings when the owner has no venues', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.createQueryBuilder.mockReturnValue(buildMockQueryBuilder([]));

    const result = await service.findMineWithMetrics('owner-1');

    expect(result).toEqual([]);
    expect(courtsRepo.find).not.toHaveBeenCalled();
  });

  it('sorts by name when sort is "name"', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.createQueryBuilder.mockReturnValue(
      buildMockQueryBuilder([
        { id: 'venue-b', name: 'B Venue', ownerId: 'owner-1', isDefault: false, createdAt: new Date('2026-01-01') },
        { id: 'venue-a', name: 'A Venue', ownerId: 'owner-1', isDefault: true, createdAt: new Date('2026-02-01') },
      ]),
    );
    courtsRepo.find.mockResolvedValue([]);

    const result = await service.findMineWithMetrics('owner-1', { sort: 'name' });

    expect(result.map((v) => v.id)).toEqual(['venue-a', 'venue-b']);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/api && npx jest venues.service`
Expected: FAIL — `service.findMineWithMetrics is not a function`.

- [ ] **Step 4: Implement `findMineWithMetrics`**

In `apps/api/src/courts/venues.service.ts`, update imports — add:

```ts
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { getCurrentMonthRange } from '../common/date-range.utils';
```

Add `Payment` to the constructor (after `bookingsRepository`):

```ts
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
```

Add this interface above the `VenuesService` class:

```ts
export interface VenueWithMetrics extends Venue {
  courtsCount: number;
  bookingsThisMonth: number;
  revenueThisMonth: number;
}
```

Add the method and its private sort helper at the end of the class (after `remove`):

```ts
  async findMineWithMetrics(
    ownerId: string,
    opts: {
      status?: 'active' | 'hidden' | 'all';
      search?: string;
      sort?: 'default' | 'name' | 'newest';
    } = {},
  ): Promise<VenueWithMetrics[]> {
    const qb = this.venuesRepository
      .createQueryBuilder('venue')
      .where('venue.owner_id = :ownerId', { ownerId });
    if (opts.status === 'active') {
      qb.andWhere('venue.is_hidden = false');
    } else if (opts.status === 'hidden') {
      qb.andWhere('venue.is_hidden = true');
    }
    if (opts.search) {
      qb.andWhere(
        '(venue.name ILIKE :search OR venue.address ILIKE :search OR venue.city ILIKE :search)',
        { search: `%${opts.search}%` },
      );
    }
    const venues = await qb.getMany();
    if (venues.length === 0) {
      return [];
    }

    const courts = await this.courtsRepository.find({
      where: { venueId: In(venues.map((venue) => venue.id)) },
    });
    const courtIds = courts.map((court) => court.id);
    const venueIdByCourtId = new Map(courts.map((court) => [court.id, court.venueId]));
    const courtsCountByVenue = new Map<string, number>();
    for (const court of courts) {
      courtsCountByVenue.set(
        court.venueId,
        (courtsCountByVenue.get(court.venueId) ?? 0) + 1,
      );
    }

    const bookingsByVenue = new Map<string, number>();
    const revenueByVenue = new Map<string, number>();
    if (courtIds.length > 0) {
      const { start: monthStart, end: monthEnd } = getCurrentMonthRange();

      const bookingRows = await this.bookingsRepository
        .createQueryBuilder('booking')
        .select('booking.court_id', 'courtId')
        .addSelect('COUNT(*)', 'count')
        .where('booking.court_id IN (:...courtIds)', { courtIds })
        .andWhere('booking.created_at >= :monthStart', { monthStart })
        .andWhere('booking.created_at < :monthEnd', { monthEnd })
        .groupBy('booking.court_id')
        .getRawMany<{ courtId: string; count: string }>();
      for (const row of bookingRows) {
        const venueId = venueIdByCourtId.get(row.courtId);
        if (!venueId) continue;
        bookingsByVenue.set(venueId, (bookingsByVenue.get(venueId) ?? 0) + Number(row.count));
      }

      const revenueRows = await this.paymentsRepository
        .createQueryBuilder('payment')
        .innerJoin('bookings', 'booking', 'booking.id::text = payment.booking_id')
        .select('booking.court_id', 'courtId')
        .addSelect('SUM(booking.total_price)', 'revenue')
        .where('booking.court_id IN (:...courtIds)', { courtIds })
        .andWhere('payment.status = :status', { status: PaymentStatus.PAID })
        .andWhere('payment.paid_at >= :monthStart', { monthStart })
        .andWhere('payment.paid_at < :monthEnd', { monthEnd })
        .groupBy('booking.court_id')
        .getRawMany<{ courtId: string; revenue: string }>();
      for (const row of revenueRows) {
        const venueId = venueIdByCourtId.get(row.courtId);
        if (!venueId) continue;
        revenueByVenue.set(venueId, (revenueByVenue.get(venueId) ?? 0) + Number(row.revenue));
      }
    }

    const enriched: VenueWithMetrics[] = venues.map((venue) => ({
      ...venue,
      courtsCount: courtsCountByVenue.get(venue.id) ?? 0,
      bookingsThisMonth: bookingsByVenue.get(venue.id) ?? 0,
      revenueThisMonth: revenueByVenue.get(venue.id) ?? 0,
    }));

    return this.sortVenues(enriched, opts.sort ?? 'default');
  }

  private sortVenues<T extends { isDefault: boolean; name: string; createdAt: Date }>(
    venues: T[],
    sort: 'default' | 'name' | 'newest',
  ): T[] {
    const copy = [...venues];
    if (sort === 'name') {
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (sort === 'newest') {
      return copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    return copy.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  }
```

- [ ] **Step 5: Wire the controller**

In `apps/api/src/courts/venues.controller.ts`, add the import:

```ts
import { ListVenuesDto } from './dto/list-venues.dto';
```

Replace the `findMine` handler:

```ts
  @Get('mine')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  findMine(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Query() query: ListVenuesDto,
  ) {
    return this.venuesService.findMineWithMetrics(effectiveOwnerId, query);
  }
```

- [ ] **Step 6: Register `Payment` in `CourtsModule`**

In `apps/api/src/courts/courts.module.ts`, add the import and include it in `forFeature`:

```ts
import { Payment } from '../payments/entities/payment.entity';
```

```ts
    TypeOrmModule.forFeature([Venue, VenueImage, Court, CourtImage, Booking, VenueSlugHistory, Payment]),
```

- [ ] **Step 7: Run the tests to verify they pass, type-check, run e2e**

Run (from `apps/api`): `npx jest venues.service && npx tsc --noEmit -p . && npm run test:e2e`
Expected: unit tests pass (including the 3 new ones), type-check exits 0, e2e suite still green — `venues-mine-courts.e2e-spec.ts` only asserts `Array.isArray`/`toHaveLength`/`toMatchObject` on a subset of fields, so the added `courtsCount`/`bookingsThisMonth`/`revenueThisMonth` fields don't break it.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/courts/dto/list-venues.dto.ts apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.controller.ts apps/api/src/courts/courts.module.ts apps/api/src/courts/venues.service.spec.ts
git commit -m "feat(api): GET /venues/mine supports status/search/sort and returns per-venue quick stats"
```

---

### Task 9: Public `GET /venues/by-slug/:slug` + `is_hidden` filtering on existing public reads

**Files:**
- Modify: `apps/api/src/courts/venues.service.ts`
- Modify: `apps/api/src/courts/venues.controller.ts`
- Test: `apps/api/src/courts/venues.service.spec.ts`

**Interfaces:**
- Produces: `VenuesService.findPublicBySlug(slug): Promise<Venue>` — 404s the same way `findPublicById` does.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/courts/venues.service.spec.ts`, replace the existing `describe('VenuesService public reads', ...)` block (its `searchPublic` test's expectation is stale once `isHidden` filtering lands) with:

```ts
describe('VenuesService public reads', () => {
  it('searchPublic without a query returns only active, non-hidden venues', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1' }]);

    const result = await service.searchPublic();

    expect(venuesRepo.find).toHaveBeenCalledWith({
      where: { status: VenueStatus.ACTIVE, isHidden: false },
    });
    expect(result).toEqual([{ id: 'venue-1' }]);
  });

  it('findPublicById throws NotFoundException for an inactive, hidden, or missing venue', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue(null);

    await expect(service.findPublicById('venue-1')).rejects.toThrow(
      'Venue venue-1 không tồn tại',
    );
    expect(venuesRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'venue-1', status: VenueStatus.ACTIVE, isHidden: false },
    });
  });
});

describe('VenuesService.findPublicBySlug', () => {
  it('returns the venue for an active, non-hidden slug', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', slug: 'abc' });

    const result = await service.findPublicBySlug('abc');

    expect(venuesRepo.findOne).toHaveBeenCalledWith({
      where: { slug: 'abc', status: VenueStatus.ACTIVE, isHidden: false },
    });
    expect(result.id).toBe('venue-1');
  });

  it('throws NotFoundException when the slug does not match any active, visible venue', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue(null);

    await expect(service.findPublicBySlug('missing')).rejects.toThrow(
      'Venue với slug missing không tồn tại',
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest venues.service`
Expected: FAIL — `searchPublic`/`findPublicById` called without `isHidden: false`; `findPublicBySlug is not a function`.

- [ ] **Step 3: Implement**

In `apps/api/src/courts/venues.service.ts`, replace `searchPublic` and `findPublicById`, and add `findPublicBySlug` right after:

```ts
  searchPublic(query?: string): Promise<Venue[]> {
    if (!query) {
      return this.venuesRepository.find({
        where: { status: VenueStatus.ACTIVE, isHidden: false },
      });
    }
    return this.venuesRepository.find({
      where: [
        { status: VenueStatus.ACTIVE, isHidden: false, name: ILike(`%${query}%`) },
        { status: VenueStatus.ACTIVE, isHidden: false, address: ILike(`%${query}%`) },
        { status: VenueStatus.ACTIVE, isHidden: false, city: ILike(`%${query}%`) },
      ],
    });
  }

  async findPublicById(id: string): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({
      where: { id, status: VenueStatus.ACTIVE, isHidden: false },
    });
    if (!venue) {
      throw new NotFoundException(`Venue ${id} không tồn tại`);
    }
    return venue;
  }

  async findPublicBySlug(slug: string): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({
      where: { slug, status: VenueStatus.ACTIVE, isHidden: false },
    });
    if (!venue) {
      throw new NotFoundException(`Venue với slug ${slug} không tồn tại`);
    }
    return venue;
  }
```

- [ ] **Step 4: Add the controller route**

In `apps/api/src/courts/venues.controller.ts`, add a new public handler **before** the existing `@Get(':id')` handler (so it reads naturally alongside the other public routes; it can't collide with `:id` either way since it's a two-segment path):

```ts
  @Get('by-slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const venue = await this.venuesService.findPublicBySlug(slug);
    const courts = await this.courtsService.findActiveByVenue(venue.id);
    const images = await this.venuesService.findImagesByVenue(venue.id);
    return { ...venue, courts, images };
  }
```

- [ ] **Step 5: Run the tests to verify they pass, type-check**

Run (from `apps/api`): `npx jest venues.service && npx tsc --noEmit -p .`
Expected: both pass/exit 0.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.controller.ts apps/api/src/courts/venues.service.spec.ts
git commit -m "feat(api): add GET /venues/by-slug/:slug, exclude hidden venues from public reads"
```

---

### Task 10: E2E coverage + full-suite check

**Files:**
- Create: `apps/api/test/venues-branches.e2e-spec.ts`

**Interfaces:**
- Consumes: `createTestApp`/`clearDatabase` (`apps/api/test/utils/test-app.ts`), `createUser`/`loginAs`/`createVenue`/`createCourt`/`createBooking` (`apps/api/test/utils/owner-fixtures.ts`).

- [ ] **Step 1: Write the e2e spec**

Create `apps/api/test/venues-branches.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { createUser, loginAs, createVenue, createCourt, createBooking } from './utils/owner-fixtures';
import { UserRole } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { VenueSlugHistory } from '../src/courts/entities/venue-slug-history.entity';

describe('Branches (venues) e2e', () => {
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

  async function ownerAndToken() {
    const owner = await createUser(dataSource, 'owner@test.com', UserRole.OWNER);
    const token = await loginAs(app, 'owner@test.com');
    return { ownerId: owner.id, token };
  }

  it('POST /venues auto-generates a unique slug and marks the first venue as default', async () => {
    const { token } = await ownerAndToken();

    const response = await request(app.getHttpServer())
      .post('/venues')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sân Đình Văn Chung', address: '1 Le Loi', city: 'Ho Chi Minh' })
      .expect(201);

    expect(response.body.slug).toBe('san-dinh-van-chung');
    expect(response.body.isDefault).toBe(true);
  });

  it('changing the slug makes the old one 404 and the new one resolve via by-slug', async () => {
    const { ownerId, token } = await ownerAndToken();
    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId,
        name: 'Sân ABC',
        address: '1 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
        slug: 'old-slug',
      }),
    );

    await request(app.getHttpServer())
      .patch(`/venues/mine/${venue.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'new-slug' })
      .expect(200);

    await request(app.getHttpServer()).get('/venues/by-slug/old-slug').expect(404);
    const bySlug = await request(app.getHttpServer())
      .get('/venues/by-slug/new-slug')
      .expect(200);
    expect(bySlug.body.id).toBe(venue.id);
  });

  it('hiding a venue 404s the public single-venue lookup even though it is active', async () => {
    const { ownerId, token } = await ownerAndToken();
    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId,
        name: 'Sân ABC',
        address: '1 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
        slug: 'abc-pickleball',
      }),
    );

    await request(app.getHttpServer())
      .patch(`/venues/mine/${venue.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isHidden: true })
      .expect(200);

    await request(app.getHttpServer()).get(`/venues/${venue.id}`).expect(404);
  });

  it('rejects the 4th slug change within a 180-day window with 400', async () => {
    const { ownerId, token } = await ownerAndToken();
    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId,
        name: 'Sân ABC',
        address: '1 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
        slug: 'slug-0',
      }),
    );
    const historyRepo = dataSource.getRepository(VenueSlugHistory);
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const changedAt = new Date(now);
      changedAt.setDate(changedAt.getDate() - (61 * (i + 1)));
      await historyRepo.save(
        historyRepo.create({ venueId: venue.id, oldSlug: `slug-${i}`, changedAt }),
      );
    }

    const response = await request(app.getHttpServer())
      .patch(`/venues/mine/${venue.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'slug-final' })
      .expect(400);

    expect(response.body.message).toContain('giới hạn đổi đường dẫn');
  });

  it('blocks deletion with 409 when the venue has booking history, allows it otherwise', async () => {
    const { ownerId, token } = await ownerAndToken();
    const venueWithBooking = await createVenue(dataSource, ownerId, 'Có booking');
    const court = await createCourt(dataSource, venueWithBooking.id, 'San 1');
    await createBooking(dataSource, court.id, {});
    const venueWithoutBooking = await createVenue(dataSource, ownerId, 'Khong booking');

    await request(app.getHttpServer())
      .delete(`/venues/mine/${venueWithBooking.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/venues/mine/${venueWithoutBooking.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/venues/mine/${venueWithoutBooking.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('set-default swaps which venue is default', async () => {
    const { ownerId, token } = await ownerAndToken();
    const first = await createVenue(dataSource, ownerId, 'Venue A');
    const venuesRepo = dataSource.getRepository(Venue);
    await venuesRepo.update(first.id, { isDefault: true });
    const second = await createVenue(dataSource, ownerId, 'Venue B');

    await request(app.getHttpServer())
      .post(`/venues/mine/${second.id}/set-default`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/venues/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const byId = new Map(list.body.map((v: { id: string; isDefault: boolean }) => [v.id, v.isDefault]));
    expect(byId.get(first.id)).toBe(false);
    expect(byId.get(second.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the e2e suite**

Run (from `apps/api`): `npm run test:e2e`
Expected: PASS, including all 6 new tests in `venues-branches.e2e-spec.ts`.

- [ ] **Step 3: Full-suite check**

Run (from `apps/api`): `npm test && npx tsc --noEmit -p . && npm run test:e2e`
Expected: unit tests pass, type-check exits 0, e2e suite passes — this is the full acceptance bar for the plan.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/venues-branches.e2e-spec.ts
git commit -m "test(api): add e2e coverage for branch slug, visibility, delete-guard, and set-default"
```
