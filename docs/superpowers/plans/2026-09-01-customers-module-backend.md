# Customers Module (Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the owner-facing Customers CRM read API (list, summary, detail) plus the `POST /customer-contacts` endpoint, so the "Khách hàng" screen has a working backend.

**Architecture:** A new `customers` NestJS module aggregates per-customer stats (total bookings, total spent, last booking) directly from `bookings` + `payments` using TypeORM `QueryBuilder` grouped per customer — bounded by customer count, not booking count. Two customer sources are unified: **registered** (rows in `bookings.customer_id` → `users`) and **walk-in** (`customer_contacts` owned by the owner, whether or not they have bookings). Tier classification, search, sort and pagination are applied in-memory over that per-customer aggregate set. The existing `customer-contacts` module gains an HTTP controller for creating walk-in contacts.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, Jest (unit + e2e against a real Postgres via `test/utils/test-app.ts`).

## Global Constraints

- **Auth:** every endpoint is owner-only — guard with `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(UserRole.OWNER)`. Non-owner active user → 403; unauthenticated → 401.
- **ValidationPipe has NO `transform`** (`new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` in both `src/main.ts` and `test/utils/test-app.ts`). Query params arrive as **strings**; parse/clamp numbers manually in the service. Every query param a client may send MUST be declared in the DTO or `forbidNonWhitelisted` returns 400.
- **Revenue source:** `payments` has **no `amount` column**. "Total spent" = `SUM(bookings.total_price)` over bookings whose `payments.status = 'paid'` (same convention as `DashboardService`). Join key is `payment.booking_id = booking.id::text` (booking id is uuid, payment.booking_id is varchar).
- **Tier thresholds (verbatim from spec §3, fixed in code):** VIP if `totalSpent >= 5_000_000` **OR** `totalBookings >= 10`; New if `totalBookings <= 1`; otherwise Regular. `totalBookings` counts **non-cancelled** bookings (`status <> 'cancelled'`).
- **Customer code:** `KH-` + first 8 chars of the id (UUID), uppercased.
- **Venue scoping:** reuse `VenuesService.getOwnedVenueOrThrow(ownerId, venueId)` (404 if missing, 403 if not owned) and `VenuesService.findMineByOwner(ownerId)`; derive court ids via the `Court` repository (`venueId IN (...)`), exactly like `DashboardService`.
- **Walk-in scope decision:** walk-in customers are the owner's `customer_contacts` (owner-scoped address book) and always appear in the list even with zero bookings; registered customers appear only when they have ≥1 booking on the owner's courts. Booking-derived stats for walk-ins are filtered to the scoped courts; when no courts resolve, walk-ins show zero bookings.

---

### Task 1: Customer classification helpers (pure)

Pure functions for tier and customer code — no DB, unit-tested. Everything else depends on these.

**Files:**
- Create: `apps/api/src/customers/customer-classification.ts`
- Test: `apps/api/src/customers/customer-classification.spec.ts`

**Interfaces:**
- Produces:
  - `type CustomerTier = 'new' | 'regular' | 'vip'`
  - `classifyTier(totalBookings: number, totalSpent: number): CustomerTier`
  - `buildCustomerCode(id: string): string`
  - constants `VIP_MIN_TOTAL_SPENT = 5_000_000`, `VIP_MIN_TOTAL_BOOKINGS = 10`, `NEW_MAX_TOTAL_BOOKINGS = 1`

- [ ] **Step 1: Write the failing test**

```ts
// apps/api/src/customers/customer-classification.spec.ts
import { buildCustomerCode, classifyTier } from './customer-classification';

describe('classifyTier', () => {
  it('is "new" at 0 and 1 bookings with low spend', () => {
    expect(classifyTier(0, 0)).toBe('new');
    expect(classifyTier(1, 4_999_999)).toBe('new');
  });

  it('is "regular" between 2 and 9 bookings with sub-VIP spend', () => {
    expect(classifyTier(2, 0)).toBe('regular');
    expect(classifyTier(9, 4_999_999)).toBe('regular');
  });

  it('is "vip" at the 10-booking boundary', () => {
    expect(classifyTier(10, 0)).toBe('vip');
  });

  it('is "vip" at the 5,000,000 spend boundary even with a single booking', () => {
    expect(classifyTier(1, 5_000_000)).toBe('vip');
  });
});

describe('buildCustomerCode', () => {
  it('prefixes KH- and uppercases the first 8 chars of the id', () => {
    expect(buildCustomerCode('550e8400-e29b-41d4-a716-446655440000')).toBe('KH-550E8400');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/customers/customer-classification.spec.ts`
