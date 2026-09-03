# Settings Module Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the backend for the owner "Cài đặt" (Settings) module: venue website field, venue operating hours, per-owner notification toggles (retrofitted onto the existing Notifications module), a daily report email cron, and self-service change-password.

**Architecture:** Extend the existing `courts` module (`VenuesService`/`VenuesController`) with a `website` column and a new `venue_operating_hours` table, since both belong to `Venue`. Add a new leaf module `notification-settings` (entity + service + controller + a `@Cron` scheduler) that `bookings` and `payments` import to gate owner-facing emails. Add `POST /auth/change-password` to the existing `AuthController`/`AuthService` (not `UsersController`, to avoid a circular module dependency — see Task 10).

**Tech Stack:** NestJS 11, TypeORM (migrations, no `synchronize`), class-validator, `@nestjs/schedule` (already global via `ScheduleModule.forRoot()` in `app.module.ts`), Jest for unit tests, Jest + Supertest for e2e tests.

## Global Constraints

- Follow [2026-08-26-settings-design.md](../specs/2026-08-26-settings-design.md) exactly — it is the source of truth for endpoints, table shapes, and retrofit call sites. Re-read §0, §2-§5 before starting if anything below seems to contradict it.
- Every owner-facing endpoint uses `@UseGuards(JwtAuthGuard, OwnerScopeGuard)` + `@OwnerScope('full')` + `@EffectiveOwnerId()`, exactly like the existing `VenuesController` endpoints — never trust a raw `req.user.userId` for these.
- Migrations are plain SQL via `queryRunner.query(...)`, one file per concern, named `<timestamp>-<PascalCaseName>.ts`, registered automatically by the `src/migrations/*.ts` glob in `src/config/data-source.ts` — no manual registration needed.
- New tables have no real FK constraints (matches every existing migration in this codebase — `venue_id`/`owner_id` columns are plain `character varying`/`uuid`, not `REFERENCES`).
- Any new e2e-tested table MUST be added to the `TRUNCATE` list in `apps/api/test/utils/test-app.ts`'s `clearDatabase` — these tables have no FK to `venues`/`users`, so `TRUNCATE ... CASCADE` will NOT clear them automatically, and stale rows will leak across tests.
- Run unit tests with `npm test` and e2e tests with `npm run test:e2e`, both from `apps/api/`.

---

### Task 1: `website` field on venues

**Files:**
- Create: `apps/api/src/migrations/1787960000000-AddWebsiteToVenues.ts`
- Modify: `apps/api/src/courts/entities/venue.entity.ts`
- Modify: `apps/api/src/courts/dto/update-venue.dto.ts`
- Modify: `apps/api/src/courts/venues.service.ts`
- Test: `apps/api/src/courts/venues.service.spec.ts`
- Test: `apps/api/test/venues-branches.e2e-spec.ts`

**Interfaces:**
- Produces: `Venue.website: string | null`, `UpdateVenueDto.website?: string`, `VenuesService.update()` now persists `website`.

- [ ] **Step 1: Write the failing unit test**

Open `apps/api/src/courts/venues.service.spec.ts` and add this test inside the existing `describe('VenuesService.update', ...)` block (find it by searching for `'VenuesService.update'` — add alongside the other field-assignment tests in that block, using the same `buildTestingModule()` helper already defined at the top of the file):

```ts
  it('updates the website field when provided', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      website: null,
    });
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', {
      website: 'https://example.com',
    });

    expect(result.website).toBe('https://example.com');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- venues.service.spec.ts` (from `apps/api/`)
Expected: FAIL — `update()` doesn't read `dto.website`, so `result.website` stays `undefined`.

- [ ] **Step 3: Write the migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebsiteToVenues1787960000000 implements MigrationInterface {
  name = 'AddWebsiteToVenues1787960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "venues" ADD "website" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "website"`);
  }
}
```

- [ ] **Step 4: Run the migration**

Run: `npm run migration:run` (from `apps/api/`, requires the dev Postgres container to be up)
Expected: Output includes `AddWebsiteToVenues1787960000000` under "migrations executed".

- [ ] **Step 5: Add the column to the entity**

In `apps/api/src/courts/entities/venue.entity.ts`, add this field right after the existing `logoUrl` column (after line 70, before `@CreateDateColumn`):

```ts
  @Column({ nullable: true, type: 'varchar' })
  website: string | null;
```

- [ ] **Step 6: Add the field to `UpdateVenueDto`**

In `apps/api/src/courts/dto/update-venue.dto.ts`, add this field at the end of the class, before the closing `}`:

```ts
  @IsOptional()
  @IsString()
  website?: string;
```

- [ ] **Step 7: Handle `website` in `VenuesService.update()`**

In `apps/api/src/courts/venues.service.ts`, in the `update()` method, add this line right after the existing `if (dto.email !== undefined) venue.email = dto.email;` line:

```ts
    if (dto.website !== undefined) venue.website = dto.website;
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- venues.service.spec.ts` (from `apps/api/`)
Expected: PASS

- [ ] **Step 9: Add an e2e assertion**

In `apps/api/test/venues-branches.e2e-spec.ts`, add this test at the end of the `describe('Branches (venues) e2e', ...)` block, right before the closing `});` of the describe block:

```ts
  it('PATCH /venues/mine/:id accepts and returns website', async () => {
    const { ownerId, token } = await ownerAndToken();
    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId,
        name: 'Sân ABC',
        address: '1 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
        slug: 'san-abc-website-test',
      }),
    );

    const response = await request(app.getHttpServer())
      .patch(`/venues/mine/${venue.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ website: 'https://san-abc.example.com' })
      .expect(200);

    expect(response.body.website).toBe('https://san-abc.example.com');

    const publicView = await request(app.getHttpServer())
      .get(`/venues/${venue.id}`)
      .expect(200);
    expect(publicView.body.website).toBe('https://san-abc.example.com');
  });
```

- [ ] **Step 10: Run e2e test to verify it passes**

Run: `npm run test:e2e -- venues-branches.e2e-spec.ts` (from `apps/api/`, requires the test DB to be up and migrated)
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/migrations/1787960000000-AddWebsiteToVenues.ts apps/api/src/courts/entities/venue.entity.ts apps/api/src/courts/dto/update-venue.dto.ts apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.service.spec.ts apps/api/test/venues-branches.e2e-spec.ts
git commit -m "feat(api): add website field to venues"
```

---

### Task 2: Venue operating hours — entity, migration, service

**Files:**
- Create: `apps/api/src/migrations/1787970000000-CreateVenueOperatingHours.ts`
- Create: `apps/api/src/courts/entities/venue-operating-hours.entity.ts`
- Create: `apps/api/src/courts/dto/operating-hour-item.dto.ts`
- Modify: `apps/api/src/courts/venues.service.ts`
- Modify: `apps/api/src/courts/courts.module.ts`
- Test: `apps/api/src/courts/venues.service.spec.ts`

**Interfaces:**
- Consumes: `VenuesService.getOwnedVenueOrThrow(ownerId, venueId)` (already exists in the same file).
- Produces: `VenueOperatingHours` entity, `OperatingHourItemDto`, `OperatingHourView` interface (`{ dayOfWeek: number; isOpen: boolean; openTime: string | null; closeTime: string | null }`), `VenuesService.getOperatingHours(ownerId, venueId): Promise<OperatingHourView[]>`, `VenuesService.setOperatingHours(ownerId, venueId, items: OperatingHourItemDto[]): Promise<OperatingHourView[]>`.

- [ ] **Step 1: Write the failing unit tests**

In `apps/api/src/courts/venues.service.spec.ts`, add `VenueOperatingHours` to the imports at the top of the file:

```ts
import { VenueOperatingHours } from './entities/venue-operating-hours.entity';
```

Add a mock repository factory near the other `mock*Repository` functions:

```ts
const mockOperatingHoursRepository = () => ({
  find: jest.fn(),
});
```

In `buildTestingModule()`, add the provider (alongside the other `getRepositoryToken(...)` providers) and add it to the returned object:

```ts
      {
        provide: getRepositoryToken(VenueOperatingHours),
        useFactory: mockOperatingHoursRepository,
      },
```

```ts
    operatingHoursRepo: module.get(getRepositoryToken(VenueOperatingHours)) as ReturnType<
      typeof mockOperatingHoursRepository
    >,
```

Add these new `describe` blocks at the end of the file:

```ts
describe('VenuesService.getOperatingHours', () => {
  it('returns the default 7-day schedule when no rows exist yet', async () => {
    const { service, repo, operatingHoursRepo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    operatingHoursRepo.find.mockResolvedValue([]);

    const result = await service.getOperatingHours('owner-1', 'venue-1');

    expect(result).toHaveLength(7);
    expect(result).toEqual(
      expect.arrayContaining([
        { dayOfWeek: 0, isOpen: true, openTime: '06:00', closeTime: '22:00' },
        { dayOfWeek: 6, isOpen: true, openTime: '06:00', closeTime: '22:00' },
      ]),
    );
  });

  it('returns saved rows mapped to the view shape', async () => {
    const { service, repo, operatingHoursRepo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    operatingHoursRepo.find.mockResolvedValue([
      { id: 'row-1', venueId: 'venue-1', dayOfWeek: 1, isOpen: false, openTime: null, closeTime: null },
    ]);

    const result = await service.getOperatingHours('owner-1', 'venue-1');

    expect(result).toEqual([
      { dayOfWeek: 1, isOpen: false, openTime: null, closeTime: null },
    ]);
  });
});

describe('VenuesService.setOperatingHours', () => {
  function sevenDays(overrides: Partial<{ dayOfWeek: number; isOpen: boolean; openTime?: string; closeTime?: string }>[] = []) {
    const base = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      isOpen: true,
      openTime: '08:00',
      closeTime: '20:00',
    }));
    for (const override of overrides) {
      const idx = base.findIndex((d) => d.dayOfWeek === override.dayOfWeek);
      base[idx] = { ...base[idx], ...override } as (typeof base)[number];
    }
    return base;
  }

  it('rejects a payload that is not exactly 7 items', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });

    await expect(
      service.setOperatingHours('owner-1', 'venue-1', sevenDays().slice(0, 6) as never),
    ).rejects.toThrow('Phải gửi đúng 7 ngày trong tuần');
  });

  it('rejects duplicate dayOfWeek values', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    const items = sevenDays();
    items[1] = { ...items[1], dayOfWeek: 0 };

    await expect(
      service.setOperatingHours('owner-1', 'venue-1', items as never),
    ).rejects.toThrow('dayOfWeek phải phủ đủ 0-6, không trùng');
  });

  it('rejects openTime >= closeTime when isOpen is true', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    const items = sevenDays([{ dayOfWeek: 2, isOpen: true, openTime: '20:00', closeTime: '08:00' }]);

    await expect(
      service.setOperatingHours('owner-1', 'venue-1', items as never),
    ).rejects.toThrow('giờ mở phải trước giờ đóng');
  });

  it('rejects openTime/closeTime present while isOpen is false', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    const items = sevenDays([{ dayOfWeek: 3, isOpen: false, openTime: '08:00', closeTime: '20:00' }]);

    await expect(
      service.setOperatingHours('owner-1', 'venue-1', items as never),
    ).rejects.toThrow('không được có giờ mở/đóng');
  });

  it('deletes existing rows and inserts the new 7 inside a transaction', async () => {
    const { service, repo, dataSource, operatingHoursRepo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    const manager = {
      delete: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((_entity: unknown, data: unknown) => data),
      save: jest.fn().mockResolvedValue(undefined),
    };
    dataSource.transaction.mockImplementation((cb: (m: unknown) => unknown) => cb(manager));
    operatingHoursRepo.find.mockResolvedValue(
      sevenDays().map((d) => ({ ...d, id: 'x', venueId: 'venue-1' })),
    );

    await service.setOperatingHours('owner-1', 'venue-1', sevenDays() as never);

    expect(manager.delete).toHaveBeenCalledWith(VenueOperatingHours, { venueId: 'venue-1' });
    expect(manager.save).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ dayOfWeek: 0, venueId: 'venue-1' })]),
    );
  });
});
```

Note: `dataSource` is already returned from `buildTestingModule()` in this file (used by other `describe` blocks like `VenuesService.setDefault`) — confirm this by checking the existing `buildTestingModule` return object; it already includes `dataSource: module.get(...)`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- venues.service.spec.ts` (from `apps/api/`)
Expected: FAIL — `VenueOperatingHours` entity/import doesn't exist yet, `getOperatingHours`/`setOperatingHours` are not defined on `VenuesService`.

