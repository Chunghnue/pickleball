# Pricing Module Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Pricing module (`pricing_rules` + `PricingService.resolvePrice`) from [2026-08-26-pricing-and-recurring-schedules-design.md](../specs/2026-08-26-pricing-and-recurring-schedules-design.md) §2, and switch Courts (`/courts/:id/slots`) and Bookings (`createBookingRecord`) to compute price through it instead of reading `court.pricePerHour` directly.

**Architecture:** New standalone `PricingModule` (entity `PricingRule`, `PricingService`, owner-facing CRUD controller) that depends on nothing else in the app — it reads `Court`/`Venue` via directly-injected repositories (the same pattern `CourtsModule` already uses for `Booking`), never via `CourtsService`/`VenuesService`. This keeps the dependency arrow one-directional: `CourtsModule` and `BookingsModule` import `PricingModule`, never the other way, so no circular module dependency is introduced. `slot-generator.ts` is split so time-slot generation stays a pure, synchronous, unit-testable function, while per-slot pricing becomes an async step in `CourtsService`/`BookingsService` that calls `PricingService.resolvePrice`.

**Tech Stack:** NestJS 11, TypeORM 1.x (raw-SQL migrations, no `synchronize`), class-validator, Jest (`*.spec.ts` unit tests with mocked repositories, `test/*.e2e-spec.ts` against a real Postgres test DB).

## Global Constraints

- All user-facing error messages are Vietnamese, matching the existing style (e.g. `` `Court ${id} không tồn tại` ``).
- Never use `synchronize: true` — every schema change ships as a migration in `apps/api/src/migrations/`, filename `<timestamp>-<Name>.ts`, timestamp higher than the latest existing one (`1787890000000`).
- Money/price columns: `numeric(10,2)` with a `{ to: (v) => v, from: (v) => parseFloat(v) }` transformer (matches `Court.pricePerHour`).
- TIME columns: `type: 'time'` with `timeColumnTransformer` from `apps/api/src/bookings/time-column.transformer.ts` (strips the `:SS` Postgres adds on read).
- Date strings are `YYYY-MM-DD` and compared/treated as UTC throughout (`new Date(\`${date}T00:00:00Z\`)`), matching `BookingsService`/`CourtsService`.
- Owner-facing routes: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.OWNER)`, full path written on the route decorator (no `@Controller('prefix')`), matching `CourtsController`/`RecurringSchedulesController`.
- Do not touch `recurring_schedules` (§3 of the spec) — it already ships and intentionally uses its own `price_per_session`, not `pricing_rules`.

---

## File Structure

Create:
- `apps/api/src/migrations/1787900000000-CreatePricingRules.ts` — `pricing_rules` table
- `apps/api/src/pricing/entities/pricing-rule.entity.ts` — `PricingRule` entity
- `apps/api/src/pricing/dto/create-pricing-rule.dto.ts`
- `apps/api/src/pricing/dto/update-pricing-rule.dto.ts`
- `apps/api/src/pricing/pricing.service.ts` — `resolvePrice` + CRUD + `copyFrom`
- `apps/api/src/pricing/pricing.service.spec.ts`
- `apps/api/src/pricing/pricing.controller.ts` — 5 owner-facing endpoints
- `apps/api/src/pricing/pricing.module.ts`
- `apps/api/test/pricing-rules.e2e-spec.ts`

Modify:
- `apps/api/src/app.module.ts` — register `PricingModule`
- `apps/api/src/courts/slot-generator.ts` — split price out of slot generation
- `apps/api/src/courts/slot-generator.spec.ts` — update for the split
- `apps/api/src/courts/courts.service.ts` — `getSlotsForDate` resolves price via `PricingService`
- `apps/api/src/courts/courts.service.spec.ts` — mock `PricingService`
- `apps/api/src/courts/courts.module.ts` — import `PricingModule`
- `apps/api/src/bookings/bookings.service.ts` — `createBookingRecord` sums per-slot resolved price
- `apps/api/src/bookings/bookings.service.spec.ts` — mock `PricingService`
- `apps/api/src/bookings/bookings.module.ts` — import `PricingModule`

---

### Task 1: `pricing_rules` migration

**Files:**
- Create: `apps/api/src/migrations/1787900000000-CreatePricingRules.ts`

**Interfaces:**
- Produces: table `pricing_rules(id uuid, court_id varchar, name varchar, days_of_week varchar, start_time time, end_time time, price numeric(10,2), priority int default 0, advance_booking_hours int nullable, advance_price numeric(10,2) nullable, valid_from date nullable, valid_to date nullable, created_at timestamp, updated_at timestamp)` + index on `court_id`.

- [ ] **Step 1: Write the migration**

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePricingRules1787900000000 implements MigrationInterface {
  name = 'CreatePricingRules1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "pricing_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "court_id" character varying NOT NULL, "name" character varying NOT NULL, "days_of_week" character varying NOT NULL, "start_time" TIME NOT NULL, "end_time" TIME NOT NULL, "price" numeric(10,2) NOT NULL, "priority" integer NOT NULL DEFAULT 0, "advance_booking_hours" integer, "advance_price" numeric(10,2), "valid_from" date, "valid_to" date, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_pricing_rules_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pricing_rules_court_id" ON "pricing_rules" ("court_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_pricing_rules_court_id"`);
    await queryRunner.query(`DROP TABLE "pricing_rules"`);
  }
}
```

- [ ] **Step 2: Run the migration against the local dev DB**

Run: `cd apps/api && npm run migration:run`
Expected: output includes `CreatePricingRules1787900000000` and no errors. (This also verifies `down()` is syntactically consistent — you don't need to run `migration:revert`, just eyeball it matches `up()` in reverse.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/migrations/1787900000000-CreatePricingRules.ts
git commit -m "feat(api): add pricing_rules migration"
```

---

### Task 2: `PricingRule` entity

**Files:**
- Create: `apps/api/src/pricing/entities/pricing-rule.entity.ts`

**Interfaces:**
- Consumes: `timeColumnTransformer` from `apps/api/src/bookings/time-column.transformer.ts`
- Produces: `PricingRule` class with fields `id, courtId, name, daysOfWeek: number[], startTime: string, endTime: string, price: number, priority: number, advanceBookingHours: number | null, advancePrice: number | null, validFrom: string | null, validTo: string | null, createdAt: Date, updatedAt: Date`

- [ ] **Step 1: Write the entity**

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { timeColumnTransformer } from '../../bookings/time-column.transformer';

const daysOfWeekTransformer = {
  to: (value: number[]) => value.join(','),
  from: (value: string) => value.split(',').map(Number),
};

const moneyTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseFloat(value),
};

const nullableMoneyTransformer = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value === null ? null : parseFloat(value)),
};

@Entity('pricing_rules')
export class PricingRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'court_id' })
  courtId: string;

  @Column()
  name: string;

  @Column({
    name: 'days_of_week',
    type: 'varchar',
    transformer: daysOfWeekTransformer,
  })
  daysOfWeek: number[];

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

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: moneyTransformer })
  price: number;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ name: 'advance_booking_hours', type: 'int', nullable: true })
  advanceBookingHours: number | null;

  @Column({
    name: 'advance_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: nullableMoneyTransformer,
  })
  advancePrice: number | null;

  @Column({ name: 'valid_from', type: 'date', nullable: true })
  validFrom: string | null;

  @Column({ name: 'valid_to', type: 'date', nullable: true })
  validTo: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: no errors mentioning `pricing-rule.entity.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/pricing/entities/pricing-rule.entity.ts
git commit -m "feat(api): add PricingRule entity"
```

---

### Task 3: `PricingService.resolvePrice`

**Files:**
- Create: `apps/api/src/pricing/pricing.service.ts`
- Test: `apps/api/src/pricing/pricing.service.spec.ts`

**Interfaces:**
- Consumes: `PricingRule` (Task 2), `Court` from `../courts/entities/court.entity`, `Venue` from `../courts/entities/venue.entity`
- Produces: `PricingService.resolvePrice(courtId: string, date: string, slotStart: string): Promise<number>` — returns an hourly price. Later tasks (4, 5) add more methods to this same class; later modules (7, 8) call this exact method.

This task builds only `resolvePrice` plus the repository plumbing and one private helper (`getDayOfWeek`). CRUD methods are added in Task 4.

- [ ] **Step 1: Write the failing tests**

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PricingService } from './pricing.service';
import { PricingRule } from './entities/pricing-rule.entity';
import { Court } from '../courts/entities/court.entity';
import { Venue } from '../courts/entities/venue.entity';

const mockPricingRulesRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
});

const mockCourtsRepository = () => ({
  findOne: jest.fn(),
});

const mockVenuesRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PricingService,
      { provide: getRepositoryToken(PricingRule), useFactory: mockPricingRulesRepository },
      { provide: getRepositoryToken(Court), useFactory: mockCourtsRepository },
      { provide: getRepositoryToken(Venue), useFactory: mockVenuesRepository },
    ],
  }).compile();

  return {
    service: module.get(PricingService),
    pricingRulesRepo: module.get(getRepositoryToken(PricingRule)) as ReturnType<
      typeof mockPricingRulesRepository
    >,
    courtsRepo: module.get(getRepositoryToken(Court)) as ReturnType<typeof mockCourtsRepository>,
    venuesRepo: module.get(getRepositoryToken(Venue)) as ReturnType<typeof mockVenuesRepository>,
  };
}

