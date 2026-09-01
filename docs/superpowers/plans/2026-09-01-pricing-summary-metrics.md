# Pricing Page Summary Metrics (§4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement §4 of [2026-08-26-pricing-and-recurring-schedules-design.md](../specs/2026-08-26-pricing-and-recurring-schedules-design.md) — the "Bảng giá" page summary cards: total `pricing_rules`, total active `recurring_schedules`, and estimated monthly recurring revenue.

**Architecture:** `PricingService` gains a `getSummary(ownerId, venueId, courtId?)` method. Per the existing pattern in `DashboardService`/`CustomersService` (both read other modules' entities directly via `TypeOrmModule.forFeature` rather than injecting those modules' services), `PricingModule` adds `RecurringSchedule` to its `TypeOrmModule.forFeature([...])` and `PricingService` gets a new `@InjectRepository(RecurringSchedule)`. This keeps `PricingModule`'s "depends on nothing" property intact (no new module import — `CourtsModule`/`RecurringSchedulesModule` are never imported), matching how `PricingModule` already reads `Court`/`Venue` directly instead of through `CourtsModule`. Along the way, `getOwnedCourtOrThrow`'s inline venue-ownership check is extracted into a private `getOwnedVenue` helper so `getSummary` (which only needs venue-level, not court-level, ownership checking) can reuse it.

**Tech Stack:** NestJS 11, TypeORM 1.x, Jest.

## Global Constraints

- Vietnamese error messages, matching existing style.
- No new migration — `pricing_rules` and `recurring_schedules` tables already exist; this is read-only aggregation.
- Revenue formula uses the exact fraction `52 / 12` (average weeks/month), not the rounded `4.33` from the spec prose — same value, more precise.
- `courtId` query param is optional; when absent, the summary spans every court in the venue.

---

## File Structure

Modify:
- `apps/api/src/pricing/pricing.module.ts` — register `RecurringSchedule` entity
- `apps/api/src/pricing/pricing.service.ts` — `getOwnedVenue` extraction + `getSummary`
- `apps/api/src/pricing/pricing.service.spec.ts`
- `apps/api/src/pricing/pricing.controller.ts` — new `GET` route
- `apps/api/test/pricing-summary.e2e-spec.ts` (new)

---

### Task 1: `PricingService.getSummary`

**Files:**
- Modify: `apps/api/src/pricing/pricing.module.ts`
- Modify: `apps/api/src/pricing/pricing.service.ts`
- Modify: `apps/api/src/pricing/pricing.service.spec.ts`