- [ ] **Step 3: Write the migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVenueOperatingHours1787970000000 implements MigrationInterface {
  name = 'CreateVenueOperatingHours1787970000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "venue_operating_hours" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venue_id" character varying NOT NULL, "day_of_week" integer NOT NULL, "is_open" boolean NOT NULL DEFAULT true, "open_time" TIME, "close_time" TIME, CONSTRAINT "PK_venue_operating_hours_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "venue_operating_hours_venue_day_unique_idx" ON "venue_operating_hours" ("venue_id", "day_of_week")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."venue_operating_hours_venue_day_unique_idx"`);
    await queryRunner.query(`DROP TABLE "venue_operating_hours"`);
  }
}
```

- [ ] **Step 4: Run the migration**

Run: `npm run migration:run` (from `apps/api/`)
Expected: Output includes `CreateVenueOperatingHours1787970000000`.

- [ ] **Step 5: Create the entity**

```ts
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('venue_operating_hours')
export class VenueOperatingHours {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'venue_id' })
  venueId: string;

  @Column({ name: 'day_of_week', type: 'int' })
  dayOfWeek: number;

  @Column({ name: 'is_open', default: true })
  isOpen: boolean;

  @Column({ name: 'open_time', type: 'time', nullable: true })
  openTime: string | null;

  @Column({ name: 'close_time', type: 'time', nullable: true })
  closeTime: string | null;
}
```

Save as `apps/api/src/courts/entities/venue-operating-hours.entity.ts`.

- [ ] **Step 6: Create the DTO**

```ts
import { IsBoolean, IsInt, IsString, Matches, Max, Min, ValidateIf } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class OperatingHourItemDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @IsBoolean()
  isOpen: boolean;

  @ValidateIf((o) => o.isOpen === true)
  @IsString()
  @Matches(TIME_PATTERN, { message: 'openTime phải theo định dạng HH:mm' })
  openTime?: string | null;

  @ValidateIf((o) => o.isOpen === true)
  @IsString()
  @Matches(TIME_PATTERN, { message: 'closeTime phải theo định dạng HH:mm' })
  closeTime?: string | null;
}
```

Save as `apps/api/src/courts/dto/operating-hour-item.dto.ts`.

- [ ] **Step 7: Add the repository and service methods**

In `apps/api/src/courts/venues.service.ts`:

Add to the imports:

```ts
import { VenueOperatingHours } from './entities/venue-operating-hours.entity';
import { OperatingHourItemDto } from './dto/operating-hour-item.dto';
```

Add this interface and constant right after the existing `VenueWithMetrics` interface (before `@Injectable()`):

```ts
export interface OperatingHourView {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}

const DEFAULT_OPERATING_HOURS: OperatingHourView[] = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
  dayOfWeek,
  isOpen: true,
  openTime: '06:00',
  closeTime: '22:00',
}));
```

Add a new constructor parameter (in the existing constructor's parameter list, right after `slugHistoryRepository`):

```ts
    @InjectRepository(VenueOperatingHours)
    private readonly operatingHoursRepository: Repository<VenueOperatingHours>,
```

Add these two methods at the end of the class, right before the closing `}`:

```ts
  async getOperatingHours(ownerId: string, venueId: string): Promise<OperatingHourView[]> {
    await this.getOwnedVenueOrThrow(ownerId, venueId);
    const rows = await this.operatingHoursRepository.find({
      where: { venueId },
      order: { dayOfWeek: 'ASC' },
    });
    if (rows.length === 0) {
      return DEFAULT_OPERATING_HOURS;
    }
    return rows.map((row) => ({
      dayOfWeek: row.dayOfWeek,
      isOpen: row.isOpen,
      openTime: row.openTime,
      closeTime: row.closeTime,
    }));
  }

  async setOperatingHours(
    ownerId: string,
    venueId: string,
    items: OperatingHourItemDto[],
  ): Promise<OperatingHourView[]> {
    await this.getOwnedVenueOrThrow(ownerId, venueId);
    if (items.length !== 7) {
      throw new BadRequestException('Phải gửi đúng 7 ngày trong tuần');
    }
    const seenDays = new Set(items.map((item) => item.dayOfWeek));
    if (seenDays.size !== 7) {
      throw new BadRequestException('dayOfWeek phải phủ đủ 0-6, không trùng');
    }
    for (const item of items) {
      if (item.isOpen) {
        if (!item.openTime || !item.closeTime) {
          throw new BadRequestException(
            `Ngày ${item.dayOfWeek} đang mở cửa phải có giờ mở và giờ đóng`,
          );
        }
        if (item.openTime >= item.closeTime) {
          throw new BadRequestException(`Ngày ${item.dayOfWeek} giờ mở phải trước giờ đóng`);
        }
      } else if (item.openTime || item.closeTime) {
        throw new BadRequestException(
          `Ngày ${item.dayOfWeek} đang đóng cửa không được có giờ mở/đóng`,
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(VenueOperatingHours, { venueId });
      const rows = items.map((item) =>
        manager.create(VenueOperatingHours, {
          venueId,
          dayOfWeek: item.dayOfWeek,
          isOpen: item.isOpen,
          openTime: item.isOpen ? item.openTime! : null,
          closeTime: item.isOpen ? item.closeTime! : null,
        }),
      );
      await manager.save(rows);
    });

    return this.getOperatingHours(ownerId, venueId);
  }
```

- [ ] **Step 8: Register the entity in `CourtsModule`**

In `apps/api/src/courts/courts.module.ts`, add `VenueOperatingHours` to the import list and to the `TypeOrmModule.forFeature([...])` array:

```ts
import { VenueOperatingHours } from './entities/venue-operating-hours.entity';
```

```ts
    TypeOrmModule.forFeature([Venue, VenueImage, Court, CourtImage, Booking, VenueSlugHistory, Payment, VenueOperatingHours]),
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `npm test -- venues.service.spec.ts` (from `apps/api/`)
Expected: PASS (all `describe('VenuesService.getOperatingHours', ...)` and `describe('VenuesService.setOperatingHours', ...)` tests green)

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/migrations/1787970000000-CreateVenueOperatingHours.ts apps/api/src/courts/entities/venue-operating-hours.entity.ts apps/api/src/courts/dto/operating-hour-item.dto.ts apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.service.spec.ts apps/api/src/courts/courts.module.ts
git commit -m "feat(api): add venue operating hours entity and service methods"
```

---

### Task 3: Venue operating hours — controller endpoints and e2e tests

**Files:**
- Modify: `apps/api/src/courts/venues.controller.ts`
- Modify: `apps/api/test/utils/test-app.ts`
- Create: `apps/api/test/venue-operating-hours.e2e-spec.ts`

**Interfaces:**
- Consumes: `VenuesService.getOperatingHours`/`setOperatingHours` (Task 2), `OperatingHourItemDto` (Task 2).
- Produces: `GET /venues/mine/:id/operating-hours`, `PUT /venues/mine/:id/operating-hours`.

- [ ] **Step 1: Add the TRUNCATE entry**

In `apps/api/test/utils/test-app.ts`, edit the `clearDatabase` function's `TRUNCATE TABLE` list — add `venue_operating_hours` right after `venues`:

```ts
export async function clearDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  await dataSource.query(
    'TRUNCATE TABLE disputes, payments, booking_slots, bookings, customer_contacts, venue_images, court_images, courts, venues, venue_operating_hours, refresh_tokens, password_reset_tokens, email_verification_tokens, users RESTART IDENTITY CASCADE',
  );
}
```

- [ ] **Step 2: Write the failing e2e test**

Create `apps/api/test/venue-operating-hours.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { createUser, loginAs, createVenue } from './utils/owner-fixtures';
import { UserRole } from '../src/users/entities/user.entity';