Expected: FAIL — `Cannot find module './customer-classification'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/api/src/customers/customer-classification.ts
export const VIP_MIN_TOTAL_SPENT = 5_000_000;
export const VIP_MIN_TOTAL_BOOKINGS = 10;
export const NEW_MAX_TOTAL_BOOKINGS = 1;

export type CustomerTier = 'new' | 'regular' | 'vip';

export function classifyTier(totalBookings: number, totalSpent: number): CustomerTier {
  if (totalSpent >= VIP_MIN_TOTAL_SPENT || totalBookings >= VIP_MIN_TOTAL_BOOKINGS) {
    return 'vip';
  }
  if (totalBookings <= NEW_MAX_TOTAL_BOOKINGS) {
    return 'new';
  }
  return 'regular';
}

export function buildCustomerCode(id: string): string {
  return `KH-${id.slice(0, 8).toUpperCase()}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/customers/customer-classification.spec.ts`
Expected: PASS (4 + 1 assertions across 5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/customers/customer-classification.ts apps/api/src/customers/customer-classification.spec.ts
git commit -m "feat(customers): add tier classification and customer-code helpers"
```

---

### Task 2: `POST /customer-contacts` endpoint + shared e2e fixtures

Add an HTTP endpoint to create a walk-in contact (409 on duplicate phone — unlike the existing `findOrCreate`, which reuses). Also create the shared e2e fixtures file used by Tasks 3–5, and fix `clearDatabase` to truncate `customer_contacts`.

**Files:**
- Modify: `apps/api/src/customer-contacts/customer-contacts.service.ts` (add `create`)
- Create: `apps/api/src/customer-contacts/customer-contacts.controller.ts`
- Modify: `apps/api/src/customer-contacts/customer-contacts.module.ts` (register controller)
- Modify: `apps/api/test/utils/test-app.ts` (add `customer_contacts` to TRUNCATE)
- Create: `apps/api/test/utils/owner-fixtures.ts` (shared helpers)
- Test: `apps/api/test/customer-contacts.e2e-spec.ts`

**Interfaces:**
- Consumes: `CustomerContactsService` (existing), `NewCustomerDto` from `src/customer-contacts/dto/customer-selector.dto.ts`.
- Produces:
  - `CustomerContactsService.create(ownerId: string, data: { fullName: string; phone: string; email?: string; address?: string; note?: string }): Promise<CustomerContact>` — throws `ConflictException` if `(ownerId, phone)` already exists.
  - `POST /customer-contacts` → 201 with the created contact.
  - `test/utils/owner-fixtures.ts` helpers (signatures below) used by Tasks 3–5.

- [ ] **Step 1: Write the failing e2e test**

```ts
// apps/api/test/customer-contacts.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { createUser, loginAs } from './utils/owner-fixtures';
import { UserRole } from '../src/users/entities/user.entity';

describe('POST /customer-contacts (e2e)', () => {
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

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer()).post('/customer-contacts').send({}).expect(401);
  });

  it('rejects a non-owner with 403', async () => {
    await createUser(dataSource, 'cust@test.com', UserRole.CUSTOMER);
    const token = await loginAs(app, 'cust@test.com');
    await request(app.getHttpServer())
      .post('/customer-contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'A', phone: '0900000001' })
      .expect(403);
  });

  it('creates a walk-in contact and returns 201', async () => {
    await createUser(dataSource, 'owner@test.com', UserRole.OWNER);
    const token = await loginAs(app, 'owner@test.com');
    const res = await request(app.getHttpServer())
      .post('/customer-contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Nguyễn Văn A', phone: '0900000002', note: 'Thích sân 1' })
      .expect(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.fullName).toBe('Nguyễn Văn A');
    expect(res.body.phone).toBe('0900000002');
  });

  it('rejects a duplicate phone for the same owner with 409', async () => {
    await createUser(dataSource, 'owner@test.com', UserRole.OWNER);
    const token = await loginAs(app, 'owner@test.com');
    const payload = { fullName: 'A', phone: '0900000003' };
    await request(app.getHttpServer())
      .post('/customer-contacts')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);
    await request(app.getHttpServer())
      .post('/customer-contacts')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(409);
  });
});
```

- [ ] **Step 2: Create the shared fixtures file (support code for this and later tasks)**