**Interfaces:**
- Produces: `PricingService.getSummary(ownerId: string, venueId: string, courtId?: string): Promise<{ pricingRulesCount: number; activeRecurringSchedulesCount: number; estimatedMonthlyRecurringRevenue: number }>` (used by Task 2's controller route)

- [ ] **Step 1: Register the `RecurringSchedule` entity in `PricingModule`**

In `apps/api/src/pricing/pricing.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricingRule } from './entities/pricing-rule.entity';
import { Court } from '../courts/entities/court.entity';
import { Venue } from '../courts/entities/venue.entity';
import { RecurringSchedule } from '../recurring-schedules/entities/recurring-schedule.entity';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PricingRule, Court, Venue, RecurringSchedule])],
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
```

- [ ] **Step 2: Update the spec file's mocks for the new repository**

In `apps/api/src/pricing/pricing.service.spec.ts`, add the import and mock factory, and add `find: jest.fn()` to `mockCourtsRepository` (currently only has `findOne`):

```ts
import { RecurringSchedule, RecurringScheduleStatus } from '../recurring-schedules/entities/recurring-schedule.entity';
```

```ts
const mockCourtsRepository = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
});
```

```ts
const mockRecurringSchedulesRepository = () => ({
  find: jest.fn(),
});
```

In `buildTestingModule()`, add the provider and returned handle:

```ts
      { provide: getRepositoryToken(Venue), useFactory: mockVenuesRepository },
      {
        provide: getRepositoryToken(RecurringSchedule),
        useFactory: mockRecurringSchedulesRepository,
      },
    ],
  }).compile();

  return {
    service: module.get(PricingService),
    pricingRulesRepo: module.get(getRepositoryToken(PricingRule)) as ReturnType<
      typeof mockPricingRulesRepository
    >,
    courtsRepo: module.get(getRepositoryToken(Court)) as ReturnType<typeof mockCourtsRepository>,
    venuesRepo: module.get(getRepositoryToken(Venue)) as ReturnType<typeof mockVenuesRepository>,
    recurringSchedulesRepo: module.get(getRepositoryToken(RecurringSchedule)) as ReturnType<
      typeof mockRecurringSchedulesRepository
    >,
  };
```

- [ ] **Step 3: Write the failing tests**

Append to `apps/api/src/pricing/pricing.service.spec.ts`:

```ts
describe('PricingService.getSummary', () => {
  it('counts pricing rules and active schedules across every court in the venue', async () => {
    const { service, courtsRepo, venuesRepo, pricingRulesRepo, recurringSchedulesRepo } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.find.mockResolvedValue([{ id: 'court-1' }, { id: 'court-2' }]);
    pricingRulesRepo.count.mockResolvedValue(7);
    recurringSchedulesRepo.find.mockResolvedValue([
      { pricePerSession: 120000, discountPercent: null },
      { pricePerSession: 100000, discountPercent: 10 },
    ]);

    const result = await service.getSummary('owner-1', 'venue-1');

    expect(courtsRepo.find).toHaveBeenCalledWith({ where: { venueId: 'venue-1' } });
    expect(pricingRulesRepo.count).toHaveBeenCalledWith({
      where: { courtId: expect.anything() },
    });
    expect(recurringSchedulesRepo.find).toHaveBeenCalledWith({
      where: { courtId: expect.anything(), status: RecurringScheduleStatus.ACTIVE },
    });
    expect(result).toEqual({
      pricingRulesCount: 7,
      activeRecurringSchedulesCount: 2,
      // 120000*52/12 + 100000*0.9*52/12 = 520000 + 390000 = 910000
      estimatedMonthlyRecurringRevenue: 910000,
    });
  });

  it('scopes to a single court when courtId is provided', async () => {
    const { service, courtsRepo, venuesRepo, pricingRulesRepo, recurringSchedulesRepo } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    pricingRulesRepo.count.mockResolvedValue(2);
    recurringSchedulesRepo.find.mockResolvedValue([]);

    const result = await service.getSummary('owner-1', 'venue-1', 'court-1');

    expect(courtsRepo.find).not.toHaveBeenCalled();
    expect(pricingRulesRepo.count).toHaveBeenCalledWith({ where: { courtId: expect.anything() } });
    expect(result).toEqual({
      pricingRulesCount: 2,
      activeRecurringSchedulesCount: 0,
      estimatedMonthlyRecurringRevenue: 0,
    });
  });

  it('throws NotFoundException when courtId does not belong to the venue', async () => {
    const { service, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue(null);

    await expect(service.getSummary('owner-1', 'venue-1', 'court-x')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws ForbiddenException when the venue belongs to another owner', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'someone-else' });

    await expect(service.getSummary('owner-1', 'venue-1')).rejects.toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd apps/api && npx jest pricing.service.spec.ts`
Expected: FAIL — `service.getSummary is not a function`, plus `pricingRulesRepo.count` doesn't exist on the mock (add `count: jest.fn()` to `mockPricingRulesRepository` too — it currently only has `find`/`findOne`/`create`/`save`/`remove`).

Fix the mock before re-running: in `mockPricingRulesRepository`, add `count: jest.fn(),`.

- [ ] **Step 5: Extract `getOwnedVenue` and implement `getSummary`**

In `apps/api/src/pricing/pricing.service.ts`, add the `RecurringSchedule` import and repository:

```ts
import { RecurringSchedule, RecurringScheduleStatus } from '../recurring-schedules/entities/recurring-schedule.entity';
```

```ts
  constructor(
    @InjectRepository(PricingRule)
    private readonly pricingRulesRepository: Repository<PricingRule>,
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    @InjectRepository(Venue)
    private readonly venuesRepository: Repository<Venue>,
    @InjectRepository(RecurringSchedule)
    private readonly recurringSchedulesRepository: Repository<RecurringSchedule>,
  ) {}
```

Replace `getOwnedCourtOrThrow` with a version that delegates venue-ownership checking to a new `getOwnedVenue`:

```ts
  private async getOwnedCourtOrThrow(
    ownerId: string,
    venueId: string,
    courtId: string,
  ): Promise<Court> {
    await this.getOwnedVenue(ownerId, venueId);
    const court = await this.courtsRepository.findOne({ where: { id: courtId, venueId } });
    if (!court) {
      throw new NotFoundException(`Court ${courtId} không tồn tại`);
    }
    return court;
  }

  private async getOwnedVenue(ownerId: string, venueId: string): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({ where: { id: venueId } });
    if (!venue) {
      throw new NotFoundException(`Venue ${venueId} không tồn tại`);
    }
    if (venue.ownerId !== ownerId) {
      throw new ForbiddenException('Bạn không có quyền truy cập venue này');
    }
    return venue;
  }
```

Add `getSummary` (anywhere in the class, e.g. after `copyFrom`):

```ts
  async getSummary(
    ownerId: string,
    venueId: string,
    courtId?: string,
  ): Promise<{
    pricingRulesCount: number;
    activeRecurringSchedulesCount: number;
    estimatedMonthlyRecurringRevenue: number;
  }> {
    await this.getOwnedVenue(ownerId, venueId);

    let courtIds: string[];
    if (courtId) {
      const court = await this.courtsRepository.findOne({ where: { id: courtId, venueId } });
      if (!court) {
        throw new NotFoundException(`Court ${courtId} không tồn tại`);
      }
      courtIds = [courtId];
    } else {
      const courts = await this.courtsRepository.find({ where: { venueId } });
      courtIds = courts.map((court) => court.id);
    }
    const scopedCourtIds = courtIds.length > 0 ? courtIds : ['__none__'];

    const pricingRulesCount = await this.pricingRulesRepository.count({
      where: { courtId: In(scopedCourtIds) },
    });

    const activeSchedules = await this.recurringSchedulesRepository.find({
      where: { courtId: In(scopedCourtIds), status: RecurringScheduleStatus.ACTIVE },
    });
    const estimatedMonthlyRecurringRevenue =
      Math.round(
        activeSchedules.reduce(
          (sum, schedule) =>
            sum +
            schedule.pricePerSession * (1 - (schedule.discountPercent ?? 0) / 100) * (52 / 12),
          0,
        ) * 100,
      ) / 100;

    return {
      pricingRulesCount,
      activeRecurringSchedulesCount: activeSchedules.length,
      estimatedMonthlyRecurringRevenue,
    };
  }
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd apps/api && npx jest pricing.service.spec.ts`
Expected: PASS — all tests green, including every pre-existing test in the file (the `getOwnedCourtOrThrow` refactor must not change any observable behavior).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/pricing/pricing.module.ts apps/api/src/pricing/pricing.service.ts apps/api/src/pricing/pricing.service.spec.ts
git commit -m "feat(api): add PricingService.getSummary for the Bảng giá page metrics"
```

---

### Task 2: `GET` route + e2e

**Files:**
- Modify: `apps/api/src/pricing/pricing.controller.ts`
- Create: `apps/api/test/pricing-summary.e2e-spec.ts`

**Interfaces:**
- Consumes: `PricingService.getSummary` (Task 1)
- Produces: `GET venues/mine/:venueId/pricing-summary?courtId=`

- [ ] **Step 1: Add the controller route**

In `apps/api/src/pricing/pricing.controller.ts`, add `Query` to the `@nestjs/common` import:

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
```

Add the route (e.g. right after `create`):

```ts
  @Get('venues/mine/:venueId/pricing-summary')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Query('courtId') courtId?: string,
  ) {
    return this.pricingService.getSummary(user.userId, venueId, courtId);
  }
```

- [ ] **Step 2: Write and run the e2e test**

`apps/api/test/pricing-summary.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../src/courts/entities/court.entity';

describe('Pricing summary (e2e)', () => {
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

  it('reports pricing rule count, active schedule count, and estimated monthly revenue', async () => {
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

    await request(app.getHttpServer())
      .post(`/venues/mine/${venue.id}/courts/${court.id}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Buổi tối',
        daysOfWeek: [0, 1, 2, 3, 4],
        startTime: '17:00',
        endTime: '22:00',
        price: 150000,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/venues/mine/${venue.id}/recurring-schedules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        courtId: court.id,
        dayOfWeek: 0,
        startTime: '18:00',
        endTime: '19:00',
        pricePerSession: 120000,
        validFrom: '2099-01-05',
        validTo: '2099-01-05',
        newCustomer: { fullName: 'Khách quen', phone: '0933333333' },
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/venues/mine/${venue.id}/pricing-summary`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      pricingRulesCount: 1,
      activeRecurringSchedulesCount: 1,
      // 120000 * 52/12
      estimatedMonthlyRecurringRevenue: 520000,
    });
  });
});
```

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json pricing-summary.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 3: Full suite sanity check**

Run: `cd apps/api && npm run test && npm run test:e2e`
Expected: all unit and e2e tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/pricing/pricing.controller.ts apps/api/test/pricing-summary.e2e-spec.ts
git commit -m "feat(api): add GET pricing-summary endpoint for the Bảng giá page"
```

---

## Out of scope

- Frontend for the "Bảng giá" page.