describe('Venue operating hours (e2e)', () => {
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

  async function ownerVenueAndToken() {
    const owner = await createUser(dataSource, 'oh-owner@test.com', UserRole.OWNER);
    const venue = await createVenue(dataSource, owner.id, 'Sân giờ hoạt động');
    const token = await loginAs(app, 'oh-owner@test.com');
    return { ownerId: owner.id, venueId: venue.id, token };
  }

  function sevenDays() {
    return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      isOpen: dayOfWeek !== 0,
      openTime: dayOfWeek !== 0 ? '07:00' : undefined,
      closeTime: dayOfWeek !== 0 ? '21:00' : undefined,
    }));
  }

  it('GET returns the default schedule before anything is saved', async () => {
    const { venueId, token } = await ownerVenueAndToken();

    const response = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/operating-hours`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(7);
    expect(response.body[0]).toMatchObject({ isOpen: true, openTime: '06:00', closeTime: '22:00' });
  });

  it('PUT saves the 7-day schedule and GET reflects it', async () => {
    const { venueId, token } = await ownerVenueAndToken();

    await request(app.getHttpServer())
      .put(`/venues/mine/${venueId}/operating-hours`)
      .set('Authorization', `Bearer ${token}`)
      .send(sevenDays())
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/operating-hours`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const sunday = response.body.find((d: { dayOfWeek: number }) => d.dayOfWeek === 0);
    expect(sunday).toMatchObject({ isOpen: false, openTime: null, closeTime: null });
    const monday = response.body.find((d: { dayOfWeek: number }) => d.dayOfWeek === 1);
    expect(monday).toMatchObject({ isOpen: true, openTime: '07:00', closeTime: '21:00' });
  });

  it('PUT rejects a payload with fewer than 7 days', async () => {
    const { venueId, token } = await ownerVenueAndToken();

    await request(app.getHttpServer())
      .put(`/venues/mine/${venueId}/operating-hours`)
      .set('Authorization', `Bearer ${token}`)
      .send(sevenDays().slice(0, 6))
      .expect(400);
  });

  it('rejects a venue that does not belong to the caller', async () => {
    const { venueId } = await ownerVenueAndToken();
    const otherOwner = await createUser(dataSource, 'oh-other@test.com', UserRole.OWNER);
    const otherToken = await loginAs(app, 'oh-other@test.com');

    await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/operating-hours`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });
});
```

- [ ] **Step 3: Run e2e test to verify it fails**

Run: `npm run test:e2e -- venue-operating-hours.e2e-spec.ts` (from `apps/api/`)
Expected: FAIL — 404, the routes don't exist yet.

- [ ] **Step 4: Add the controller endpoints**

In `apps/api/src/courts/venues.controller.ts`, add `Put` and `ParseArrayPipe` to the `@nestjs/common` import list at the top:

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
```

Add this import alongside the other DTO imports:

```ts
import { OperatingHourItemDto } from './dto/operating-hour-item.dto';
```

Add these two endpoints right after the existing `update()` method (after the `Patch('mine/:id')` handler, before `setDefault`):

```ts
  @Get('mine/:id/operating-hours')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  getOperatingHours(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
  ) {
    return this.venuesService.getOperatingHours(effectiveOwnerId, id);
  }

  @Put('mine/:id/operating-hours')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  setOperatingHours(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
    @Body(new ParseArrayPipe({ items: OperatingHourItemDto }))
    items: OperatingHourItemDto[],
  ) {
    return this.venuesService.setOperatingHours(effectiveOwnerId, id, items);
  }
```

- [ ] **Step 5: Run e2e test to verify it passes**

Run: `npm run test:e2e -- venue-operating-hours.e2e-spec.ts` (from `apps/api/`)
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/courts/venues.controller.ts apps/api/test/utils/test-app.ts apps/api/test/venue-operating-hours.e2e-spec.ts
git commit -m "feat(api): add GET/PUT /venues/mine/:id/operating-hours"
```

---

### Task 4: Notification settings — entity, migration, service

**Files:**
- Create: `apps/api/src/migrations/1787980000000-CreateNotificationSettings.ts`
- Create: `apps/api/src/notification-settings/entities/notification-settings.entity.ts`
- Create: `apps/api/src/notification-settings/dto/update-notification-settings.dto.ts`
- Create: `apps/api/src/notification-settings/notification-settings.service.ts`
- Test: `apps/api/src/notification-settings/notification-settings.service.spec.ts`

**Interfaces:**
- Produces: `NotificationSettings` entity, `NotificationSettingsView` interface (`{ newBooking: boolean; cancellation: boolean; payment: boolean; dailyReport: boolean }`), `UpdateNotificationSettingsDto`, `NotificationSettingsService.getForOwner(ownerId): Promise<NotificationSettingsView>`, `NotificationSettingsService.update(ownerId, dto): Promise<NotificationSettingsView>`.

- [ ] **Step 1: Write the failing unit test**

Create `apps/api/src/notification-settings/notification-settings.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationSettings } from './entities/notification-settings.entity';

const mockRepository = () => ({
  findOne: jest.fn(),
  create: jest.fn((data: unknown) => data),
  save: jest.fn((data: unknown) => Promise.resolve(data)),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      NotificationSettingsService,
      { provide: getRepositoryToken(NotificationSettings), useFactory: mockRepository },
    ],
  }).compile();

  return {
    service: module.get(NotificationSettingsService),
    repo: module.get(getRepositoryToken(NotificationSettings)) as ReturnType<typeof mockRepository>,
  };
}

describe('NotificationSettingsService.getForOwner', () => {
  it('returns all-true defaults when the owner has no row yet', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue(null);

    const result = await service.getForOwner('owner-1');

    expect(result).toEqual({
      newBooking: true,
      cancellation: true,
      payment: true,
      dailyReport: true,
    });
  });

  it('returns the saved row values when one exists', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      ownerId: 'owner-1',
      newBooking: false,
      cancellation: true,
      payment: true,
      dailyReport: false,
    });

    const result = await service.getForOwner('owner-1');

    expect(result).toEqual({
      newBooking: false,
      cancellation: true,
      payment: true,
      dailyReport: false,
    });
  });
});

describe('NotificationSettingsService.update', () => {
  it('creates a row with defaults merged with the patch on first update', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue(null);

    const result = await service.update('owner-1', { newBooking: false });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'owner-1', newBooking: true }),
    );
    expect(result.newBooking).toBe(false);
    expect(result.cancellation).toBe(true);
  });

  it('only updates fields present in the patch on an existing row', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      ownerId: 'owner-1',
      newBooking: true,
      cancellation: true,
      payment: true,
      dailyReport: true,
    });

    const result = await service.update('owner-1', { payment: false });

    expect(result).toEqual({
      newBooking: true,
      cancellation: true,
      payment: false,
      dailyReport: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- notification-settings.service.spec.ts` (from `apps/api/`)
Expected: FAIL — module/files don't exist yet.

- [ ] **Step 3: Write the migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationSettings1787980000000 implements MigrationInterface {
  name = 'CreateNotificationSettings1787980000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notification_settings" ("owner_id" uuid NOT NULL, "new_booking" boolean NOT NULL DEFAULT true, "cancellation" boolean NOT NULL DEFAULT true, "payment" boolean NOT NULL DEFAULT true, "daily_report" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_notification_settings_owner_id" PRIMARY KEY ("owner_id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notification_settings"`);
  }
}
```

Save as `apps/api/src/migrations/1787980000000-CreateNotificationSettings.ts`.

- [ ] **Step 4: Run the migration**

Run: `npm run migration:run` (from `apps/api/`)
Expected: Output includes `CreateNotificationSettings1787980000000`.

- [ ] **Step 5: Create the entity**

```ts
import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('notification_settings')
export class NotificationSettings {
  @PrimaryColumn({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ name: 'new_booking', default: true })
  newBooking: boolean;

  @Column({ name: 'cancellation', default: true })
  cancellation: boolean;

  @Column({ name: 'payment', default: true })
  payment: boolean;

  @Column({ name: 'daily_report', default: true })
  dailyReport: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

Save as `apps/api/src/notification-settings/entities/notification-settings.entity.ts`.

- [ ] **Step 6: Create the DTO**

```ts
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsBoolean()
  newBooking?: boolean;

  @IsOptional()
  @IsBoolean()
  cancellation?: boolean;

  @IsOptional()
  @IsBoolean()
  payment?: boolean;

  @IsOptional()
  @IsBoolean()
  dailyReport?: boolean;
}
```

Save as `apps/api/src/notification-settings/dto/update-notification-settings.dto.ts`.

- [ ] **Step 7: Create the service**

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationSettings } from './entities/notification-settings.entity';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';

export interface NotificationSettingsView {
  newBooking: boolean;
  cancellation: boolean;
  payment: boolean;
  dailyReport: boolean;
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsView = {
  newBooking: true,
  cancellation: true,
  payment: true,
  dailyReport: true,
};

@Injectable()
export class NotificationSettingsService {
  constructor(
    @InjectRepository(NotificationSettings)
    private readonly repository: Repository<NotificationSettings>,
  ) {}

  async getForOwner(ownerId: string): Promise<NotificationSettingsView> {
    const row = await this.repository.findOne({ where: { ownerId } });
    if (!row) {
      return { ...DEFAULT_NOTIFICATION_SETTINGS };
    }
    return {
      newBooking: row.newBooking,
      cancellation: row.cancellation,
      payment: row.payment,
      dailyReport: row.dailyReport,
    };
  }

  async update(
    ownerId: string,
    dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsView> {
    let row = await this.repository.findOne({ where: { ownerId } });
    if (!row) {
      row = this.repository.create({ ownerId, ...DEFAULT_NOTIFICATION_SETTINGS });
    }
    if (dto.newBooking !== undefined) row.newBooking = dto.newBooking;
    if (dto.cancellation !== undefined) row.cancellation = dto.cancellation;
    if (dto.payment !== undefined) row.payment = dto.payment;
    if (dto.dailyReport !== undefined) row.dailyReport = dto.dailyReport;
    const saved = await this.repository.save(row);
    return {
      newBooking: saved.newBooking,
      cancellation: saved.cancellation,
      payment: saved.payment,
      dailyReport: saved.dailyReport,
    };
  }
}
```

Save as `apps/api/src/notification-settings/notification-settings.service.ts`.

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test -- notification-settings.service.spec.ts` (from `apps/api/`)
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/migrations/1787980000000-CreateNotificationSettings.ts apps/api/src/notification-settings/entities/notification-settings.entity.ts apps/api/src/notification-settings/dto/update-notification-settings.dto.ts apps/api/src/notification-settings/notification-settings.service.ts apps/api/src/notification-settings/notification-settings.service.spec.ts
git commit -m "feat(api): add NotificationSettingsService"
```

---

### Task 5: Notification settings — controller, module, e2e tests

**Files:**
- Create: `apps/api/src/notification-settings/notification-settings.controller.ts`
- Create: `apps/api/src/notification-settings/notification-settings.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/test/utils/test-app.ts`
- Create: `apps/api/test/notification-settings.e2e-spec.ts`

**Interfaces:**
- Consumes: `NotificationSettingsService` (Task 4).
- Produces: `GET /notification-settings/mine`, `PATCH /notification-settings/mine`, `NotificationSettingsModule` (exports `NotificationSettingsService`, importable by other modules in Tasks 7-9).

- [ ] **Step 1: Add the TRUNCATE entry**

In `apps/api/test/utils/test-app.ts`, add `notification_settings` to the `TRUNCATE TABLE` list (after `users` is fine, order doesn't matter for `CASCADE`):

```ts
export async function clearDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  await dataSource.query(
    'TRUNCATE TABLE disputes, payments, booking_slots, bookings, customer_contacts, venue_images, court_images, courts, venues, venue_operating_hours, notification_settings, refresh_tokens, password_reset_tokens, email_verification_tokens, users RESTART IDENTITY CASCADE',
  );
}
```

- [ ] **Step 2: Write the failing e2e test**

Create `apps/api/test/notification-settings.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { createUser, loginAs } from './utils/owner-fixtures';
import { UserRole } from '../src/users/entities/user.entity';

describe('Notification settings (e2e)', () => {
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

  async function ownerAndToken(email: string) {
    const owner = await createUser(dataSource, email, UserRole.OWNER);
    const token = await loginAs(app, email);
    return { ownerId: owner.id, token };
  }

  it('GET returns all-true defaults when never configured', async () => {
    const { token } = await ownerAndToken('ns-owner1@test.com');

    const response = await request(app.getHttpServer())
      .get('/notification-settings/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      newBooking: true,
      cancellation: true,
      payment: true,
      dailyReport: true,
    });
  });

  it('PATCH updates only the given fields and GET reflects it', async () => {
    const { token } = await ownerAndToken('ns-owner2@test.com');

    await request(app.getHttpServer())
      .patch('/notification-settings/mine')
      .set('Authorization', `Bearer ${token}`)
      .send({ newBooking: false })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/notification-settings/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      newBooking: false,
      cancellation: true,
      payment: true,
      dailyReport: true,
    });
  });

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer()).get('/notification-settings/mine').expect(401);
  });
});
```

- [ ] **Step 3: Run e2e test to verify it fails**

Run: `npm run test:e2e -- notification-settings.e2e-spec.ts` (from `apps/api/`)
Expected: FAIL — 404, routes don't exist.

- [ ] **Step 4: Create the controller**

```ts
import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { NotificationSettingsService } from './notification-settings.service';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';