```ts
// apps/api/test/utils/owner-fixtures.ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { User, UserRole, UserStatus } from '../../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../../src/courts/entities/court.entity';
import { Booking, BookingStatus } from '../../src/bookings/entities/booking.entity';
import { Payment, PaymentStatus } from '../../src/payments/entities/payment.entity';
import { CustomerContact } from '../../src/customer-contacts/entities/customer-contact.entity';

export async function createUser(
  ds: DataSource,
  email: string,
  role: UserRole,
  status: UserStatus = UserStatus.ACTIVE,
): Promise<User> {
  const passwordHash = await bcrypt.hash('password123', 10);
  const repo = ds.getRepository(User);
  return repo.save(
    repo.create({
      email,
      passwordHash,
      fullName: `User ${email}`,
      phone: '0900000000',
      role,
      status,
      emailVerified: true,
    }),
  );
}

export async function loginAs(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email, password: 'password123' });
  return res.body.accessToken as string;
}

export async function createVenue(ds: DataSource, ownerId: string, name: string): Promise<Venue> {
  const repo = ds.getRepository(Venue);
  return repo.save(
    repo.create({ ownerId, name, address: '123 Le Loi', city: 'Ho Chi Minh', status: VenueStatus.ACTIVE }),
  );
}

export async function createCourt(
  ds: DataSource,
  venueId: string,
  name: string,
  isActive = true,
): Promise<Court> {
  const repo = ds.getRepository(Court);
  return repo.save(
    repo.create({
      venueId,
      name,
      pricePerHour: 100000,
      openTime: '08:00',
      closeTime: '20:00',
      slotDurationMinutes: 60,
      status: isActive ? CourtStatus.ACTIVE : CourtStatus.CLOSED,
    }),
  );
}

export async function createContact(
  ds: DataSource,
  ownerId: string,
  fullName: string,
  phone: string,
  extra: { email?: string; address?: string; note?: string } = {},
): Promise<CustomerContact> {
  const repo = ds.getRepository(CustomerContact);
  return repo.save(
    repo.create({
      ownerId,
      fullName,
      phone,
      email: extra.email ?? null,
      address: extra.address ?? null,
      note: extra.note ?? null,
    }),
  );
}

export async function createBooking(
  ds: DataSource,
  courtId: string,
  opts: {
    customerId?: string;
    customerContactId?: string;
    totalPrice?: number;
    date?: string;
    status?: BookingStatus;
  },
): Promise<Booking> {
  const repo = ds.getRepository(Booking);
  return repo.save(
    repo.create({
      courtId,
      customerId: opts.customerId ?? null,
      customerContactId: opts.customerContactId ?? null,
      date: opts.date ?? '2026-08-29',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: opts.totalPrice ?? 100000,
      status: opts.status ?? BookingStatus.CONFIRMED,
    }),
  );
}

export async function payBooking(ds: DataSource, bookingId: string): Promise<Payment> {
  const repo = ds.getRepository(Payment);
  return repo.save(repo.create({ bookingId, status: PaymentStatus.PAID, paidAt: new Date() }));
}
```

- [ ] **Step 3: Add `customer_contacts` to the e2e TRUNCATE**

In `apps/api/test/utils/test-app.ts`, replace the TRUNCATE statement inside `clearDatabase` with (adds `customer_contacts` after `bookings`):

```ts
  await dataSource.query(
    'TRUNCATE TABLE disputes, payments, booking_slots, bookings, customer_contacts, venue_images, court_images, courts, venues, refresh_tokens, password_reset_tokens, email_verification_tokens, users RESTART IDENTITY CASCADE',
  );
```

- [ ] **Step 4: Run the e2e test to verify it fails**

Run: `cd apps/api && npx jest --config test/jest-e2e.json customer-contacts`
Expected: FAIL — `POST /customer-contacts` returns 404 (route not found) instead of 201/409.

- [ ] **Step 5: Add `create` to the service**

In `apps/api/src/customer-contacts/customer-contacts.service.ts`, add `ConflictException` to the `@nestjs/common` import and add this method to `CustomerContactsService`:

```ts
  async create(
    ownerId: string,
    data: { fullName: string; phone: string; email?: string; address?: string; note?: string },
  ): Promise<CustomerContact> {
    const existing = await this.repository.findOne({ where: { ownerId, phone: data.phone } });
    if (existing) {
      throw new ConflictException(`Đã tồn tại khách hàng với số điện thoại ${data.phone}`);
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
        throw new ConflictException(`Đã tồn tại khách hàng với số điện thoại ${data.phone}`);
      }
      throw error;
    }
  }
```

- [ ] **Step 6: Create the controller**

```ts
// apps/api/src/customer-contacts/customer-contacts.controller.ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CustomerContactsService } from './customer-contacts.service';
import { NewCustomerDto } from './dto/customer-selector.dto';

@Controller('customer-contacts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class CustomerContactsController {
  constructor(private readonly customerContactsService: CustomerContactsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: NewCustomerDto) {
    return this.customerContactsService.create(user.userId, dto);
  }
}
```

- [ ] **Step 7: Register the controller in the module**

In `apps/api/src/customer-contacts/customer-contacts.module.ts`, import `CustomerContactsController` and add `controllers: [CustomerContactsController],` to the `@Module` decorator (keep existing `imports`, `providers`, `exports`).

- [ ] **Step 8: Run tests to verify they pass**

Run: `cd apps/api && npx jest --config test/jest-e2e.json customer-contacts`
Expected: PASS (4 tests). Then run the existing contacts unit spec to confirm no regression: `npx jest src/customer-contacts/customer-contacts.service.spec.ts` → PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/customer-contacts apps/api/test/utils/owner-fixtures.ts apps/api/test/utils/test-app.ts apps/api/test/customer-contacts.e2e-spec.ts
git commit -m "feat(customer-contacts): add POST endpoint with duplicate-phone conflict"
```

---

### Task 3: Customers module + `GET /customers/summary`

Scaffold the `customers` module and the per-customer aggregation used by all read endpoints, exposed first via the summary endpoint.

**Files:**
- Create: `apps/api/src/customers/customers.service.ts`
- Create: `apps/api/src/customers/customers.controller.ts`
- Create: `apps/api/src/customers/customers.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `CustomersModule`)
- Test: `apps/api/test/customers-summary.e2e-spec.ts`