function rule(overrides: Partial<PricingRule>): PricingRule {
  return {
    id: 'rule-1',
    courtId: 'court-1',
    name: 'Rule',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startTime: '00:00',
    endTime: '23:59',
    price: 100000,
    priority: 0,
    advanceBookingHours: null,
    advancePrice: null,
    validFrom: null,
    validTo: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as PricingRule;
}

describe('PricingService.resolvePrice', () => {
  const FIXED_NOW = new Date('2026-08-24T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('falls back to court.pricePerHour when no rule matches', async () => {
    const { service, pricingRulesRepo, courtsRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([]);
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', pricePerHour: 90000 });

    const price = await service.resolvePrice('court-1', '2026-08-25', '18:00');

    expect(price).toBe(90000);
  });

  it('filters out rules on the wrong day of week', async () => {
    // 2026-08-25 is a Tuesday -> spec day-of-week index 1 (0=Mon..6=Sun)
    const { service, pricingRulesRepo, courtsRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([rule({ daysOfWeek: [5, 6], price: 150000 })]);
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', pricePerHour: 90000 });

    const price = await service.resolvePrice('court-1', '2026-08-25', '18:00');

    expect(price).toBe(90000);
  });

  it('filters out rules outside the time window', async () => {
    const { service, pricingRulesRepo, courtsRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([
      rule({ startTime: '17:00', endTime: '22:00', price: 150000 }),
    ]);
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', pricePerHour: 90000 });

    const price = await service.resolvePrice('court-1', '2026-08-25', '08:00');

    expect(price).toBe(90000);
  });

  it('filters out rules outside validFrom/validTo', async () => {
    const { service, pricingRulesRepo, courtsRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([
      rule({ validFrom: '2026-09-01', validTo: null, price: 150000 }),
    ]);
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', pricePerHour: 90000 });

    const price = await service.resolvePrice('court-1', '2026-08-25', '18:00');

    expect(price).toBe(90000);
  });

  it('picks the highest-priority matching rule', async () => {
    const { service, pricingRulesRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([
      rule({ id: 'low', priority: 1, price: 100000 }),
      rule({ id: 'high', priority: 5, price: 200000 }),
    ]);

    const price = await service.resolvePrice('court-1', '2026-08-25', '18:00');

    expect(price).toBe(200000);
  });

  it('breaks a priority tie with the newer rule (later createdAt)', async () => {
    const { service, pricingRulesRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([
      rule({
        id: 'older',
        priority: 3,
        price: 100000,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
      rule({
        id: 'newer',
        priority: 3,
        price: 120000,
        createdAt: new Date('2026-02-01T00:00:00Z'),
      }),
    ]);

    const price = await service.resolvePrice('court-1', '2026-08-25', '18:00');

    expect(price).toBe(120000);
  });

  it('applies advancePrice when booked at least advanceBookingHours ahead', async () => {
    const { service, pricingRulesRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([
      rule({ price: 100000, advanceBookingHours: 24, advancePrice: 70000 }),
    ]);

    // FIXED_NOW = 2026-08-24T12:00Z, slot = 2026-08-25T20:00Z -> 32h ahead (>= 24)
    const price = await service.resolvePrice('court-1', '2026-08-25', '20:00');

    expect(price).toBe(70000);
  });

  it('keeps the normal price when booked less than advanceBookingHours ahead', async () => {
    const { service, pricingRulesRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([
      rule({ price: 100000, advanceBookingHours: 48, advancePrice: 70000 }),
    ]);

    // FIXED_NOW = 2026-08-24T12:00Z, slot = 2026-08-25T20:00Z -> 32h ahead (< 48)
    const price = await service.resolvePrice('court-1', '2026-08-25', '20:00');

    expect(price).toBe(100000);
  });

  it('keeps the normal price when advancePrice is null even if the window is met', async () => {
    const { service, pricingRulesRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([
      rule({ price: 100000, advanceBookingHours: 1, advancePrice: null }),
    ]);

    const price = await service.resolvePrice('court-1', '2026-08-25', '20:00');

    expect(price).toBe(100000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest pricing.service.spec.ts`
Expected: FAIL — `Cannot find module './pricing.service'` (file doesn't exist yet).

- [ ] **Step 3: Implement `PricingService.resolvePrice`**

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingRule } from './entities/pricing-rule.entity';
import { Court } from '../courts/entities/court.entity';
import { Venue } from '../courts/entities/venue.entity';

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(PricingRule)
    private readonly pricingRulesRepository: Repository<PricingRule>,
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    @InjectRepository(Venue)
    private readonly venuesRepository: Repository<Venue>,
  ) {}

  async resolvePrice(courtId: string, date: string, slotStart: string): Promise<number> {
    const dayOfWeek = this.getDayOfWeek(date);
    const rules = await this.pricingRulesRepository.find({ where: { courtId } });
    const matching = rules.filter(
      (rule) =>
        rule.daysOfWeek.includes(dayOfWeek) &&
        rule.startTime <= slotStart &&
        slotStart < rule.endTime &&
        (rule.validFrom === null || rule.validFrom <= date) &&
        (rule.validTo === null || rule.validTo >= date),
    );

    if (matching.length === 0) {
      const court = await this.courtsRepository.findOne({ where: { id: courtId } });
      if (!court) {
        throw new NotFoundException(`Court ${courtId} không tồn tại`);
      }
      return court.pricePerHour;
    }

    matching.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    const selected = matching[0];

    if (selected.advanceBookingHours !== null) {
      const slotStartMs = new Date(`${date}T${slotStart}:00Z`).getTime();
      const hoursUntilSlot = (slotStartMs - Date.now()) / (60 * 60 * 1000);
      if (hoursUntilSlot >= selected.advanceBookingHours && selected.advancePrice !== null) {
        return selected.advancePrice;
      }
    }

    return selected.price;
  }

  private getDayOfWeek(date: string): number {
    const jsDay = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
    return (jsDay + 6) % 7; // 0=Mon..6=Sun, matches days_of_week convention
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest pricing.service.spec.ts`
Expected: PASS — all 9 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/pricing/pricing.service.ts apps/api/src/pricing/pricing.service.spec.ts
git commit -m "feat(api): add PricingService.resolvePrice"
```

---

### Task 4: Pricing rule CRUD (create / list / update / remove)

**Files:**
- Create: `apps/api/src/pricing/dto/create-pricing-rule.dto.ts`
- Create: `apps/api/src/pricing/dto/update-pricing-rule.dto.ts`
- Modify: `apps/api/src/pricing/pricing.service.ts`
- Modify: `apps/api/src/pricing/pricing.service.spec.ts`

**Interfaces:**
- Consumes: `TIME_PATTERN`, `timeToMinutes` from `../courts/time.util`
- Produces (added to `PricingService`, used by Task 6's controller):
  - `create(ownerId: string, venueId: string, courtId: string, dto: CreatePricingRuleDto): Promise<PricingRule>`
  - `findByCourt(ownerId: string, venueId: string, courtId: string): Promise<PricingRule[]>`
  - `update(ownerId: string, venueId: string, courtId: string, id: string, dto: UpdatePricingRuleDto): Promise<PricingRule>`
  - `remove(ownerId: string, venueId: string, courtId: string, id: string): Promise<void>`
  - private `getOwnedCourtOrThrow(ownerId: string, venueId: string, courtId: string): Promise<Court>` (used again by Task 5)

- [ ] **Step 1: Write the DTOs**

`apps/api/src/pricing/dto/create-pricing-rule.dto.ts`:

```ts
import {
  ArrayNotEmpty,
  IsArray,
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

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreatePricingRuleDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek: number[];

  @Matches(TIME_PATTERN, { message: 'startTime phải theo định dạng HH:mm' })
  startTime: string;

  @Matches(TIME_PATTERN, { message: 'endTime phải theo định dạng HH:mm' })
  endTime: string;

  @IsNumber()
  @Min(0.01)
  price: number;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  advanceBookingHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  advancePrice?: number;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'validFrom phải theo định dạng YYYY-MM-DD' })
  validFrom?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'validTo phải theo định dạng YYYY-MM-DD' })
  validTo?: string;
}
```

`apps/api/src/pricing/dto/update-pricing-rule.dto.ts`:

```ts
import {
  ArrayNotEmpty,
  IsArray,
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

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class UpdatePricingRuleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'startTime phải theo định dạng HH:mm' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'endTime phải theo định dạng HH:mm' })
  endTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  price?: number;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  advanceBookingHours?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  advancePrice?: number;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'validFrom phải theo định dạng YYYY-MM-DD' })
  validFrom?: string;

  @IsOptional()
  @Matches(DATE_PATTERN, { message: 'validTo phải theo định dạng YYYY-MM-DD' })
  validTo?: string;
}
```

- [ ] **Step 2: Write the failing tests**

Append to `apps/api/src/pricing/pricing.service.spec.ts` (new imports needed: `ForbiddenException`, `NotFoundException`, `BadRequestException` from `@nestjs/common`, and `CreatePricingRuleDto`/`UpdatePricingRuleDto`):

```ts
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';

const VALID_DTO: CreatePricingRuleDto = {
  name: 'Buổi tối',
  daysOfWeek: [0, 1, 2, 3, 4],
  startTime: '17:00',
  endTime: '22:00',
  price: 150000,
};

describe('PricingService.create', () => {
  it('creates a rule on an owned court', async () => {
    const { service, pricingRulesRepo, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    pricingRulesRepo.create.mockImplementation((data) => data);
    pricingRulesRepo.save.mockImplementation((data) => Promise.resolve({ id: 'rule-1', ...data }));

    const result = await service.create('owner-1', 'venue-1', 'court-1', VALID_DTO);

    expect(result.courtId).toBe('court-1');
    expect(result.priority).toBe(0);
    expect(result.advanceBookingHours).toBeNull();
    expect(result.advancePrice).toBeNull();
    expect(result.validFrom).toBeNull();
    expect(result.validTo).toBeNull();
  });

  it('throws ForbiddenException when the venue belongs to another owner', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'someone-else' });

    await expect(service.create('owner-1', 'venue-1', 'court-1', VALID_DTO)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws NotFoundException when the court does not belong to the venue', async () => {
    const { service, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue(null);

    await expect(service.create('owner-1', 'venue-1', 'court-1', VALID_DTO)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadRequestException when startTime is not before endTime', async () => {
    const { service, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });

    await expect(
      service.create('owner-1', 'venue-1', 'court-1', { ...VALID_DTO, startTime: '22:00', endTime: '17:00' }),
    ).rejects.toThrow('startTime phải trước endTime');
  });

  it('throws BadRequestException when validFrom is after validTo', async () => {
    const { service, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });

    await expect(
      service.create('owner-1', 'venue-1', 'court-1', {
        ...VALID_DTO,
        validFrom: '2026-09-01',
        validTo: '2026-08-01',
      }),
    ).rejects.toThrow('validFrom phải trước hoặc bằng validTo');
  });
});

describe('PricingService.findByCourt', () => {
  it('returns rules for an owned court', async () => {
    const { service, pricingRulesRepo, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    pricingRulesRepo.find.mockResolvedValue([rule({})]);

    const result = await service.findByCourt('owner-1', 'venue-1', 'court-1');

    expect(result).toHaveLength(1);
  });
});

describe('PricingService.update', () => {
  it('applies partial updates', async () => {
    const { service, pricingRulesRepo, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    const existing = rule({ price: 100000 });
    pricingRulesRepo.findOne.mockResolvedValue(existing);
    pricingRulesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const dto: UpdatePricingRuleDto = { price: 130000 };
    const result = await service.update('owner-1', 'venue-1', 'court-1', 'rule-1', dto);

    expect(result.price).toBe(130000);
    expect(result.startTime).toBe(existing.startTime);
  });

  it('throws NotFoundException when the rule does not exist on that court', async () => {
    const { service, pricingRulesRepo, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    pricingRulesRepo.findOne.mockResolvedValue(null);

    await expect(
      service.update('owner-1', 'venue-1', 'court-1', 'rule-1', { price: 1 }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('PricingService.remove', () => {
  it('removes an owned rule', async () => {
    const { service, pricingRulesRepo, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    const existing = rule({});
    pricingRulesRepo.findOne.mockResolvedValue(existing);

    await service.remove('owner-1', 'venue-1', 'court-1', 'rule-1');

    expect(pricingRulesRepo.remove).toHaveBeenCalledWith(existing);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/api && npx jest pricing.service.spec.ts`
Expected: FAIL — `service.create is not a function` (and similar for `findByCourt`/`update`/`remove`).

- [ ] **Step 4: Implement CRUD methods on `PricingService`**

Add to `apps/api/src/pricing/pricing.service.ts` (extend the imports and class from Task 3):

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
// ...existing imports (InjectRepository, Repository, PricingRule, Court, Venue)
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { timeToMinutes } from '../courts/time.util';
```

Add these methods inside the `PricingService` class (alongside `resolvePrice`):

```ts
  async create(
    ownerId: string,
    venueId: string,
    courtId: string,
    dto: CreatePricingRuleDto,
  ): Promise<PricingRule> {
    await this.getOwnedCourtOrThrow(ownerId, venueId, courtId);
    this.assertValid(dto.startTime, dto.endTime, dto.validFrom ?? null, dto.validTo ?? null);

    const created = this.pricingRulesRepository.create({
      courtId,
      name: dto.name,
      daysOfWeek: dto.daysOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      price: dto.price,
      priority: dto.priority ?? 0,
      advanceBookingHours: dto.advanceBookingHours ?? null,
      advancePrice: dto.advancePrice ?? null,
      validFrom: dto.validFrom ?? null,
      validTo: dto.validTo ?? null,
    });
    return this.pricingRulesRepository.save(created);
  }

  async findByCourt(ownerId: string, venueId: string, courtId: string): Promise<PricingRule[]> {
    await this.getOwnedCourtOrThrow(ownerId, venueId, courtId);
    return this.pricingRulesRepository.find({
      where: { courtId },
      order: { priority: 'DESC', createdAt: 'DESC' },
    });
  }

  async update(
    ownerId: string,
    venueId: string,
    courtId: string,
    id: string,
    dto: UpdatePricingRuleDto,
  ): Promise<PricingRule> {
    await this.getOwnedCourtOrThrow(ownerId, venueId, courtId);
    const rule = await this.pricingRulesRepository.findOne({ where: { id, courtId } });
    if (!rule) {
      throw new NotFoundException(`Pricing rule ${id} không tồn tại`);
    }

    const nextStartTime = dto.startTime ?? rule.startTime;
    const nextEndTime = dto.endTime ?? rule.endTime;
    const nextValidFrom = dto.validFrom !== undefined ? dto.validFrom : rule.validFrom;
    const nextValidTo = dto.validTo !== undefined ? dto.validTo : rule.validTo;
    this.assertValid(nextStartTime, nextEndTime, nextValidFrom, nextValidTo);

    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.daysOfWeek !== undefined) rule.daysOfWeek = dto.daysOfWeek;
    rule.startTime = nextStartTime;
    rule.endTime = nextEndTime;
    if (dto.price !== undefined) rule.price = dto.price;
    if (dto.priority !== undefined) rule.priority = dto.priority;
    if (dto.advanceBookingHours !== undefined) rule.advanceBookingHours = dto.advanceBookingHours;
    if (dto.advancePrice !== undefined) rule.advancePrice = dto.advancePrice;
    rule.validFrom = nextValidFrom;
    rule.validTo = nextValidTo;

    return this.pricingRulesRepository.save(rule);
  }

  async remove(ownerId: string, venueId: string, courtId: string, id: string): Promise<void> {
    await this.getOwnedCourtOrThrow(ownerId, venueId, courtId);
    const rule = await this.pricingRulesRepository.findOne({ where: { id, courtId } });
    if (!rule) {
      throw new NotFoundException(`Pricing rule ${id} không tồn tại`);
    }
    await this.pricingRulesRepository.remove(rule);
  }

  private async getOwnedCourtOrThrow(
    ownerId: string,
    venueId: string,
    courtId: string,
  ): Promise<Court> {
    const venue = await this.venuesRepository.findOne({ where: { id: venueId } });
    if (!venue) {
      throw new NotFoundException(`Venue ${venueId} không tồn tại`);
    }
    if (venue.ownerId !== ownerId) {
      throw new ForbiddenException('Bạn không có quyền truy cập venue này');
    }
    const court = await this.courtsRepository.findOne({ where: { id: courtId, venueId } });
    if (!court) {
      throw new NotFoundException(`Court ${courtId} không tồn tại`);
    }
    return court;
  }

  private assertValid(
    startTime: string,
    endTime: string,
    validFrom: string | null,
    validTo: string | null,
  ): void {
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      throw new BadRequestException('startTime phải trước endTime');
    }
    if (validFrom !== null && validTo !== null && validFrom > validTo) {
      throw new BadRequestException('validFrom phải trước hoặc bằng validTo');
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest pricing.service.spec.ts`
Expected: PASS — all tests green (9 from Task 3 + new CRUD tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/pricing/dto apps/api/src/pricing/pricing.service.ts apps/api/src/pricing/pricing.service.spec.ts
git commit -m "feat(api): add pricing rule CRUD to PricingService"
```

---

### Task 5: `PricingService.copyFrom`

**Files:**
- Modify: `apps/api/src/pricing/pricing.service.ts`
- Modify: `apps/api/src/pricing/pricing.service.spec.ts`

**Interfaces:**
- Consumes: `getOwnedCourtOrThrow` (Task 4, private — call it, don't duplicate its logic), `In` from `typeorm`
- Produces: `PricingService.copyFrom(ownerId: string, venueId: string, courtId: string, sourceCourtId: string): Promise<PricingRule[]>` (used by Task 6's controller)

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/pricing/pricing.service.spec.ts`:

```ts
describe('PricingService.copyFrom', () => {
  it('copies rules from a court the owner owns in any of their venues', async () => {
    const { service, pricingRulesRepo, courtsRepo, venuesRepo } = await buildTestingModule();
    // target court ownership check
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne
      .mockResolvedValueOnce({ id: 'court-1', venueId: 'venue-1' }) // getOwnedCourtOrThrow(target)
      .mockResolvedValueOnce({ id: 'court-2', venueId: 'venue-2' }); // source court lookup
    venuesRepo.find.mockResolvedValue([
      { id: 'venue-1', ownerId: 'owner-1' },
      { id: 'venue-2', ownerId: 'owner-1' },
    ]);
    pricingRulesRepo.find.mockResolvedValue([
      rule({ id: 'src-1', courtId: 'court-2', price: 150000 }),
    ]);
    pricingRulesRepo.create.mockImplementation((data) => data);
    pricingRulesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.copyFrom('owner-1', 'venue-1', 'court-1', 'court-2');

    expect(result).toHaveLength(1);
    expect((result[0] as unknown as { courtId: string }).courtId).toBe('court-1');
    expect((result[0] as unknown as { price: number }).price).toBe(150000);
  });

  it('throws NotFoundException when sourceCourtId is not owned by the caller', async () => {
    const { service, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne
      .mockResolvedValueOnce({ id: 'court-1', venueId: 'venue-1' }) // target ok
      .mockResolvedValueOnce(null); // source not found among owned venues
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1', ownerId: 'owner-1' }]);

    await expect(service.copyFrom('owner-1', 'venue-1', 'court-1', 'someone-elses-court')).rejects.toThrow(
      NotFoundException,
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest pricing.service.spec.ts`
Expected: FAIL — `service.copyFrom is not a function`.

- [ ] **Step 3: Implement `copyFrom`**

Add `import { In, Repository } from 'typeorm';` (replace the plain `Repository` import from Task 3) to `apps/api/src/pricing/pricing.service.ts`, then add this method to `PricingService`:

```ts
  async copyFrom(
    ownerId: string,
    venueId: string,
    courtId: string,
    sourceCourtId: string,
  ): Promise<PricingRule[]> {
    await this.getOwnedCourtOrThrow(ownerId, venueId, courtId);

    const ownedVenues = await this.venuesRepository.find({ where: { ownerId } });
    const ownedVenueIds = ownedVenues.map((venue) => venue.id);
    const sourceCourt = await this.courtsRepository.findOne({
      where: { id: sourceCourtId, venueId: In(ownedVenueIds.length > 0 ? ownedVenueIds : ['__none__']) },
    });
    if (!sourceCourt) {
      throw new NotFoundException(`Court ${sourceCourtId} không tồn tại`);
    }

    const sourceRules = await this.pricingRulesRepository.find({ where: { courtId: sourceCourtId } });
    const copies = sourceRules.map((rule) =>
      this.pricingRulesRepository.create({
        courtId,
        name: rule.name,
        daysOfWeek: rule.daysOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
        price: rule.price,
        priority: rule.priority,
        advanceBookingHours: rule.advanceBookingHours,
        advancePrice: rule.advancePrice,
        validFrom: rule.validFrom,
        validTo: rule.validTo,
      }),
    );
    return this.pricingRulesRepository.save(copies);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest pricing.service.spec.ts`
Expected: PASS — full file green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/pricing/pricing.service.ts apps/api/src/pricing/pricing.service.spec.ts
git commit -m "feat(api): add PricingService.copyFrom"
```

---

### Task 6: Controller, module, app registration, e2e

**Files:**
- Create: `apps/api/src/pricing/pricing.controller.ts`
- Create: `apps/api/src/pricing/pricing.module.ts`
- Create: `apps/api/test/pricing-rules.e2e-spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: all `PricingService` methods from Tasks 3-5, `JwtAuthGuard`/`RolesGuard`/`Roles`/`CurrentUser`/`AuthenticatedUser`/`UserRole` (existing auth building blocks, same imports as `CourtsController`)
- Produces: 5 routes exactly as specced in §2.3

- [ ] **Step 1: Write the controller**

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { PricingService } from './pricing.service';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';

@Controller()
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post('venues/mine/:venueId/courts/:courtId/pricing-rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Body() dto: CreatePricingRuleDto,
  ) {
    return this.pricingService.create(user.userId, venueId, courtId, dto);
  }

  @Get('venues/mine/:venueId/courts/:courtId/pricing-rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  findByCourt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
  ) {
    return this.pricingService.findByCourt(user.userId, venueId, courtId);
  }

  @Patch('venues/mine/:venueId/courts/:courtId/pricing-rules/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePricingRuleDto,
  ) {
    return this.pricingService.update(user.userId, venueId, courtId, id, dto);
  }

  @Delete('venues/mine/:venueId/courts/:courtId/pricing-rules/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Param('id') id: string,
  ) {
    return this.pricingService.remove(user.userId, venueId, courtId, id);
  }

  @Post('venues/mine/:venueId/courts/:courtId/pricing-rules/copy-from/:sourceCourtId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  copyFrom(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Param('sourceCourtId') sourceCourtId: string,
  ) {
    return this.pricingService.copyFrom(user.userId, venueId, courtId, sourceCourtId);
  }
}
```

- [ ] **Step 2: Write the module**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricingRule } from './entities/pricing-rule.entity';
import { Court } from '../courts/entities/court.entity';
import { Venue } from '../courts/entities/venue.entity';
import { PricingService } from './pricing.service';
import { PricingController } from './pricing.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PricingRule, Court, Venue])],
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
```

- [ ] **Step 3: Register `PricingModule` in `AppModule`**

In `apps/api/src/app.module.ts`, add the import next to `CourtsModule`:

```ts
import { CourtsModule } from './courts/courts.module';
import { PricingModule } from './pricing/pricing.module';
```

And add `PricingModule` to the `imports` array (right after `CourtsModule` is fine):

```ts
    CourtsModule,
    PricingModule,
    BookingsModule,
```

- [ ] **Step 4: Write the e2e test**

```ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../src/courts/entities/court.entity';

describe('Pricing rules (e2e)', () => {
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

  async function createOwnerAndLogin(): Promise<{ ownerId: string; token: string }> {
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
    return { ownerId: owner.id, token: loginResponse.body.accessToken as string };
  }

  async function createVenueAndCourt(
    ownerId: string,
  ): Promise<{ venueId: string; courtId: string }> {
    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId,
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
    return { venueId: venue.id, courtId: court.id };
  }

  it('creates, lists, updates and deletes a pricing rule', async () => {
    const { ownerId, token } = await createOwnerAndLogin();
    const { venueId, courtId } = await createVenueAndCourt(ownerId);

    const createResponse = await request(app.getHttpServer())
      .post(`/venues/mine/${venueId}/courts/${courtId}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Buổi tối',
        daysOfWeek: [0, 1, 2, 3, 4],
        startTime: '17:00',
        endTime: '22:00',
        price: 150000,
      })
      .expect(201);
    const ruleId = createResponse.body.id as string;

    const listResponse = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/courts/${courtId}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listResponse.body).toHaveLength(1);

    await request(app.getHttpServer())
      .patch(`/venues/mine/${venueId}/courts/${courtId}/pricing-rules/${ruleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ price: 180000 })
      .expect(200)
      .expect((res) => {
        if (res.body.price !== 180000) {
          throw new Error(`Expected updated price 180000, got ${res.body.price}`);
        }
      });

    await request(app.getHttpServer())
      .delete(`/venues/mine/${venueId}/courts/${courtId}/pricing-rules/${ruleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const afterDelete = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/courts/${courtId}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(afterDelete.body).toHaveLength(0);
  });

  it('copies rules from a court the owner owns in a different venue', async () => {
    const { ownerId, token } = await createOwnerAndLogin();
    const { venueId, courtId } = await createVenueAndCourt(ownerId);
    const { courtId: otherCourtId } = await createVenueAndCourt(ownerId);

    await request(app.getHttpServer())
      .post(`/venues/mine/${venueId}/courts/${courtId}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Buổi tối',
        daysOfWeek: [0, 1, 2, 3, 4],
        startTime: '17:00',
        endTime: '22:00',
        price: 150000,
      })
      .expect(201);

    const copyResponse = await request(app.getHttpServer())
      .post(
        `/venues/mine/${venueId}/courts/${otherCourtId}/pricing-rules/copy-from/${courtId}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(copyResponse.body).toHaveLength(1);
    expect(copyResponse.body[0].name).toBe('Buổi tối');

    const otherCourtRules = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/courts/${otherCourtId}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(otherCourtRules.body).toHaveLength(1);
  });

  it('rejects a pricing rule request for a venue owned by someone else', async () => {
    const { token } = await createOwnerAndLogin();
    const otherOwnerId = (await createOwnerAndLoginAsSecondOwner()).ownerId;
    const { venueId, courtId } = await createVenueAndCourt(otherOwnerId);

    await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/courts/${courtId}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  async function createOwnerAndLoginAsSecondOwner(): Promise<{ ownerId: string; token: string }> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const usersRepo = dataSource.getRepository(User);
    const owner = await usersRepo.save(
      usersRepo.create({
        email: 'owner2@test.com',
        passwordHash,
        fullName: 'Owner 2',
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'owner2@test.com', password: 'password123' });
    return { ownerId: owner.id, token: loginResponse.body.accessToken as string };
  }
});
```

- [ ] **Step 5: Run the e2e test**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json pricing-rules.e2e-spec.ts`
Expected: PASS — all 3 tests green. (Requires the local Postgres test DB to be up, same as other `*.e2e-spec.ts` files — check `apps/api/test/utils/test-app.ts` / `.env.test` if this fails to connect, that setup is shared and already working for the existing e2e suite.)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/pricing/pricing.controller.ts apps/api/src/pricing/pricing.module.ts apps/api/src/app.module.ts apps/api/test/pricing-rules.e2e-spec.ts
git commit -m "feat(api): add PricingModule with owner-facing CRUD endpoints"
```

---

### Task 7: Wire Courts §5 — `/courts/:id/slots` uses `PricingService`

**Files:**
- Modify: `apps/api/src/courts/slot-generator.ts`
- Modify: `apps/api/src/courts/slot-generator.spec.ts`
- Modify: `apps/api/src/courts/courts.service.ts`
- Modify: `apps/api/src/courts/courts.service.spec.ts`
- Modify: `apps/api/src/courts/courts.module.ts`
- Create: `apps/api/test/courts-slots-pricing.e2e-spec.ts`

**Interfaces:**
- Consumes: `PricingService.resolvePrice` (Task 3)
- Produces: `generateSlotTimes(input: { openTime: string; closeTime: string; slotDurationMinutes: number }): SlotTime[]` (pure, replaces the price-computing half of the old `generateSlots`). `Slot` (`{start, end, price}`) stays exported from `slot-generator.ts` unchanged in shape — `bookings.service.ts` imports it as a type and needs no changes.

- [ ] **Step 1: Split `slot-generator.ts` and update its spec**

Replace `apps/api/src/courts/slot-generator.ts` with:

```ts
import { timeToMinutes } from './time.util';

export interface Slot {
  start: string;
  end: string;
  price: number;
}

export interface SlotTime {
  start: string;
  end: string;
}

export interface GenerateSlotTimesInput {
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

export function generateSlotTimes(input: GenerateSlotTimesInput): SlotTime[] {
  const openMinutes = timeToMinutes(input.openTime);
  const closeMinutes = timeToMinutes(input.closeTime);

  const slots: SlotTime[] = [];
  for (
    let start = openMinutes;
    start + input.slotDurationMinutes <= closeMinutes;
    start += input.slotDurationMinutes
  ) {
    slots.push({
      start: toTimeString(start),
      end: toTimeString(start + input.slotDurationMinutes),
    });
  }
  return slots;
}
```

Replace `apps/api/src/courts/slot-generator.spec.ts` with:

```ts
import { generateSlotTimes } from './slot-generator';

describe('generateSlotTimes', () => {
  it('generates consecutive slots from open to close time', () => {
    const slots = generateSlotTimes({
      openTime: '08:00',
      closeTime: '10:00',
      slotDurationMinutes: 60,
    });

    expect(slots).toEqual([
      { start: '08:00', end: '09:00' },
      { start: '09:00', end: '10:00' },
    ]);
  });

  it('supports slot durations shorter than an hour', () => {
    const slots = generateSlotTimes({
      openTime: '08:00',
      closeTime: '09:00',
      slotDurationMinutes: 30,
    });

    expect(slots).toEqual([
      { start: '08:00', end: '08:30' },
      { start: '08:30', end: '09:00' },
    ]);
  });

  it('drops a trailing partial slot that does not fit evenly', () => {
    const slots = generateSlotTimes({
      openTime: '08:00',
      closeTime: '09:50',
      slotDurationMinutes: 60,
    });

    expect(slots).toEqual([{ start: '08:00', end: '09:00' }]);
  });

  it('handles times with a seconds component from the Postgres time column', () => {
    const slots = generateSlotTimes({
      openTime: '08:00:00',
      closeTime: '09:00:00',
      slotDurationMinutes: 60,
    });

    expect(slots).toEqual([{ start: '08:00', end: '09:00' }]);
  });

  it('returns no slots when the window is shorter than one slot', () => {
    const slots = generateSlotTimes({
      openTime: '08:00',
      closeTime: '08:10',
      slotDurationMinutes: 60,
    });

    expect(slots).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the slot-generator spec**

Run: `cd apps/api && npx jest slot-generator.spec.ts`
Expected: PASS.

- [ ] **Step 3: Update `courts.service.spec.ts` to mock `PricingService`**

In `apps/api/src/courts/courts.service.spec.ts`, add near the other mock factories:

```ts
import { PricingService } from '../pricing/pricing.service';

const mockPricingService = () => ({
  resolvePrice: jest.fn().mockResolvedValue(100000),
});
```

In `buildTestingModule()`, add to `providers`: `{ provide: PricingService, useFactory: mockPricingService },` and to the returned object: `pricingService: module.get(PricingService) as ReturnType<typeof mockPricingService>,`.

In the `CourtsService.getSlotsForDate` describe block, the existing "returns generated slots..." test keeps its assertion (`resolvePrice` mock resolves `100000`, so `100000 * (60/60) = 100000`, matching the existing expected output) — no change needed there. Add one new test to that block:

```ts
  it('resolves each slot price through PricingService', async () => {
    const { service, courtsRepo, venuesService, pricingService } = await buildTestingModule();
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
    pricingService.resolvePrice.mockResolvedValueOnce(120000).mockResolvedValueOnce(80000);

    const result = await service.getSlotsForDate('court-1', '2026-08-25');

    expect(pricingService.resolvePrice).toHaveBeenCalledWith('court-1', '2026-08-25', '08:00');
    expect(pricingService.resolvePrice).toHaveBeenCalledWith('court-1', '2026-08-25', '09:00');
    expect(result).toEqual([
      { start: '08:00', end: '09:00', price: 120000 },
      { start: '09:00', end: '10:00', price: 80000 },
    ]);
  });
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd apps/api && npx jest courts.service.spec.ts`
Expected: FAIL — `Nest can't resolve dependencies of CourtsService` (no `PricingService` provider wired into `CourtsService` yet) or the new test fails because `resolvePrice` isn't called.

- [ ] **Step 5: Wire `PricingService` into `CourtsService.getSlotsForDate`**

In `apps/api/src/courts/courts.service.ts`:

Change the import:

```ts
import { generateSlotTimes, Slot } from './slot-generator';
```

Add import and constructor param:

```ts
import { PricingService } from '../pricing/pricing.service';
```

```ts
  constructor(
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    @InjectRepository(CourtImage)
    private readonly courtImagesRepository: Repository<CourtImage>,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    private readonly venuesService: VenuesService,
    private readonly pricingService: PricingService,
  ) {}
```

Replace the tail of `getSlotsForDate`:

```ts
    const slotTimes = generateSlotTimes({
      openTime: court.openTime,
      closeTime: court.closeTime,
      slotDurationMinutes: court.slotDurationMinutes,
    });

    const slots: Slot[] = [];
    for (const slotTime of slotTimes) {
      const resolvedPrice = await this.pricingService.resolvePrice(courtId, date, slotTime.start);
      const price = Math.round(resolvedPrice * (court.slotDurationMinutes / 60) * 100) / 100;
      slots.push({ ...slotTime, price });
    }
    return slots;
```

- [ ] **Step 6: Import `PricingModule` in `CourtsModule`**

In `apps/api/src/courts/courts.module.ts`:

```ts
import { PricingModule } from '../pricing/pricing.module';
```

Add `PricingModule` to `imports`:

```ts
  imports: [
    TypeOrmModule.forFeature([Venue, VenueImage, Court, CourtImage, Booking]),
    UsersModule,
    NotificationsModule,
    PricingModule,
  ],
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/api && npx jest courts.service.spec.ts slot-generator.spec.ts`
Expected: PASS.

- [ ] **Step 8: Write and run the e2e test**

`apps/api/test/courts-slots-pricing.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../src/courts/entities/court.entity';

describe('GET /courts/:id/slots reflects pricing rules (e2e)', () => {
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

  it('uses the pricing rule price for slots inside its window and the court default outside it', async () => {
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
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startTime: '17:00',
        endTime: '22:00',
        price: 200000,
      })
      .expect(201);

    // 2026-08-25 is a Tuesday, well inside every day-of-week mask above.
    const response = await request(app.getHttpServer())
      .get(`/courts/${court.id}/slots?date=2026-08-25`)
      .expect(200);

    const morningSlot = response.body.find((slot: { start: string }) => slot.start === '08:00');
    const eveningSlot = response.body.find((slot: { start: string }) => slot.start === '18:00');
    expect(morningSlot.price).toBe(100000);
    expect(eveningSlot.price).toBe(200000);
  });
});
```

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json courts-slots-pricing.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/courts/slot-generator.ts apps/api/src/courts/slot-generator.spec.ts apps/api/src/courts/courts.service.ts apps/api/src/courts/courts.service.spec.ts apps/api/src/courts/courts.module.ts apps/api/test/courts-slots-pricing.e2e-spec.ts
git commit -m "feat(api): resolve /courts/:id/slots prices through PricingService"
```

---

### Task 8: Wire Bookings §2 — booking price sums per-slot resolved price

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts`
- Modify: `apps/api/src/bookings/bookings.service.spec.ts`
- Modify: `apps/api/src/bookings/bookings.module.ts`
- Create: `apps/api/test/bookings-pricing.e2e-spec.ts`

**Interfaces:**
- Consumes: `PricingService.resolvePrice` (Task 3)
- Produces: no signature change to `BookingsService.createBookingRecord` — same params/return shape, only the internal price computation changes.

- [ ] **Step 1: Update `bookings.service.spec.ts` to mock `PricingService`**

In `apps/api/src/bookings/bookings.service.spec.ts`, add near the other mock factories:

```ts
import { PricingService } from '../pricing/pricing.service';

const mockPricingService = () => ({
  resolvePrice: jest.fn().mockResolvedValue(100000),
});
```

In `buildTestingModule()`, add to `providers`: `{ provide: PricingService, useFactory: mockPricingService },` and to the returned object: `pricingService: module.get(PricingService) as ReturnType<typeof mockPricingService>,`.

Add one new test inside `describe('BookingsService.create', ...)`, right after the existing `'creates a booking with one booking_slots row per unit slot'` test:

```ts
  it('sums per-slot resolved prices instead of a single flat rate', async () => {
    const { service, courtsService, venuesService, usersService, dataSource, pricingService } =
      await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    usersService.findById.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@test.com',
      fullName: 'Nguyễn Văn A',
    });
    pricingService.resolvePrice.mockResolvedValueOnce(120000).mockResolvedValueOnce(150000);
    const manager = buildMockManager();
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.create('customer-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '10:00',
    });

    expect(pricingService.resolvePrice).toHaveBeenCalledWith('court-1', '2026-08-25', '08:00');
    expect(pricingService.resolvePrice).toHaveBeenCalledWith('court-1', '2026-08-25', '09:00');
    expect(result.totalPrice).toBe(270000);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest bookings.service.spec.ts`
Expected: FAIL — `Nest can't resolve dependencies of BookingsService` (no `PricingService` provider yet), or the new test's price assertion fails (still computing from flat `pricePerHour`).

- [ ] **Step 3: Wire `PricingService` into `BookingsService.createBookingRecord`**

In `apps/api/src/bookings/bookings.service.ts`:

Add import:

```ts
import { PricingService } from '../pricing/pricing.service';
```

Add to the constructor:

```ts
  constructor(
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(BookingSlot)
    private readonly bookingSlotsRepository: Repository<BookingSlot>,
    private readonly courtsService: CourtsService,
    private readonly venuesService: VenuesService,
    private readonly usersService: UsersService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    private readonly notificationsService: NotificationsService,
    private readonly customerContactsService: CustomerContactsService,
    private readonly pricingService: PricingService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}
```

Replace the price computation block inside `createBookingRecord`:

```ts
    let computedPrice = 0;
    for (const slotStart of slotStarts) {
      const resolvedPrice = await this.pricingService.resolvePrice(
        params.courtId,
        params.date,
        slotStart,
      );
      computedPrice += resolvedPrice * (court.slotDurationMinutes / 60);
    }
    computedPrice = Math.round(computedPrice * 100) / 100;
    const totalPrice = params.totalPriceOverride ?? computedPrice;
```

(This replaces the old two-line `pricePerSlot`/`computedPrice` block that multiplied a single `court.pricePerHour` by `slotStarts.length`.)

- [ ] **Step 4: Import `PricingModule` in `BookingsModule`**

In `apps/api/src/bookings/bookings.module.ts`:

```ts
import { PricingModule } from '../pricing/pricing.module';
```

Add `PricingModule` to `imports`:

```ts
  imports: [
    TypeOrmModule.forFeature([Booking, BookingSlot]),
    CourtsModule,
    UsersModule,
    CustomerContactsModule,
    forwardRef(() => PaymentsModule),
    NotificationsModule,
    PricingModule,
  ],
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest bookings.service.spec.ts`
Expected: PASS — including the pre-existing `'creates a booking with one booking_slots row per unit slot'` test, which still gets `totalPrice: 200000` because the default mock resolves `100000` for every call (`100000 * 1h + 100000 * 1h = 200000`).

- [ ] **Step 6: Write and run the e2e test**

`apps/api/test/bookings-pricing.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../src/courts/entities/court.entity';

describe('Booking price uses pricing rules (e2e)', () => {
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

  it('charges the pricing-rule price for a slot inside its window', async () => {
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
    const customer = await usersRepo.save(
      usersRepo.create({
        email: 'customer@test.com',
        passwordHash,
        fullName: 'Khách hàng',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const ownerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'owner@test.com', password: 'password123' });
    const ownerToken = ownerLogin.body.accessToken as string;
    const customerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'customer@test.com', password: 'password123' });
    const customerToken = customerLogin.body.accessToken as string;

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
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Buổi tối',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startTime: '17:00',
        endTime: '22:00',
        price: 200000,
      })
      .expect(201);

    const bookingResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        courtId: court.id,
        date: '2026-08-25',
        startTime: '18:00',
        endTime: '19:00',
      })
      .expect(201);

    expect(bookingResponse.body.totalPrice).toBe(200000);
  });
});
```

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json bookings-pricing.e2e-spec.ts`
Expected: PASS.

- [ ] **Step 7: Full suite sanity check**

Run: `cd apps/api && npm run test && npm run test:e2e`
Expected: all unit tests and all e2e tests pass (this catches any other place that constructed a `BookingsService`/`CourtsService` test module without the new `PricingService` provider).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.service.spec.ts apps/api/src/bookings/bookings.module.ts apps/api/test/bookings-pricing.e2e-spec.ts
git commit -m "feat(api): compute booking price through PricingService per slot"
```

---

## Out of scope (tracked separately)

- Recurring Schedules §3.4 (auto-renew cron via `@nestjs/schedule`) and §3.5 (`GET` list/detail) — already-shipped module, independent follow-up.
- §4 dashboard summary card ("Bảng giá" / "Đặt cố định" / "Doanh thu cố định/tháng").
- Frontend for the "Bảng giá" page (spec explicitly defers this).
- Validating/warning on overlapping pricing rules at the same priority (§2.4 explicitly skips this — tie-break only).