@Controller('notification-settings')
export class NotificationSettingsController {
  constructor(private readonly notificationSettingsService: NotificationSettingsService) {}

  @Get('mine')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  getMine(@EffectiveOwnerId() effectiveOwnerId: string) {
    return this.notificationSettingsService.getForOwner(effectiveOwnerId);
  }

  @Patch('mine')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  updateMine(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.notificationSettingsService.update(effectiveOwnerId, dto);
  }
}
```

Save as `apps/api/src/notification-settings/notification-settings.controller.ts`.

- [ ] **Step 5: Create the module**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationSettings } from './entities/notification-settings.entity';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationSettingsController } from './notification-settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationSettings])],
  controllers: [NotificationSettingsController],
  providers: [NotificationSettingsService],
  exports: [NotificationSettingsService],
})
export class NotificationSettingsModule {}
```

Save as `apps/api/src/notification-settings/notification-settings.module.ts`.

- [ ] **Step 6: Wire the module into `AppModule`**

In `apps/api/src/app.module.ts`, add the import:

```ts
import { NotificationSettingsModule } from './notification-settings/notification-settings.module';
```

Add `NotificationSettingsModule` to the `imports` array (after `StaffModule`):

```ts
    StaffModule,
    NotificationSettingsModule,
```

- [ ] **Step 7: Run e2e test to verify it passes**

Run: `npm run test:e2e -- notification-settings.e2e-spec.ts` (from `apps/api/`)
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/notification-settings/notification-settings.controller.ts apps/api/src/notification-settings/notification-settings.module.ts apps/api/src/app.module.ts apps/api/test/utils/test-app.ts apps/api/test/notification-settings.e2e-spec.ts
git commit -m "feat(api): add GET/PATCH /notification-settings/mine"
```

---

### Task 6: NotificationsService — new owner-facing templates

**Files:**
- Modify: `apps/api/src/notifications/notifications.service.ts`
- Test: `apps/api/src/notifications/notifications.service.spec.ts`

**Interfaces:**
- Produces: `NotificationsService.notifyBookingCancelledForOwner(params)`, `NotificationsService.notifyPaymentConfirmedForOwner(params)`, `NotificationsService.notifyDailyReport(params)`.

- [ ] **Step 1: Write the failing unit tests**

Add these `describe` blocks at the end of `apps/api/src/notifications/notifications.service.spec.ts`:

```ts
describe('NotificationsService.notifyBookingCancelledForOwner', () => {
  it('sends the owner an email when a customer cancels', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyBookingCancelledForOwner({
      to: 'owner@test.com',
      venueName: 'Venue A',
      courtName: 'Sân 1',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'owner@test.com',
      'Khách hàng đã huỷ booking',
      expect.stringContaining('Sân 1'),
    );
  });
});

describe('NotificationsService.notifyPaymentConfirmedForOwner', () => {
  it('sends the owner an email with the amount received', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyPaymentConfirmedForOwner({
      to: 'owner@test.com',
      venueName: 'Venue A',
      courtName: 'Sân 1',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 150000,
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'owner@test.com',
      'Đã nhận thanh toán',
      expect.stringContaining('150.000'),
    );
  });
});