**Interfaces:**
- Consumes: `VenuesService` (from `CourtsModule`), `CustomerContactsService` (existing), `UsersService`, repositories for `Court`, `Booking`, `CustomerContact`; helpers from Task 1; fixtures from Task 2.
- Produces (relied on by Tasks 4 & 5):
  - `type CustomerKind = 'registered' | 'walkin'`
  - `interface CustomerListItem { kind: CustomerKind; id: string; fullName: string; phone: string | null; totalBookings: number; totalSpent: number; lastBookingAt: string | null; tier: CustomerTier; customerCode: string }`
  - `interface CustomerSummary { totalCustomers: number; vipCustomers: number; totalBookings: number; totalSpent: number }`
  - `CustomersService.aggregateCustomers(ownerId: string, venueId?: string): Promise<CustomerListItem[]>`
  - `CustomersService.getSummary(ownerId: string, venueId?: string): Promise<CustomerSummary>`
  - `GET /customers/summary?venueId=`

- [ ] **Step 1: Write the failing e2e test**

```ts
// apps/api/test/customers-summary.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import {
  createUser, loginAs, createVenue, createCourt, createBooking, payBooking, createContact,
} from './utils/owner-fixtures';
import { UserRole } from '../src/users/entities/user.entity';

describe('GET /customers/summary (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => { app = await createTestApp(); ds = app.get(DataSource); });
  beforeEach(async () => { await clearDatabase(app); });
  afterAll(async () => { await app.close(); });

  it('rejects a non-owner with 403', async () => {
    await createUser(ds, 'cust@test.com', UserRole.CUSTOMER);
    const token = await loginAs(app, 'cust@test.com');
    await request(app.getHttpServer())
      .get('/customers/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns all-zero summary for an owner with no customers', async () => {
    await createUser(ds, 'empty@test.com', UserRole.OWNER);
    const token = await loginAs(app, 'empty@test.com');
    const res = await request(app.getHttpServer())
      .get('/customers/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({ totalCustomers: 0, vipCustomers: 0, totalBookings: 0, totalSpent: 0 });
  });

  it('aggregates registered + walk-in customers scoped to the owner', async () => {
    const owner = await createUser(ds, 'owner@test.com', UserRole.OWNER);
    const other = await createUser(ds, 'other@test.com', UserRole.OWNER);
    const registered = await createUser(ds, 'reg@test.com', UserRole.CUSTOMER);

    const venue = await createVenue(ds, owner.id, 'My Venue');
    const court = await createCourt(ds, venue.id, 'Court 1');
    const otherVenue = await createVenue(ds, other.id, 'Not Mine');
    const otherCourt = await createCourt(ds, otherVenue.id, 'Other Court');

    // registered: 2 bookings, one paid 300k
    const b1 = await createBooking(ds, court.id, { customerId: registered.id, totalPrice: 300000 });
    await payBooking(ds, b1.id);
    await createBooking(ds, court.id, { customerId: registered.id, totalPrice: 150000 });

    // walk-in owned by owner: 1 booking paid 200k
    const contact = await createContact(ds, owner.id, 'Walk In', '0900000009');
    const b2 = await createBooking(ds, court.id, { customerContactId: contact.id, totalPrice: 200000 });
    await payBooking(ds, b2.id);

    // noise on another owner's court — must be excluded
    const otherReg = await createUser(ds, 'noise@test.com', UserRole.CUSTOMER);
    const b3 = await createBooking(ds, otherCourt.id, { customerId: otherReg.id, totalPrice: 999999 });
    await payBooking(ds, b3.id);

    const token = await loginAs(app, 'owner@test.com');
    const res = await request(app.getHttpServer())
      .get('/customers/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({
      totalCustomers: 2,      // 1 registered + 1 walk-in
      vipCustomers: 0,
      totalBookings: 3,       // 2 + 1
      totalSpent: 500000,     // 300k + 200k
    });
  });
});
```

- [ ] **Step 2: Run the e2e test to verify it fails**

Run: `cd apps/api && npx jest --config test/jest-e2e.json customers-summary`
Expected: FAIL — `GET /customers/summary` returns 404 (module not registered).

- [ ] **Step 3: Write the service**

```ts
// apps/api/src/customers/customers.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Court } from '../courts/entities/court.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { CustomerContact } from '../customer-contacts/entities/customer-contact.entity';
import { VenuesService } from '../courts/venues.service';
import { CustomerTier, buildCustomerCode, classifyTier } from './customer-classification';

export type CustomerKind = 'registered' | 'walkin';

export interface CustomerListItem {
  kind: CustomerKind;
  id: string;
  fullName: string;
  phone: string | null;
  totalBookings: number;
  totalSpent: number;
  lastBookingAt: string | null;
  tier: CustomerTier;
  customerCode: string;
}

export interface CustomerSummary {
  totalCustomers: number;
  vipCustomers: number;
  totalBookings: number;
  totalSpent: number;
}

interface RawCustomerRow {
  id: string;
  fullName: string;
  phone: string | null;
  totalBookings: string;
  totalSpent: string;
  lastBookingAt: string | null;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly venuesService: VenuesService,
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(CustomerContact)
    private readonly contactsRepository: Repository<CustomerContact>,
  ) {}

  private async resolveCourtIds(ownerId: string, venueId?: string): Promise<string[]> {
    const venueIds = venueId
      ? [(await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId)).id]
      : (await this.venuesService.findMineByOwner(ownerId)).map((v) => v.id);
    if (venueIds.length === 0) return [];
    const courts = await this.courtsRepository.find({ where: { venueId: In(venueIds) } });
    return courts.map((c) => c.id);
  }

  private toItem(kind: CustomerKind, row: RawCustomerRow): CustomerListItem {
    const totalBookings = Number(row.totalBookings);
    const totalSpent = Number(row.totalSpent);
    return {
      kind,
      id: row.id,
      fullName: row.fullName,
      phone: row.phone,
      totalBookings,
      totalSpent,
      lastBookingAt: row.lastBookingAt,
      tier: classifyTier(totalBookings, totalSpent),
      customerCode: buildCustomerCode(row.id),
    };
  }

  async aggregateCustomers(ownerId: string, venueId?: string): Promise<CustomerListItem[]> {
    const courtIds = await this.resolveCourtIds(ownerId, venueId);

    const registeredRows =
      courtIds.length === 0
        ? []
        : await this.bookingsRepository
            .createQueryBuilder('booking')
            .innerJoin('users', 'customer', 'customer.id::text = booking.customer_id')
            .leftJoin('payments', 'payment', 'payment.booking_id = booking.id::text')
            .select('booking.customer_id', 'id')
            .addSelect('customer.full_name', 'fullName')
            .addSelect('customer.phone', 'phone')
            .addSelect("COUNT(*) FILTER (WHERE booking.status <> 'cancelled')", 'totalBookings')
            .addSelect(
              "COALESCE(SUM(booking.total_price) FILTER (WHERE payment.status = 'paid'), 0)",
              'totalSpent',
            )
            .addSelect(
              "TO_CHAR(MAX(booking.date) FILTER (WHERE booking.status <> 'cancelled'), 'YYYY-MM-DD')",
              'lastBookingAt',
            )
            .where('booking.court_id IN (:...courtIds)', { courtIds })
            .andWhere('booking.customer_id IS NOT NULL')
            .groupBy('booking.customer_id')
            .addGroupBy('customer.full_name')
            .addGroupBy('customer.phone')
            .getRawMany<RawCustomerRow>();

    const walkinJoin = courtIds.length
      ? 'booking.customer_contact_id = contact.id AND booking.court_id IN (:...courtIds)'
      : 'booking.customer_contact_id = contact.id AND 1 = 0';
    const walkinRows = await this.contactsRepository
      .createQueryBuilder('contact')
      .leftJoin('bookings', 'booking', walkinJoin, courtIds.length ? { courtIds } : {})
      .leftJoin('payments', 'payment', 'payment.booking_id = booking.id::text')
      .select('contact.id', 'id')
      .addSelect('contact.full_name', 'fullName')
      .addSelect('contact.phone', 'phone')
      .addSelect("COUNT(booking.id) FILTER (WHERE booking.status <> 'cancelled')", 'totalBookings')
      .addSelect(
        "COALESCE(SUM(booking.total_price) FILTER (WHERE payment.status = 'paid'), 0)",
        'totalSpent',
      )
      .addSelect(
        "TO_CHAR(MAX(booking.date) FILTER (WHERE booking.status <> 'cancelled'), 'YYYY-MM-DD')",
        'lastBookingAt',
      )
      .where('contact.owner_id = :ownerId', { ownerId })
      .groupBy('contact.id')
      .addGroupBy('contact.full_name')
      .addGroupBy('contact.phone')
      .getRawMany<RawCustomerRow>();

    return [
      ...registeredRows.map((row) => this.toItem('registered', row)),
      ...walkinRows.map((row) => this.toItem('walkin', row)),
    ];
  }

  async getSummary(ownerId: string, venueId?: string): Promise<CustomerSummary> {
    const customers = await this.aggregateCustomers(ownerId, venueId);
    return {
      totalCustomers: customers.length,
      vipCustomers: customers.filter((c) => c.tier === 'vip').length,
      totalBookings: customers.reduce((sum, c) => sum + c.totalBookings, 0),
      totalSpent: customers.reduce((sum, c) => sum + c.totalSpent, 0),
    };
  }
}
```

- [ ] **Step 4: Write the controller**

```ts
// apps/api/src/customers/customers.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CustomersService } from './customers.service';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('summary')
  getSummary(@CurrentUser() user: AuthenticatedUser, @Query('venueId') venueId?: string) {
    return this.customersService.getSummary(user.userId, venueId);
  }
}
```

- [ ] **Step 5: Write the module**

```ts
// apps/api/src/customers/customers.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourtsModule } from '../courts/courts.module';
import { UsersModule } from '../users/users.module';
import { CustomerContactsModule } from '../customer-contacts/customer-contacts.module';
import { Court } from '../courts/entities/court.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { CustomerContact } from '../customer-contacts/entities/customer-contact.entity';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [
    CourtsModule,
    UsersModule,
    CustomerContactsModule,
    TypeOrmModule.forFeature([Court, Booking, CustomerContact]),
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
```

- [ ] **Step 6: Register the module**