describe('NotificationsService.notifyDailyReport', () => {
  it('sends the owner a summary email', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyDailyReport({
      to: 'owner@test.com',
      bookingsCount: 5,
      revenue: 500000,
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'owner@test.com',
      'Báo cáo ngày',
      expect.stringContaining('500.000'),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- notifications.service.spec.ts` (from `apps/api/`)
Expected: FAIL — the 3 methods don't exist yet.

- [ ] **Step 3: Add the interfaces and methods**

In `apps/api/src/notifications/notifications.service.ts`, add these interfaces right after the existing `DisputeRejectionParams` interface:

```ts
export interface BookingCancelledForOwnerParams {
  to: string;
  venueName: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface PaymentConfirmedForOwnerParams {
  to: string;
  venueName: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
}

export interface DailyReportParams {
  to: string;
  bookingsCount: number;
  revenue: number;
}
```

Add these methods to the `NotificationsService` class, right before the `private async sendSafely(...)` method:

```ts
  notifyBookingCancelledForOwner(params: BookingCancelledForOwnerParams): Promise<void> {
    const html = `<p>Booking sau đã bị khách hàng huỷ:<br/>
Sân: ${params.courtName} - ${params.venueName}<br/>
Ngày: ${params.date}, ${params.startTime} - ${params.endTime}</p>`;
    return this.sendSafely(params.to, 'Khách hàng đã huỷ booking', html);
  }

  notifyPaymentConfirmedForOwner(params: PaymentConfirmedForOwnerParams): Promise<void> {
    const html = `<p>Bạn vừa nhận thanh toán cho booking:<br/>
Sân: ${params.courtName} - ${params.venueName}<br/>
Ngày: ${params.date}, ${params.startTime} - ${params.endTime}<br/>
Số tiền: ${currencyFormatter.format(params.totalPrice)} đ</p>`;
    return this.sendSafely(params.to, 'Đã nhận thanh toán', html);
  }

  notifyDailyReport(params: DailyReportParams): Promise<void> {
    const html = `<p>Báo cáo hôm nay:<br/>
Số lượt đặt sân: ${params.bookingsCount}<br/>
Doanh thu: ${currencyFormatter.format(params.revenue)} đ</p>`;
    return this.sendSafely(params.to, 'Báo cáo ngày', html);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- notifications.service.spec.ts` (from `apps/api/`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/notifications/notifications.service.ts apps/api/src/notifications/notifications.service.spec.ts
git commit -m "feat(api): add owner-facing cancellation/payment/daily-report email templates"
```

---

### Task 7: Bookings retrofit — gate new-booking, add cancellation-to-owner

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts`
- Modify: `apps/api/src/bookings/bookings.module.ts`
- Test: `apps/api/src/bookings/bookings.service.spec.ts`
- Test: `apps/api/test/bookings.e2e-spec.ts`

**Interfaces:**
- Consumes: `NotificationSettingsService.getForOwner(ownerId)` (Task 4), `NotificationsService.notifyBookingCancelledForOwner` (Task 6).
- Produces: `BookingsService` now takes `notificationSettingsService: NotificationSettingsService` as a constructor dependency.

- [ ] **Step 1: Write the failing unit tests**

In `apps/api/src/bookings/bookings.service.spec.ts`, add the import:

```ts
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
```

Add a mock factory near the other `mock*Service` functions:

```ts
const mockNotificationSettingsService = () => ({
  getForOwner: jest.fn().mockResolvedValue({
    newBooking: true,
    cancellation: true,
    payment: true,
    dailyReport: true,
  }),
});
```

Add the provider wherever `buildTestingModule()` constructs the `TestingModule` (find the `providers: [...]` array that includes `BookingsService`) and add it to the returned object — search the file for `mockNotificationsService` usage to find the exact spot, then add alongside it:

```ts
      { provide: NotificationSettingsService, useFactory: mockNotificationSettingsService },
```

```ts
    notificationSettingsService: module.get(NotificationSettingsService) as ReturnType<
      typeof mockNotificationSettingsService
    >,
```

Find the existing test(s) for `BookingsService.create` (search for `describe('BookingsService.create'` or similar — if tests aren't grouped in a `describe`, find the `it(...)` blocks that call `service.create(...)`) and add these two new tests near them:

```ts
describe('BookingsService.create — owner notification gating', () => {
  it('does not call notifyNewBookingForOwner when the setting is off', async () => {
    const {
      service,
      courtsService,
      venuesService,
      usersService,
      dataSource,
      notificationsService,
      notificationSettingsService,
    } = await buildTestingModule();
    notificationSettingsService.getForOwner.mockResolvedValue({
      newBooking: false,
      cancellation: true,
      payment: true,
      dailyReport: true,
    });
    courtsService.findByIdOrThrow.mockResolvedValue({
      id: 'court-1',
      name: 'Sân 1',
      venueId: 'venue-1',
      status: 'active',
      openTime: '06:00',
      closeTime: '22:00',
      slotDurationMinutes: 60,
    });
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      status: 'active',
      name: 'Venue A',
      email: null,
    });
    usersService.findById.mockImplementation((id: string) =>
      id === 'owner-1'
        ? Promise.resolve({ id: 'owner-1', email: 'owner@test.com', fullName: 'Owner' })
        : Promise.resolve({ id, email: 'customer@test.com', fullName: 'Customer', phone: null }),
    );
    dataSource.transaction.mockImplementation((cb: (m: unknown) => unknown) => cb(buildMockManager()));

    await service.create('customer-1', {
      courtId: 'court-1',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
    });

    expect(notificationsService.notifyNewBookingForOwner).not.toHaveBeenCalled();
    expect(notificationsService.notifyBookingConfirmed).toHaveBeenCalled();
  });

  it('sends to venue.email when set, falling back to owner.email otherwise', async () => {
    const {
      service,
      courtsService,
      venuesService,
      usersService,
      dataSource,
      notificationsService,
    } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue({
      id: 'court-1',
      name: 'Sân 1',
      venueId: 'venue-1',
      status: 'active',
      openTime: '06:00',
      closeTime: '22:00',
      slotDurationMinutes: 60,
    });
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      status: 'active',
      name: 'Venue A',
      email: 'venue@test.com',
    });
    usersService.findById.mockImplementation((id: string) =>
      id === 'owner-1'
        ? Promise.resolve({ id: 'owner-1', email: 'owner@test.com', fullName: 'Owner' })
        : Promise.resolve({ id, email: 'customer@test.com', fullName: 'Customer', phone: null }),
    );
    dataSource.transaction.mockImplementation((cb: (m: unknown) => unknown) => cb(buildMockManager()));

    await service.create('customer-1', {
      courtId: 'court-1',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
    });

    expect(notificationsService.notifyNewBookingForOwner).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'venue@test.com' }),
    );
  });
});
```

Note: `courtsService`, `venuesService`, `usersService`, `dataSource`, `notificationsService` must already be returned by `buildTestingModule()` in this file — confirm by reading its return object; add `notificationSettingsService` to it if not already covered by the step above.

Find the `describe` block covering `BookingsService`'s cancel flow (search for `'BookingsService.cancelByCustomer'` or wherever the cancel-related tests live) and add:

```ts
describe('BookingsService cancel — owner notification', () => {
  it('notifies the owner when a customer cancels and the setting is on', async () => {
    const {
      service,
      bookingsRepository,
      courtsService,
      venuesService,
      usersService,
      dataSource,
      notificationsService,
      notificationSettingsService,
    } = await buildTestingModule();
    const booking = {
      id: 'booking-1',
      customerId: 'customer-1',
      courtId: 'court-1',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      status: 'confirmed',
    };
    bookingsRepository.findOne.mockResolvedValue(booking);
    courtsService.findByIdOrThrow.mockResolvedValue({ id: 'court-1', name: 'Sân 1', venueId: 'venue-1' });
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      name: 'Venue A',
      email: null,
      cancellationCutoffHours: 0,
    });
    usersService.findById.mockImplementation((id: string) =>
      id === 'owner-1'
        ? Promise.resolve({ id: 'owner-1', email: 'owner@test.com', fullName: 'Owner' })
        : Promise.resolve({ id, email: 'customer@test.com', fullName: 'Customer' }),
    );
    dataSource.transaction.mockImplementation((cb: (m: unknown) => unknown) => cb(buildMockManager()));

    await service.cancelByCustomer('customer-1', 'booking-1');

    expect(notificationSettingsService.getForOwner).toHaveBeenCalledWith('owner-1');
    expect(notificationsService.notifyBookingCancelledForOwner).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@test.com' }),
    );
  });

  it('does not notify the owner when the owner cancels their own booking', async () => {
    const {
      service,
      bookingsRepository,
      courtsService,
      venuesService,
      usersService,
      dataSource,
      notificationsService,
    } = await buildTestingModule();
    const booking = {
      id: 'booking-1',
      customerId: 'customer-1',
      courtId: 'court-1',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      status: 'confirmed',
    };
    bookingsRepository.findOne.mockResolvedValue(booking);
    courtsService.findByIdOrThrow.mockResolvedValue({ id: 'court-1', name: 'Sân 1', venueId: 'venue-1' });
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      name: 'Venue A',
      email: null,
      cancellationCutoffHours: 0,
    });
    usersService.findById.mockResolvedValue({ id: 'customer-1', email: 'customer@test.com', fullName: 'Customer' });
    dataSource.transaction.mockImplementation((cb: (m: unknown) => unknown) => cb(buildMockManager()));

    await service.cancelByOwner('owner-1', 'venue-1', 'booking-1');

    expect(notificationsService.notifyBookingCancelledForOwner).not.toHaveBeenCalled();
  });
});
```

Note: this second test calls `cancelByOwner`, which internally calls `findByIdForOwnerOrThrow` — check whether that path is already mockable in this test file (it uses `courtsService.findByVenueForOwner` under the hood per the source). If `courtsService.findByVenueForOwner` isn't already mocked to return a court list in this file's shared setup, add `courtsService.findByVenueForOwner.mockResolvedValue([{ id: 'court-1' }]);` before the `bookingsRepository.findOne.mockResolvedValue(booking);` line in that test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- bookings.service.spec.ts` (from `apps/api/`)
Expected: FAIL — `NotificationSettingsService` isn't injected into `BookingsService` yet, `notifyBookingCancelledForOwner` is never called.

- [ ] **Step 3: Wire the dependency and update `create()`**

In `apps/api/src/bookings/bookings.service.ts`, add the import:

```ts
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
```

Add the constructor parameter (after `notificationsService`):

```ts
    private readonly notificationSettingsService: NotificationSettingsService,
```

Replace the `notifyNewBookingForOwner` call in `create()`:

```ts
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
```

with:

```ts
    const notificationSettings = await this.notificationSettingsService.getForOwner(venue.ownerId);
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
```

- [ ] **Step 4: Add the cancellation-to-owner call**

In the private `cancel()` method, add this block right after the existing `if (booking.customerId) { ... notifyBookingCancelled ... }` block, before `return saved;`:

```ts
    const cancelledByCustomer = cancelledBy === booking.customerId;
    if (cancelledByCustomer) {
      const notificationSettings = await this.notificationSettingsService.getForOwner(venue.ownerId);
      if (notificationSettings.cancellation) {
        const owner = await this.usersService.findById(venue.ownerId);
        await this.notificationsService.notifyBookingCancelledForOwner({
          to: venue.email ?? owner?.email ?? '',
          venueName: venue.name,
          courtName: court.name,
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
        });
      }
    }
```

- [ ] **Step 5: Wire `NotificationSettingsModule` into `BookingsModule`**

In `apps/api/src/bookings/bookings.module.ts`, add the import:

```ts
import { NotificationSettingsModule } from '../notification-settings/notification-settings.module';
```

Add it to the `imports` array (after `NotificationsModule`):

```ts
    NotificationsModule,
    NotificationSettingsModule,
```

- [ ] **Step 6: Run unit tests to verify they pass**

Run: `npm test -- bookings.service.spec.ts` (from `apps/api/`)
Expected: PASS

- [ ] **Step 7: Add e2e coverage**

In `apps/api/test/bookings.e2e-spec.ts`, add this test at the end of the top-level `describe` block:

```ts
  it('does not email the owner on cancellation when the setting is off, but does email the customer', async () => {
    const owner = await createActiveUserAndLogin('bookingsowner-notif@test.com', UserRole.OWNER);
    const { venueId, courtId } = await createActiveVenueAndCourt(owner.userId, 0);
    const customer = await createActiveUserAndLogin('bookingscustomer-notif@test.com', UserRole.CUSTOMER);

    await request(app.getHttpServer())
      .patch('/notification-settings/mine')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ cancellation: false })
      .expect(200);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ courtId, date: '2099-05-01', startTime: '08:00', endTime: '09:00' })
      .expect(201);

    mockMailService.send.mockClear();

    await request(app.getHttpServer())
      .post(`/bookings/${createResponse.body.id}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(201);

    expect(mockMailService.send).toHaveBeenCalledWith(
      'bookingscustomer-notif@test.com',
      'Booking đã được huỷ',
      expect.any(String),
    );
    expect(mockMailService.send).not.toHaveBeenCalledWith(
      'bookingsowner-notif@test.com',
      'Khách hàng đã huỷ booking',
      expect.any(String),
    );
  });

  it('does not email the owner on a new booking when the setting is off, but does email the customer', async () => {
    const owner = await createActiveUserAndLogin('bookingsowner-notif2@test.com', UserRole.OWNER);
    const { courtId } = await createActiveVenueAndCourt(owner.userId);
    const customer = await createActiveUserAndLogin('bookingscustomer-notif2@test.com', UserRole.CUSTOMER);

    await request(app.getHttpServer())
      .patch('/notification-settings/mine')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ newBooking: false })
      .expect(200);

    mockMailService.send.mockClear();

    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ courtId, date: '2099-05-02', startTime: '08:00', endTime: '09:00' })
      .expect(201);

    expect(mockMailService.send).toHaveBeenCalledWith(
      'bookingscustomer-notif2@test.com',
      'Xác nhận đặt sân',
      expect.any(String),
    );
    expect(mockMailService.send).not.toHaveBeenCalledWith(
      'bookingsowner-notif2@test.com',
      'Có booking mới',
      expect.any(String),
    );
  });
```

Check the top of `apps/api/test/bookings.e2e-spec.ts` for how `mockMailService` is imported (it's exported from `./utils/test-app`, same as `createTestApp`/`clearDatabase`) — if the file doesn't already import it, add `mockMailService` to the existing `import { createTestApp, clearDatabase } from './utils/test-app';` line.

- [ ] **Step 8: Run e2e test to verify it passes**

Run: `npm run test:e2e -- bookings.e2e-spec.ts` (from `apps/api/`)
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.module.ts apps/api/src/bookings/bookings.service.spec.ts apps/api/test/bookings.e2e-spec.ts
git commit -m "feat(api): gate new-booking email and add cancellation-to-owner email"
```

---

### Task 8: Payments retrofit — add payment-to-owner

**Files:**
- Modify: `apps/api/src/payments/payments.service.ts`
- Modify: `apps/api/src/payments/payments.module.ts`
- Test: `apps/api/src/payments/payments.service.spec.ts`
- Test: `apps/api/test/payments.e2e-spec.ts`

**Interfaces:**
- Consumes: `NotificationSettingsService.getForOwner(ownerId)` (Task 4), `NotificationsService.notifyPaymentConfirmedForOwner` (Task 6).
- Produces: `PaymentsService` now takes `notificationSettingsService: NotificationSettingsService` and needs `venue`/`court` info for the new call (fetched via `venuesService`/`courtsService`, both newly injected).

- [ ] **Step 1: Write the failing unit test**

In `apps/api/src/payments/payments.service.spec.ts`, add these imports:

```ts
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { VenuesService } from '../courts/venues.service';
import { CourtsService } from '../courts/courts.service';
```

Add mock factories near the existing ones:

```ts
const mockNotificationSettingsService = () => ({
  getForOwner: jest.fn().mockResolvedValue({
    newBooking: true,
    cancellation: true,
    payment: true,
    dailyReport: true,
  }),
});

const mockVenuesService = () => ({
  findByIdOrThrow: jest.fn(),
});

const mockCourtsService = () => ({
  findByIdOrThrow: jest.fn(),
});
```

In `buildTestingModule()`, add the 3 providers and return entries:

```ts
      { provide: NotificationSettingsService, useFactory: mockNotificationSettingsService },
      { provide: VenuesService, useFactory: mockVenuesService },
      { provide: CourtsService, useFactory: mockCourtsService },
```

```ts
    notificationSettingsService: module.get(NotificationSettingsService) as ReturnType<
      typeof mockNotificationSettingsService
    >,
    venuesService: module.get(VenuesService) as ReturnType<typeof mockVenuesService>,
    courtsService: module.get(CourtsService) as ReturnType<typeof mockCourtsService>,
```

Add this `describe` block at the end of the file:

```ts
describe('PaymentsService.markPaid — owner notification', () => {
  it('notifies the owner when the setting is on', async () => {
    const {
      service,
      bookingsService,
      paymentsRepo,
      usersService,
      notificationsService,
      notificationSettingsService,
      venuesService,
      courtsService,
    } = await buildTestingModule();
    const booking = {
      id: 'booking-1',
      customerId: 'customer-1',
      courtId: 'court-1',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 100000,
    };
    bookingsService.findByIdForOwnerOrThrow.mockResolvedValue(booking);
    paymentsRepo.findOne.mockResolvedValue({ id: 'payment-1', bookingId: 'booking-1', status: 'unpaid' });
    usersService.findById.mockImplementation((id: string) =>
      id === 'owner-1'
        ? Promise.resolve({ id: 'owner-1', email: 'owner@test.com' })
        : Promise.resolve({ id, email: 'customer@test.com' }),
    );
    courtsService.findByIdOrThrow.mockResolvedValue({ id: 'court-1', name: 'Sân 1', venueId: 'venue-1' });
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      name: 'Venue A',
      email: null,
    });

    await service.markPaid('owner-1', 'venue-1', 'booking-1', 'note');

    expect(notificationSettingsService.getForOwner).toHaveBeenCalledWith('owner-1');
    expect(notificationsService.notifyPaymentConfirmedForOwner).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@test.com', totalPrice: 100000 }),
    );
  });

  it('does not notify the owner when the setting is off', async () => {
    const {
      service,
      bookingsService,
      paymentsRepo,
      usersService,
      notificationsService,
      notificationSettingsService,
      venuesService,
      courtsService,
    } = await buildTestingModule();
    notificationSettingsService.getForOwner.mockResolvedValue({
      newBooking: true,
      cancellation: true,
      payment: false,
      dailyReport: true,
    });
    const booking = {
      id: 'booking-1',
      customerId: 'customer-1',
      courtId: 'court-1',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 100000,
    };
    bookingsService.findByIdForOwnerOrThrow.mockResolvedValue(booking);
    paymentsRepo.findOne.mockResolvedValue({ id: 'payment-1', bookingId: 'booking-1', status: 'unpaid' });
    usersService.findById.mockResolvedValue({ id: 'customer-1', email: 'customer@test.com' });
    courtsService.findByIdOrThrow.mockResolvedValue({ id: 'court-1', name: 'Sân 1', venueId: 'venue-1' });
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      name: 'Venue A',
      email: null,
    });

    await service.markPaid('owner-1', 'venue-1', 'booking-1', 'note');

    expect(notificationsService.notifyPaymentConfirmedForOwner).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- payments.service.spec.ts` (from `apps/api/`)
Expected: FAIL — `VenuesService`/`CourtsService`/`NotificationSettingsService` aren't injected into `PaymentsService` yet.

- [ ] **Step 3: Wire the dependencies and update `markPaid()`**

In `apps/api/src/payments/payments.service.ts`, add the imports:

```ts
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { VenuesService } from '../courts/venues.service';
import { CourtsService } from '../courts/courts.service';
```

Add the constructor parameters (after `notificationsService`):

```ts
    private readonly notificationSettingsService: NotificationSettingsService,
    private readonly venuesService: VenuesService,
    private readonly courtsService: CourtsService,
```

Replace the body of `markPaid()` from the existing `if (booking.customerId) { ... }` block onward:

```ts
    if (booking.customerId) {
      const customer = await this.usersService.findById(booking.customerId);
      await this.notificationsService.notifyPaymentConfirmed({
        to: customer?.email ?? '',
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        totalPrice: booking.totalPrice,
      });
    }

    const notificationSettings = await this.notificationSettingsService.getForOwner(ownerId);
    if (notificationSettings.payment) {
      const [court, owner] = await Promise.all([
        this.courtsService.findByIdOrThrow(booking.courtId),
        this.usersService.findById(ownerId),
      ]);
      const venue = await this.venuesService.findByIdOrThrow(court.venueId);
      await this.notificationsService.notifyPaymentConfirmedForOwner({
        to: venue.email ?? owner?.email ?? '',
        venueName: venue.name,
        courtName: court.name,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        totalPrice: booking.totalPrice,
      });
    }

    return saved;
  }
```