In `apps/api/src/app.module.ts`, import `CustomersModule` and add it to the `imports` array of the root `@Module` (place it next to `DashboardModule`).

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/api && npx jest --config test/jest-e2e.json customers-summary`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/customers apps/api/src/app.module.ts apps/api/test/customers-summary.e2e-spec.ts
git commit -m "feat(customers): add customers module with GET /customers/summary"
```

---

### Task 4: `GET /customers` list (tier + search + sort + pagination)

Add the paginated list endpoint reusing `aggregateCustomers`.

**Files:**
- Create: `apps/api/src/customers/dto/list-customers.dto.ts`
- Modify: `apps/api/src/customers/customers.service.ts` (add `listCustomers`)
- Modify: `apps/api/src/customers/customers.controller.ts` (add `@Get()`)
- Test: `apps/api/test/customers-list.e2e-spec.ts`

**Interfaces:**
- Consumes: `CustomersService.aggregateCustomers` (Task 3), `CustomerListItem` (Task 3).
- Produces:
  - `class ListCustomersDto { venueId?: string; tier?: 'all'|'new'|'regular'|'vip'; search?: string; page?: string; pageSize?: string }`
  - `CustomersService.listCustomers(ownerId, dto): Promise<{ items: CustomerListItem[]; total: number; page: number; pageSize: number }>`
  - `GET /customers?venueId=&tier=&search=&page=&pageSize=`

- [ ] **Step 1: Write the failing e2e test**

```ts
// apps/api/test/customers-list.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import {
  createUser, loginAs, createVenue, createCourt, createBooking, createContact,
} from './utils/owner-fixtures';
import { UserRole } from '../src/users/entities/user.entity';

describe('GET /customers (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => { app = await createTestApp(); ds = app.get(DataSource); });
  beforeEach(async () => { await clearDatabase(app); });
  afterAll(async () => { await app.close(); });

  async function seedOwnerWithThreeWalkins() {
    const owner = await createUser(ds, 'owner@test.com', UserRole.OWNER);
    const venue = await createVenue(ds, owner.id, 'My Venue');
    const court = await createCourt(ds, venue.id, 'Court 1');
    // c1: booked 2026-08-20; c2: booked 2026-08-25; c3: never booked
    const c1 = await createContact(ds, owner.id, 'Alpha', '0911111111');
    const c2 = await createContact(ds, owner.id, 'Bravo', '0922222222');
    await createContact(ds, owner.id, 'Charlie', '0933333333');
    await createBooking(ds, court.id, { customerContactId: c1.id, date: '2026-08-20' });
    await createBooking(ds, court.id, { customerContactId: c2.id, date: '2026-08-25' });
    return { court };
  }

  it('returns 400 for an invalid tier', async () => {
    await createUser(ds, 'owner@test.com', UserRole.OWNER);
    const token = await loginAs(app, 'owner@test.com');
    await request(app.getHttpServer())
      .get('/customers?tier=platinum')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('sorts by lastBookingAt desc with never-booked customers last', async () => {
    await seedOwnerWithThreeWalkins();
    const token = await loginAs(app, 'owner@test.com');
    const res = await request(app.getHttpServer())
      .get('/customers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items.map((c: { fullName: string }) => c.fullName)).toEqual([
      'Bravo', 'Alpha', 'Charlie',
    ]);
    expect(res.body.items[0].customerCode).toMatch(/^KH-[0-9A-F]{8}$/);
  });

  it('paginates and clamps pageSize to 100', async () => {
    await seedOwnerWithThreeWalkins();
    const token = await loginAs(app, 'owner@test.com');

    const page1 = await request(app.getHttpServer())
      .get('/customers?page=1&pageSize=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });

    const page2 = await request(app.getHttpServer())
      .get('/customers?page=2&pageSize=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(page2.body.items).toHaveLength(1);

    const clamped = await request(app.getHttpServer())
      .get('/customers?pageSize=999')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(clamped.body.pageSize).toBe(100);
  });

  it('filters by search on phone', async () => {
    await seedOwnerWithThreeWalkins();
    const token = await loginAs(app, 'owner@test.com');
    const res = await request(app.getHttpServer())
      .get('/customers?search=0922222222')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].fullName).toBe('Bravo');
  });

  it('filters by tier=new', async () => {
    await seedOwnerWithThreeWalkins();
    const token = await loginAs(app, 'owner@test.com');
    const res = await request(app.getHttpServer())
      .get('/customers?tier=new')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // all three have <=1 booking → all "new"
    expect(res.body.total).toBe(3);
  });
});
```

- [ ] **Step 2: Run the e2e test to verify it fails**

Run: `cd apps/api && npx jest --config test/jest-e2e.json customers-list`
Expected: FAIL — `GET /customers` returns 404 (route not defined).

- [ ] **Step 3: Write the DTO**

```ts
// apps/api/src/customers/dto/list-customers.dto.ts
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ListCustomersDto {
  @IsOptional()
  @IsString()
  venueId?: string;

  @IsOptional()
  @IsIn(['all', 'new', 'regular', 'vip'])
  tier?: 'all' | 'new' | 'regular' | 'vip';

  @IsOptional()
  @IsString()
  search?: string;

  // ValidationPipe has no transform → these arrive as strings; parsed/clamped in the service.
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
```