(This replaces everything from the existing `if (booking.customerId) {` through the method's closing `return saved; }` — the `payment.status = ...` / `payment.paidAt = ...` / `const saved = await this.paymentsRepository.save(payment);` lines above it are unchanged.)

- [ ] **Step 4: Wire the new module dependencies into `PaymentsModule`**

In `apps/api/src/payments/payments.module.ts`, add the imports:

```ts
import { NotificationSettingsModule } from '../notification-settings/notification-settings.module';
import { CourtsModule } from '../courts/courts.module';
```

Add them to the `imports` array:

```ts
    NotificationsModule,
    NotificationSettingsModule,
    CourtsModule,
```

(`CourtsModule` already exports `VenuesService` and `CourtsService`, confirmed in Task-independent code at `apps/api/src/courts/courts.module.ts`'s `exports: [VenuesService, CourtsService]`.)

- [ ] **Step 5: Run unit tests to verify they pass**

Run: `npm test -- payments.service.spec.ts` (from `apps/api/`)
Expected: PASS

- [ ] **Step 6: Add e2e coverage**

In `apps/api/test/payments.e2e-spec.ts`, add this test at the end of the top-level `describe` block:

```ts
  it('emails the owner on mark-paid when the setting is on', async () => {
    const owner = await createActiveUserAndLogin('payowner-notif@test.com', UserRole.OWNER);
    const { venueId, courtId } = await createActiveVenueAndCourt(owner.userId);
    const customer = await createActiveUserAndLogin('paycustomer-notif@test.com', UserRole.CUSTOMER);
    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ courtId, date: '2099-06-01', startTime: '08:00', endTime: '09:00' })
      .expect(201);

    mockMailService.send.mockClear();

    await request(app.getHttpServer())
      .post(`/venues/mine/${venueId}/bookings/${createResponse.body.id}/payment/mark-paid`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ note: 'Tiền mặt' })
      .expect(201);

    expect(mockMailService.send).toHaveBeenCalledWith(
      'payowner-notif@test.com',
      'Đã nhận thanh toán',
      expect.any(String),
    );
  });
```

- [ ] **Step 7: Run e2e test to verify it passes**

Run: `npm run test:e2e -- payments.e2e-spec.ts` (from `apps/api/`)
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/payments/payments.service.ts apps/api/src/payments/payments.module.ts apps/api/src/payments/payments.service.spec.ts apps/api/test/payments.e2e-spec.ts
git commit -m "feat(api): add payment-to-owner email, gated by notification settings"
```

---

### Task 9: Daily report cron

**Files:**
- Modify: `apps/api/src/users/users.service.ts`
- Test: `apps/api/src/users/users.service.spec.ts`
- Modify: `apps/api/src/dashboard/dashboard.module.ts`
- Create: `apps/api/src/notification-settings/daily-report.scheduler.ts`
- Test: `apps/api/src/notification-settings/daily-report.scheduler.spec.ts`
- Modify: `apps/api/src/notification-settings/notification-settings.module.ts`
- Test: `apps/api/test/notification-settings.e2e-spec.ts`

**Interfaces:**
- Consumes: `DashboardService.getSummary(ownerId): Promise<DashboardSummary>` (already exists, returns `{ todayBookingsCount, todayRevenue, ... }`), `VenuesService.findMineByOwner(ownerId)` (already exists), `NotificationSettingsService.getForOwner` (Task 4), `NotificationsService.notifyDailyReport` (Task 6).
- Produces: `UsersService.findActiveOwners(): Promise<User[]>`, `DailyReportScheduler.sendDailyReports(): Promise<void>` (also runs on `@Cron('0 23 * * *')`).

- [ ] **Step 1: Write the failing unit test for `findActiveOwners`**

In `apps/api/src/users/users.service.spec.ts`, add this `describe` block at the end of the file:

```ts
describe('UsersService.findActiveOwners', () => {
  it('queries for active owners', async () => {
    const { service, repo } = await buildTestingModule();
    repo.find.mockResolvedValue([{ id: 'owner-1', role: UserRole.OWNER, status: UserStatus.ACTIVE }]);

    const result = await service.findActiveOwners();

    expect(repo.find).toHaveBeenCalledWith({
      where: { role: UserRole.OWNER, status: UserStatus.ACTIVE },
    });
    expect(result).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- users.service.spec.ts` (from `apps/api/`)
Expected: FAIL — `findActiveOwners` doesn't exist.

- [ ] **Step 3: Add `findActiveOwners` to `UsersService`**

In `apps/api/src/users/users.service.ts`, add this method right after `findPendingOwners()`:

```ts
  findActiveOwners(): Promise<User[]> {
    return this.usersRepository.find({
      where: { role: UserRole.OWNER, status: UserStatus.ACTIVE },
    });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- users.service.spec.ts` (from `apps/api/`)
Expected: PASS

- [ ] **Step 5: Export `DashboardService` from `DashboardModule`**

In `apps/api/src/dashboard/dashboard.module.ts`, add an `exports` array:

```ts
@Module({
  imports: [CourtsModule, TypeOrmModule.forFeature([Court, Booking, Payment])],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
```

- [ ] **Step 6: Write the failing unit test for the scheduler**

Create `apps/api/src/notification-settings/daily-report.scheduler.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { DailyReportScheduler } from './daily-report.scheduler';
import { NotificationSettingsService } from './notification-settings.service';
import { UsersService } from '../users/users.service';
import { VenuesService } from '../courts/venues.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserRole, UserStatus } from '../users/entities/user.entity';

const mockNotificationSettingsService = () => ({ getForOwner: jest.fn() });
const mockUsersService = () => ({ findActiveOwners: jest.fn() });
const mockVenuesService = () => ({ findMineByOwner: jest.fn() });
const mockDashboardService = () => ({ getSummary: jest.fn() });
const mockNotificationsService = () => ({ notifyDailyReport: jest.fn().mockResolvedValue(undefined) });

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DailyReportScheduler,
      { provide: NotificationSettingsService, useFactory: mockNotificationSettingsService },
      { provide: UsersService, useFactory: mockUsersService },
      { provide: VenuesService, useFactory: mockVenuesService },
      { provide: DashboardService, useFactory: mockDashboardService },
      { provide: NotificationsService, useFactory: mockNotificationsService },
    ],
  }).compile();

  return {
    scheduler: module.get(DailyReportScheduler),
    notificationSettingsService: module.get(NotificationSettingsService) as ReturnType<
      typeof mockNotificationSettingsService
    >,
    usersService: module.get(UsersService) as ReturnType<typeof mockUsersService>,
    venuesService: module.get(VenuesService) as ReturnType<typeof mockVenuesService>,
    dashboardService: module.get(DashboardService) as ReturnType<typeof mockDashboardService>,
    notificationsService: module.get(NotificationsService) as ReturnType<typeof mockNotificationsService>,
  };
}

describe('DailyReportScheduler.sendDailyReports', () => {
  it('sends a report for an active owner with dailyReport on and at least one venue', async () => {
    const {
      scheduler,
      notificationSettingsService,
      usersService,
      venuesService,
      dashboardService,
      notificationsService,
    } = await buildTestingModule();
    usersService.findActiveOwners.mockResolvedValue([
      { id: 'owner-1', email: 'owner1@test.com', role: UserRole.OWNER, status: UserStatus.ACTIVE },
    ]);
    notificationSettingsService.getForOwner.mockResolvedValue({
      newBooking: true,
      cancellation: true,
      payment: true,
      dailyReport: true,
    });
    venuesService.findMineByOwner.mockResolvedValue([{ id: 'venue-1' }]);
    dashboardService.getSummary.mockResolvedValue({
      todayBookingsCount: 3,
      todayRevenue: 300000,
    });

    await scheduler.sendDailyReports();

    expect(notificationsService.notifyDailyReport).toHaveBeenCalledWith({
      to: 'owner1@test.com',
      bookingsCount: 3,
      revenue: 300000,
    });
  });

  it('skips owners with dailyReport off', async () => {
    const { scheduler, notificationSettingsService, usersService, venuesService, notificationsService } =
      await buildTestingModule();
    usersService.findActiveOwners.mockResolvedValue([
      { id: 'owner-1', email: 'owner1@test.com', role: UserRole.OWNER, status: UserStatus.ACTIVE },
    ]);
    notificationSettingsService.getForOwner.mockResolvedValue({
      newBooking: true,
      cancellation: true,
      payment: true,
      dailyReport: false,
    });

    await scheduler.sendDailyReports();

    expect(venuesService.findMineByOwner).not.toHaveBeenCalled();
    expect(notificationsService.notifyDailyReport).not.toHaveBeenCalled();
  });

  it('skips owners with zero venues', async () => {
    const {
      scheduler,
      notificationSettingsService,
      usersService,
      venuesService,
      dashboardService,
      notificationsService,
    } = await buildTestingModule();
    usersService.findActiveOwners.mockResolvedValue([
      { id: 'owner-1', email: 'owner1@test.com', role: UserRole.OWNER, status: UserStatus.ACTIVE },
    ]);
    notificationSettingsService.getForOwner.mockResolvedValue({
      newBooking: true,
      cancellation: true,
      payment: true,
      dailyReport: true,
    });
    venuesService.findMineByOwner.mockResolvedValue([]);

    await scheduler.sendDailyReports();

    expect(dashboardService.getSummary).not.toHaveBeenCalled();
    expect(notificationsService.notifyDailyReport).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- daily-report.scheduler.spec.ts` (from `apps/api/`)
Expected: FAIL — `DailyReportScheduler` doesn't exist.

- [ ] **Step 8: Create the scheduler**

```ts
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationSettingsService } from './notification-settings.service';
import { UsersService } from '../users/users.service';
import { VenuesService } from '../courts/venues.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DailyReportScheduler {
  constructor(
    private readonly notificationSettingsService: NotificationSettingsService,
    private readonly usersService: UsersService,
    private readonly venuesService: VenuesService,
    private readonly dashboardService: DashboardService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('0 23 * * *')
  async sendDailyReports(): Promise<void> {
    const owners = await this.usersService.findActiveOwners();
    for (const owner of owners) {
      const settings = await this.notificationSettingsService.getForOwner(owner.id);
      if (!settings.dailyReport) {
        continue;
      }
      const venues = await this.venuesService.findMineByOwner(owner.id);
      if (venues.length === 0) {
        continue;
      }
      const summary = await this.dashboardService.getSummary(owner.id);
      await this.notificationsService.notifyDailyReport({
        to: owner.email ?? '',
        bookingsCount: summary.todayBookingsCount,
        revenue: summary.todayRevenue,
      });
    }
  }
}
```

Save as `apps/api/src/notification-settings/daily-report.scheduler.ts`.

- [ ] **Step 9: Register the scheduler in `NotificationSettingsModule`**

In `apps/api/src/notification-settings/notification-settings.module.ts`, add the imports and wire the new dependencies:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationSettings } from './entities/notification-settings.entity';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationSettingsController } from './notification-settings.controller';
import { DailyReportScheduler } from './daily-report.scheduler';
import { UsersModule } from '../users/users.module';
import { CourtsModule } from '../courts/courts.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationSettings]),
    UsersModule,
    CourtsModule,
    DashboardModule,
    NotificationsModule,
  ],
  controllers: [NotificationSettingsController],
  providers: [NotificationSettingsService, DailyReportScheduler],
  exports: [NotificationSettingsService],
})
export class NotificationSettingsModule {}
```

- [ ] **Step 10: Run unit test to verify it passes**

Run: `npm test -- daily-report.scheduler.spec.ts` (from `apps/api/`)
Expected: PASS

- [ ] **Step 11: Add an e2e integration test calling the scheduler directly**

In `apps/api/test/notification-settings.e2e-spec.ts`, add these imports at the top:

```ts
import { createVenue, createCourt, createBooking, payBooking } from './utils/owner-fixtures';
import { DailyReportScheduler } from '../src/notification-settings/daily-report.scheduler';
```

Add this test at the end of the `describe` block:

```ts
  it('DailyReportScheduler.sendDailyReports emails an owner with venues and dailyReport on', async () => {
    const { ownerId, token } = await ownerAndToken('ns-daily@test.com');
    const venue = await createVenue(dataSource, ownerId, 'Sân báo cáo ngày');
    const court = await createCourt(dataSource, venue.id, 'Sân 1');
    const booking = await createBooking(dataSource, court.id, {
      date: new Date().toISOString().slice(0, 10),
      totalPrice: 200000,
    });
    await payBooking(dataSource, booking.id);
    await request(app.getHttpServer())
      .patch('/notification-settings/mine')
      .set('Authorization', `Bearer ${token}`)
      .send({ dailyReport: true })
      .expect(200);

    const scheduler = app.get(DailyReportScheduler);
    await scheduler.sendDailyReports();

    expect(mockMailService.send).toHaveBeenCalledWith(
      'ns-daily@test.com',
      'Báo cáo ngày',
      expect.any(String),
    );
  });
```

Check whether `mockMailService` is already imported in this file's `import { createTestApp, clearDatabase } from './utils/test-app';` line — if not, add it: `import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';`. Also add `mockMailService.send.mockClear();` inside the existing `beforeEach` (after `await clearDatabase(app);`) so this test isn't polluted by mail calls from earlier tests in the file.

- [ ] **Step 12: Run e2e test to verify it passes**

Run: `npm run test:e2e -- notification-settings.e2e-spec.ts` (from `apps/api/`)
Expected: PASS

Note: the booking's `createdAt` (used by `DashboardService.getSummary` for `todayBookingsCount`) is set by the DB on insert, so `createBooking`'s explicit `date` field only affects the booking's calendar `date`, not `createdAt` — since the fixture is created "now", `createdAt` will naturally fall within today's range, so the count assertion isn't needed here; the test only checks that the email was sent.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/users/users.service.spec.ts apps/api/src/dashboard/dashboard.module.ts apps/api/src/notification-settings/daily-report.scheduler.ts apps/api/src/notification-settings/daily-report.scheduler.spec.ts apps/api/src/notification-settings/notification-settings.module.ts apps/api/test/notification-settings.e2e-spec.ts
git commit -m "feat(api): add daily report cron"
```

---

### Task 10: Self-service change password

**Files:**
- Create: `apps/api/src/auth/dto/change-password.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`
- Test: `apps/api/test/auth-change-password.e2e-spec.ts`

**Interfaces:**
- Produces: `AuthService.changePassword(userId, currentPassword, newPassword): Promise<void>`, `POST /auth/change-password` (JWT-protected, unlike its sibling routes).

- [ ] **Step 1: Write the failing unit tests**

Create `apps/api/src/auth/auth.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';

const mockUsersService = () => ({
  findById: jest.fn(),
  updatePassword: jest.fn().mockResolvedValue(undefined),
});
const mockMailService = () => ({});
const mockJwtService = () => ({});
const mockConfigService = () => ({ get: jest.fn() });
const mockRepository = () => ({
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  update: jest.fn().mockResolvedValue(undefined),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: UsersService, useFactory: mockUsersService },
      { provide: MailService, useFactory: mockMailService },
      { provide: JwtService, useFactory: mockJwtService },
      { provide: ConfigService, useFactory: mockConfigService },
      { provide: getRepositoryToken(EmailVerificationToken), useFactory: mockRepository },
      { provide: getRepositoryToken(RefreshToken), useFactory: mockRepository },
      { provide: getRepositoryToken(PasswordResetToken), useFactory: mockRepository },
    ],
  }).compile();

  return {
    service: module.get(AuthService),
    usersService: module.get(UsersService) as ReturnType<typeof mockUsersService>,
    refreshTokenRepo: module.get(getRepositoryToken(RefreshToken)) as ReturnType<typeof mockRepository>,
  };
}

describe('AuthService.changePassword', () => {
  it('rejects when currentPassword does not match', async () => {
    const { service, usersService } = await buildTestingModule();
    const hash = await bcrypt.hash('correct-password', 10);
    usersService.findById.mockResolvedValue({ id: 'user-1', passwordHash: hash });

    await expect(
      service.changePassword('user-1', 'wrong-password', 'new-password123'),
    ).rejects.toThrow(BadRequestException);
    expect(usersService.updatePassword).not.toHaveBeenCalled();
  });

  it('updates the password and revokes all refresh tokens when currentPassword matches', async () => {
    const { service, usersService, refreshTokenRepo } = await buildTestingModule();
    const hash = await bcrypt.hash('correct-password', 10);
    usersService.findById.mockResolvedValue({ id: 'user-1', passwordHash: hash });

    await service.changePassword('user-1', 'correct-password', 'new-password123');

    expect(usersService.updatePassword).toHaveBeenCalledWith('user-1', 'new-password123');
    expect(refreshTokenRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- auth.service.spec.ts` (from `apps/api/`)
Expected: FAIL — `changePassword` doesn't exist on `AuthService`.

- [ ] **Step 3: Create the DTO**

```ts
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
```

Save as `apps/api/src/auth/dto/change-password.dto.ts`.

- [ ] **Step 4: Add `changePassword` and refactor the revoke helper in `AuthService`**

In `apps/api/src/auth/auth.service.ts`, replace the `resetPassword` method's tail — the existing:

```ts
    await this.usersService.updatePassword(tokenRecord.userId, newPassword);

    tokenRecord.usedAt = new Date();
    await this.passwordResetTokens.save(tokenRecord);

    await this.refreshTokenRepository.update(
      { userId: tokenRecord.userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
```

with:

```ts
    await this.usersService.updatePassword(tokenRecord.userId, newPassword);

    tokenRecord.usedAt = new Date();
    await this.passwordResetTokens.save(tokenRecord);

    await this.revokeAllRefreshTokens(tokenRecord.userId);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }
    await this.usersService.updatePassword(userId, newPassword);
    await this.revokeAllRefreshTokens(userId);
  }

  private async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
```

(Note the final `}` — this closes the `AuthService` class, so `changePassword` and `revokeAllRefreshTokens` must be the last two methods in the file, replacing the original closing `}` of `resetPassword` and the class.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- auth.service.spec.ts` (from `apps/api/`)
Expected: PASS

- [ ] **Step 6: Add the controller endpoint**

In `apps/api/src/auth/auth.controller.ts`, add these imports:

```ts
import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthenticatedUser } from './decorators/current-user.decorator';
```

Add this endpoint at the end of the class, right after `resetPassword`, before the closing `}`:

```ts

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.changePassword(user.userId, dto.currentPassword, dto.newPassword);
    return { message: 'Đổi mật khẩu thành công' };
  }
```

- [ ] **Step 7: Write the failing e2e test**

Create `apps/api/test/auth-change-password.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';

describe('Change password (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await clearDatabase(app);
    mockMailService.sendVerificationEmail.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerVerifyAndLogin(email: string, password: string) {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, fullName: 'Change PW User' });
    const call = mockMailService.sendVerificationEmail.mock.calls.find(([to]) => to === email);
    await request(app.getHttpServer()).get('/auth/verify-email').query({ token: call![1] });
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: email, password });
    return {
      accessToken: loginResponse.body.accessToken as string,
      refreshToken: loginResponse.body.refreshToken as string,
    };
  }

  it('changes the password and revokes existing refresh tokens', async () => {
    const { accessToken, refreshToken } = await registerVerifyAndLogin(
      'changepw@test.com',
      'oldpassword1',
    );

    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'oldpassword1', newPassword: 'newpassword1' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: 'changepw@test.com', password: 'oldpassword1' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: 'changepw@test.com', password: 'newpassword1' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('rejects with 400 when currentPassword is wrong', async () => {
    const { accessToken } = await registerVerifyAndLogin('changepw2@test.com', 'oldpassword1');

    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'not-the-right-password', newPassword: 'newpassword1' })
      .expect(400);
  });

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/change-password')
      .send({ currentPassword: 'x', newPassword: 'newpassword1' })
      .expect(401);
  });
});
```

- [ ] **Step 8: Run e2e test to verify it passes**

Run: `npm run test:e2e -- auth-change-password.e2e-spec.ts` (from `apps/api/`)
Expected: PASS

- [ ] **Step 9: Run the full unit and e2e suites to confirm no regressions**

Run: `npm test` (from `apps/api/`)
Expected: PASS, all suites.

Run: `npm run test:e2e` (from `apps/api/`)
Expected: PASS, all suites.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/auth/dto/change-password.dto.ts apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.controller.ts apps/api/src/auth/auth.service.spec.ts apps/api/test/auth-change-password.e2e-spec.ts
git commit -m "feat(api): add POST /auth/change-password"
```