- [ ] **Step 4: Add `listCustomers` to the service**

Add these two module-level helpers (above the class) and the method to `CustomersService` in `apps/api/src/customers/customers.service.ts`. Import `ListCustomersDto`:

```ts
import { ListCustomersDto } from './dto/list-customers.dto';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function clampPage(raw?: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function clampPageSize(raw?: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(n)));
}
```

```ts
  async listCustomers(
    ownerId: string,
    dto: ListCustomersDto,
  ): Promise<{ items: CustomerListItem[]; total: number; page: number; pageSize: number }> {
    const all = await this.aggregateCustomers(ownerId, dto.venueId);

    const tier = dto.tier && dto.tier !== 'all' ? dto.tier : null;
    const search = dto.search?.trim().toLowerCase();

    let filtered = all;
    if (tier) {
      filtered = filtered.filter((c) => c.tier === tier);
    }
    if (search) {
      filtered = filtered.filter(
        (c) =>
          c.fullName.toLowerCase().includes(search) ||
          (c.phone ?? '').toLowerCase().includes(search),
      );
    }

    filtered = [...filtered].sort((a, b) => {
      if (a.lastBookingAt && b.lastBookingAt) {
        if (a.lastBookingAt !== b.lastBookingAt) {
          return a.lastBookingAt < b.lastBookingAt ? 1 : -1; // desc
        }
      } else if (a.lastBookingAt) {
        return -1; // a booked, b never → a first
      } else if (b.lastBookingAt) {
        return 1;
      }
      return a.fullName.localeCompare(b.fullName);
    });

    const page = clampPage(dto.page);
    const pageSize = clampPageSize(dto.pageSize);
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
    };
  }
```

- [ ] **Step 5: Add the list endpoint to the controller**

In `apps/api/src/customers/customers.controller.ts`, add `Query` is already imported; import the DTO and add the handler:

```ts
import { ListCustomersDto } from './dto/list-customers.dto';
```

```ts
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCustomersDto) {
    return this.customersService.listCustomers(user.userId, query);
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd apps/api && npx jest --config test/jest-e2e.json customers-list`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/customers apps/api/test/customers-list.e2e-spec.ts
git commit -m "feat(customers): add paginated GET /customers with tier, search and sort"
```

---

### Task 5: `GET /customers/:kind/:id` detail

Return a single customer's full detail (identity fields + stats + `joinedAt`), 404 when out of the owner's scope.

**Files:**
- Modify: `apps/api/src/customers/customers.service.ts` (add `getCustomerDetail`, inject deps)
- Modify: `apps/api/src/customers/customers.controller.ts` (add `@Get(':kind/:id')`)
- Test: `apps/api/test/customers-detail.e2e-spec.ts`

**Interfaces:**
- Consumes: `CustomersService.aggregateCustomers` (Task 3), `CustomerContactsService.findByIdForOwner` (existing), `UsersService.findById` (existing).
- Produces:
  - `interface CustomerDetail extends CustomerListItem { email?: string; address?: string; note?: string; joinedAt: string }`
  - `CustomersService.getCustomerDetail(ownerId: string, kind: string, id: string): Promise<CustomerDetail>`
  - `GET /customers/:kind/:id`

- [ ] **Step 1: Write the failing e2e test**

```ts
// apps/api/test/customers-detail.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import {
  createUser, loginAs, createVenue, createCourt, createBooking, payBooking, createContact,
} from './utils/owner-fixtures';
import { UserRole } from '../src/users/entities/user.entity';

describe('GET /customers/:kind/:id (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => { app = await createTestApp(); ds = app.get(DataSource); });
  beforeEach(async () => { await clearDatabase(app); });
  afterAll(async () => { await app.close(); });

  it('returns registered customer detail with stats and joinedAt', async () => {
    const owner = await createUser(ds, 'owner@test.com', UserRole.OWNER);
    const registered = await createUser(ds, 'reg@test.com', UserRole.CUSTOMER);
    const venue = await createVenue(ds, owner.id, 'My Venue');
    const court = await createCourt(ds, venue.id, 'Court 1');
    const b = await createBooking(ds, court.id, { customerId: registered.id, totalPrice: 300000 });
    await payBooking(ds, b.id);

    const token = await loginAs(app, 'owner@test.com');
    const res = await request(app.getHttpServer())
      .get(`/customers/registered/${registered.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({
      kind: 'registered',
      id: registered.id,
      email: 'reg@test.com',
      totalBookings: 1,
      totalSpent: 300000,
      tier: 'new',
    });
    expect(res.body.customerCode).toBe(`KH-${registered.id.slice(0, 8).toUpperCase()}`);
    expect(typeof res.body.joinedAt).toBe('string');
  });

  it('returns 404 for a registered user who never booked at the owner venues', async () => {
    const owner = await createUser(ds, 'owner@test.com', UserRole.OWNER);
    const stranger = await createUser(ds, 'stranger@test.com', UserRole.CUSTOMER);
    await createVenue(ds, owner.id, 'My Venue');
    const token = await loginAs(app, 'owner@test.com');
    await request(app.getHttpServer())
      .get(`/customers/registered/${stranger.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns walk-in detail including email/address/note', async () => {
    const owner = await createUser(ds, 'owner@test.com', UserRole.OWNER);
    const contact = await createContact(ds, owner.id, 'Walk In', '0900000009', {
      email: 'walk@test.com', address: '1 Nguyen Hue', note: 'VIP treatment',
    });
    const token = await loginAs(app, 'owner@test.com');
    const res = await request(app.getHttpServer())
      .get(`/customers/walkin/${contact.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toMatchObject({
      kind: 'walkin', id: contact.id, email: 'walk@test.com',
      address: '1 Nguyen Hue', note: 'VIP treatment', totalBookings: 0, tier: 'new',
    });
  });

  it("returns 404 for another owner's walk-in contact", async () => {
    await createUser(ds, 'owner@test.com', UserRole.OWNER);
    const other = await createUser(ds, 'other@test.com', UserRole.OWNER);
    const contact = await createContact(ds, other.id, 'Not Yours', '0900000010');
    const token = await loginAs(app, 'owner@test.com');
    await request(app.getHttpServer())
      .get(`/customers/walkin/${contact.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns 404 for an unknown kind', async () => {
    await createUser(ds, 'owner@test.com', UserRole.OWNER);
    const token = await loginAs(app, 'owner@test.com');
    await request(app.getHttpServer())
      .get('/customers/ghost/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
```

- [ ] **Step 2: Run the e2e test to verify it fails**

Run: `cd apps/api && npx jest --config test/jest-e2e.json customers-detail`
Expected: FAIL — `GET /customers/:kind/:id` returns 404 for the happy path too (route not defined).

- [ ] **Step 3: Extend the service**

In `apps/api/src/customers/customers.service.ts`:

1. Add imports and inject the two services:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerContactsService } from '../customer-contacts/customer-contacts.service';
import { UsersService } from '../users/users.service';
```

Add to the constructor parameter list (after the existing repositories):

```ts
    private readonly customerContactsService: CustomerContactsService,
    private readonly usersService: UsersService,
```

2. Add the detail type near the other interfaces:

```ts
export interface CustomerDetail extends CustomerListItem {
  email?: string;
  address?: string;
  note?: string;
  joinedAt: string;
}
```

3. Add the method:

```ts
  async getCustomerDetail(ownerId: string, kind: string, id: string): Promise<CustomerDetail> {
    if (kind !== 'registered' && kind !== 'walkin') {
      throw new NotFoundException('Khách hàng không tồn tại');
    }

    const all = await this.aggregateCustomers(ownerId);
    const row = all.find((c) => c.kind === kind && c.id === id);
    if (!row) {
      throw new NotFoundException('Khách hàng không tồn tại');
    }

    if (kind === 'walkin') {
      const contact = await this.customerContactsService.findByIdForOwner(ownerId, id);
      return {
        ...row,
        email: contact.email ?? undefined,
        address: contact.address ?? undefined,
        note: contact.note ?? undefined,
        joinedAt: contact.createdAt.toISOString(),
      };
    }

    const user = await this.usersService.findById(id);
    if (!user) {
      throw new NotFoundException('Khách hàng không tồn tại');
    }
    return {
      ...row,
      email: user.email,
      joinedAt: user.createdAt.toISOString(),
    };
  }
```

- [ ] **Step 4: Add the detail endpoint to the controller**

In `apps/api/src/customers/customers.controller.ts`, add `Param` to the `@nestjs/common` import and add:

```ts
  @Get(':kind/:id')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.customersService.getCustomerDetail(user.userId, kind, id);
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest --config test/jest-e2e.json customers-detail`
Expected: PASS (5 tests).

- [ ] **Step 6: Run the whole customers + contacts suite for regressions**

Run: `cd apps/api && npx jest --config test/jest-e2e.json customers && npx jest src/customers src/customer-contacts`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/customers apps/api/test/customers-detail.e2e-spec.ts
git commit -m "feat(customers): add GET /customers/:kind/:id detail endpoint"
```

---

## Spec Coverage Check

- **§3 Tier classification** → Task 1 (`classifyTier`, thresholds) + verified in list/summary/detail e2e.
- **§5 `GET /customers` (list, tier, search, pagination, sort)** → Task 4. Response shape `{ items, total, page, pageSize }` per updated spec.
- **§5 `GET /customers/summary`** → Task 3, scoped by `venueId` only (ignores tier/search) per updated spec.
- **§5 `GET /customers/:kind/:id`** (customerCode, joinedAt, `note?` for walk-in) → Task 5.
- **§5 `POST /customer-contacts`** → Task 2.
- **§6 Validation** → 403 non-owner (all tasks), 409 duplicate phone (Task 2), invalid tier 400 (Task 4), page/pageSize clamping (Task 4), 404 out-of-scope registered / other-owner walk-in / unknown kind (Task 5).
- **§7 Testing** → unit (Task 1), e2e for every endpoint including pagination + summary-ignores-filter behavior.
- **Out of scope (unchanged):** edit/delete contacts, manual VIP tagging, configurable thresholds — not implemented, matching spec §8. `§4` Bookings walk-in wiring already exists in the codebase and is untouched.
