# Admin Dispute Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer file a dispute against a paid booking, and let an admin resolve it by either triggering a real refund or rejecting it — completing the third and final piece of the original "Admin" idea (after Approvals and Platform Stats).

**Architecture:** A new `disputes` table + `DisputesModule` (customer-facing `DisputesController`) owns the dispute lifecycle but delegates all booking/payment work to the existing `BookingsService`/`PaymentsService` rather than touching those tables directly. Two small, behavior-preserving additions make that possible: `BookingsService.findByIdOrThrow` (unscoped lookup, mirrors `VenuesService.findByIdOrThrow`) and `PaymentsService.adminRefund` (refund without the owner-ownership check that `markRefunded` requires — extracted from a shared private `performRefund` helper so the two don't duplicate the status-transition/notification logic). Admin-facing routes live in `AdminDisputesController` inside the existing `admin` module, matching how `AdminVenuesController`/`AdminStatsController` already reach into other modules' services.

**Tech Stack:** NestJS, TypeORM (hand-written migration — this repo runs `synchronize: false`), Jest (`*.spec.ts` unit, `*.e2e-spec.ts` against real Postgres), Next.js App Router BFF proxy pattern.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-26-admin-dispute-handling-design.md`.
- One dispute per booking, ever (`booking_id` unique on `disputes`) — no re-filing after resolution.
- A dispute can only be filed when `payment.status = 'paid'` for that booking.
- Resolving as `refund` must trigger a real refund (same effect as the owner's existing "mark refunded" action); resolving as `reject` must not touch payment state.
- Foreign-key-shaped columns in this codebase are stored as `character varying`, not `uuid` (confirmed in every existing migration — `payments.booking_id`, `bookings.customer_id`, etc.) — `disputes.booking_id`/`customer_id`/`resolved_by` follow the same convention.
- `synchronize: false` — schema changes require a migration file **and** running `npm run migration:run` against the dev/test database (they share one DB in this environment; there is no separate `.env.test`).

---

## Task 1: `Dispute` entity + migration

**Files:**
- Create: `apps/api/src/disputes/entities/dispute.entity.ts`
- Create: `apps/api/src/migrations/1787760000000-CreateDisputes.ts`
- Modify: `apps/api/test/utils/test-app.ts`

**Interfaces:**
- Produces: `Dispute` entity, `DisputeStatus` enum (`PENDING`/`RESOLVED_REFUND`/`REJECTED`) — consumed by every later task.

There's no unit test for a schema change — this task is verified by running the migration against the real dev Postgres and confirming the table exists.

- [ ] **Step 1: Create the entity**

Create `apps/api/src/disputes/entities/dispute.entity.ts`:

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DisputeStatus {
  PENDING = 'pending',
  RESOLVED_REFUND = 'resolved_refund',
  REJECTED = 'rejected',
}

@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', unique: true })
  bookingId: string;

  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({
    type: 'enum',
    enum: DisputeStatus,
    default: DisputeStatus.PENDING,
  })
  status: DisputeStatus;

  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote: string | null;

  @Column({ name: 'resolved_by', nullable: true, type: 'varchar' })
  resolvedBy: string | null;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Write the migration**

Create `apps/api/src/migrations/1787760000000-CreateDisputes.ts`:

```ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDisputes1787760000000 implements MigrationInterface {
    name = 'CreateDisputes1787760000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."disputes_status_enum" AS ENUM('pending', 'resolved_refund', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "disputes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "booking_id" character varying NOT NULL, "customer_id" character varying NOT NULL, "reason" text NOT NULL, "status" "public"."disputes_status_enum" NOT NULL DEFAULT 'pending', "admin_note" text, "resolved_by" character varying, "resolved_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_disputes_booking_id" UNIQUE ("booking_id"), CONSTRAINT "PK_disputes_id" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "disputes"`);
        await queryRunner.query(`DROP TYPE "public"."disputes_status_enum"`);
    }

}
```

- [ ] **Step 3: Run the migration**

Run (from `apps/api`): `npm run migration:run`
Expected: output lists `CreateDisputes1787760000000` as applied, no errors. Verify the table exists:

Run: `docker exec pickleball-postgres-1 psql -U pickleball -d pickleball -c "\d disputes"`
Expected: shows the `disputes` table with all 10 columns listed above.

- [ ] **Step 4: Add `disputes` to the e2e test-database cleanup**

In `apps/api/test/utils/test-app.ts`, change the `clearDatabase` function's `TRUNCATE` statement from:

```ts
export async function clearDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  await dataSource.query(
    'TRUNCATE TABLE payments, booking_slots, bookings, venue_images, courts, venues, refresh_tokens, password_reset_tokens, email_verification_tokens, users RESTART IDENTITY CASCADE',
  );
}
```

to:

```ts
export async function clearDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  await dataSource.query(
    'TRUNCATE TABLE disputes, payments, booking_slots, bookings, venue_images, courts, venues, refresh_tokens, password_reset_tokens, email_verification_tokens, users RESTART IDENTITY CASCADE',
  );
}
```

This matters because the dev and e2e-test suites share one Postgres database in this environment (no separate `.env.test`) — without this, disputes from one e2e run would leak into the next and corrupt `GET /admin/disputes` counts.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/disputes/entities/dispute.entity.ts apps/api/src/migrations/1787760000000-CreateDisputes.ts apps/api/test/utils/test-app.ts
git commit -m "feat(disputes): add Dispute entity and migration"
```

---

## Task 2: `BookingsService.findByIdOrThrow`

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts`
- Test: `apps/api/src/bookings/bookings.service.spec.ts`

**Interfaces:**
- Produces: `BookingsService.findByIdOrThrow(id: string): Promise<Booking>` — consumed by Task 3 (`PaymentsService.adminRefund`) and Task 5 (`DisputesService.findAllForAdmin`).

- [ ] **Step 1: Write the failing test**

Open `apps/api/src/bookings/bookings.service.spec.ts`, find the `buildTestingModule`/mock-repository setup already in that file (it mirrors the `mockRepository`/`buildTestingModule` pattern used throughout this codebase), and append this describe block at the end of the file:

```ts
describe('BookingsService.findByIdOrThrow', () => {
  it('returns the booking regardless of who owns it', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.findOne.mockResolvedValue({ id: 'booking-1', customerId: 'someone-else' });

    const result = await service.findByIdOrThrow('booking-1');

    expect(result.id).toBe('booking-1');
  });

  it('throws NotFoundException when the booking does not exist', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.findOne.mockResolvedValue(null);

    await expect(service.findByIdOrThrow('booking-1')).rejects.toThrow(
      'Booking booking-1 không tồn tại',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/api`): `npm test -- bookings.service.spec.ts`
Expected: FAIL — `service.findByIdOrThrow is not a function`.

- [ ] **Step 3: Implement `findByIdOrThrow`**

In `apps/api/src/bookings/bookings.service.ts`, add this method right after `findByIdForOwnerOrThrow` (after the closing brace on line 276, before `async getAvailability`):

```ts
  async findByIdOrThrow(id: string): Promise<Booking> {
    const booking = await this.bookingsRepository.findOne({ where: { id } });
    if (!booking) {
      throw new NotFoundException(`Booking ${id} không tồn tại`);
    }
    return booking;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- bookings.service.spec.ts`
Expected: PASS (all tests in the file, including the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.service.spec.ts
git commit -m "feat(bookings): add findByIdOrThrow for unscoped lookups"
```

---

## Task 3: `PaymentsService.adminRefund`

**Files:**
- Modify: `apps/api/src/payments/payments.service.ts`
- Modify: `apps/api/src/payments/payments.service.spec.ts`

**Interfaces:**
- Consumes: `BookingsService.findByIdOrThrow` (Task 2).
- Produces: `PaymentsService.adminRefund(bookingId: string, adminId: string, note?: string): Promise<Payment>` — consumed by Task 5 (`DisputesService.resolve`).

- [ ] **Step 1: Write the failing test**

In `apps/api/src/payments/payments.service.spec.ts`, add `findByIdOrThrow: jest.fn()` to the `mockBookingsService` factory:

```ts
const mockBookingsService = () => ({
  findByIdForOwnerOrThrow: jest.fn(),
  findByIdOrThrow: jest.fn(),
});
```

Then append this describe block at the end of the file (after the `PaymentsService.markRefunded` describe block, before end of file):

```ts
describe('PaymentsService.adminRefund', () => {
  it('transitions paid to refunded without requiring venue ownership, attributed to the admin', async () => {
    const {
      service,
      paymentsRepo,
      bookingsService,
      usersService,
      notificationsService,
    } = await buildTestingModule();
    bookingsService.findByIdOrThrow.mockResolvedValue({
      id: 'booking-1',
      customerId: 'customer-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 100000,
    } as Booking);
    paymentsRepo.findOne.mockResolvedValue({
      id: 'payment-1',
      bookingId: 'booking-1',
      status: PaymentStatus.PAID,
      note: null,
    });
    usersService.findById.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@test.com',
    });

    const result = await service.adminRefund('booking-1', 'admin-1', 'Đã xác minh khiếu nại');

    expect(bookingsService.findByIdOrThrow).toHaveBeenCalledWith('booking-1');
    expect(result.status).toBe(PaymentStatus.REFUNDED);
    expect(result.refundedBy).toBe('admin-1');
    expect(result.note).toBe('Đã xác minh khiếu nại');
    expect(result.refundedAt).toBeInstanceOf(Date);
    expect(notificationsService.notifyPaymentRefunded).toHaveBeenCalledWith({
      to: 'customer@test.com',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 100000,
    });
  });

  it('throws BadRequestException when payment is not paid', async () => {
    const { service, paymentsRepo, bookingsService } = await buildTestingModule();
    bookingsService.findByIdOrThrow.mockResolvedValue({ id: 'booking-1' } as Booking);
    paymentsRepo.findOne.mockResolvedValue({
      id: 'payment-1',
      bookingId: 'booking-1',
      status: PaymentStatus.UNPAID,
    });

    await expect(service.adminRefund('booking-1', 'admin-1')).rejects.toThrow(
      'Chỉ có thể đánh dấu đã hoàn tiền khi đang ở trạng thái đã thanh toán',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/api`): `npm test -- payments.service.spec.ts`
Expected: FAIL — `service.adminRefund is not a function`.

- [ ] **Step 3: Implement `adminRefund`, extracting the shared refund logic**

Replace the entire contents of `apps/api/src/payments/payments.service.ts` with:

```ts
import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingsService } from '../bookings/bookings.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @Inject(forwardRef(() => BookingsService))
    private readonly bookingsService: BookingsService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createForBooking(
    bookingId: string,
    manager?: EntityManager,
  ): Promise<Payment> {
    const repo = manager
      ? manager.getRepository(Payment)
      : this.paymentsRepository;
    const payment = repo.create({
      bookingId,
      status: PaymentStatus.UNPAID,
    });
    return repo.save(payment);
  }

  findByBookingId(bookingId: string): Promise<Payment | null> {
    return this.paymentsRepository.findOne({ where: { bookingId } });
  }

  async markPaid(
    ownerId: string,
    venueId: string,
    bookingId: string,
    note?: string,
  ): Promise<Payment> {
    const booking = await this.bookingsService.findByIdForOwnerOrThrow(
      ownerId,
      venueId,
      bookingId,
    );
    const payment = await this.getPaymentOrThrow(bookingId);
    if (payment.status !== PaymentStatus.UNPAID) {
      throw new BadRequestException(
        'Chỉ có thể đánh dấu đã nhận tiền khi đang ở trạng thái chưa thanh toán',
      );
    }
    payment.status = PaymentStatus.PAID;
    payment.paidAt = new Date();
    payment.paidBy = ownerId;
    if (note !== undefined) payment.note = note;
    const saved = await this.paymentsRepository.save(payment);

    const customer = await this.usersService.findById(booking.customerId);
    await this.notificationsService.notifyPaymentConfirmed({
      to: customer?.email ?? '',
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      totalPrice: booking.totalPrice,
    });

    return saved;
  }

  async markRefunded(
    ownerId: string,
    venueId: string,
    bookingId: string,
    note?: string,
  ): Promise<Payment> {
    const booking = await this.bookingsService.findByIdForOwnerOrThrow(
      ownerId,
      venueId,
      bookingId,
    );
    return this.performRefund(booking, ownerId, note);
  }

  async adminRefund(
    bookingId: string,
    adminId: string,
    note?: string,
  ): Promise<Payment> {
    const booking = await this.bookingsService.findByIdOrThrow(bookingId);
    return this.performRefund(booking, adminId, note);
  }

  private async performRefund(
    booking: Booking,
    performedBy: string,
    note?: string,
  ): Promise<Payment> {
    const payment = await this.getPaymentOrThrow(booking.id);
    if (payment.status !== PaymentStatus.PAID) {
      throw new BadRequestException(
        'Chỉ có thể đánh dấu đã hoàn tiền khi đang ở trạng thái đã thanh toán',
      );
    }
    payment.status = PaymentStatus.REFUNDED;
    payment.refundedAt = new Date();
    payment.refundedBy = performedBy;
    if (note !== undefined) payment.note = note;
    const saved = await this.paymentsRepository.save(payment);

    const customer = await this.usersService.findById(booking.customerId);
    await this.notificationsService.notifyPaymentRefunded({
      to: customer?.email ?? '',
      date: booking.date,
      startTime: booking.startTime,
      endTime: booking.endTime,
      totalPrice: booking.totalPrice,
    });

    return saved;
  }

  private async getPaymentOrThrow(bookingId: string): Promise<Payment> {
    const payment = await this.findByBookingId(bookingId);
    if (!payment) {
      throw new NotFoundException(
        `Payment cho booking ${bookingId} không tồn tại`,
      );
    }
    return payment;
  }
}
```

This is a behavior-preserving refactor: `markRefunded`'s public signature and behavior are unchanged (it still calls `findByIdForOwnerOrThrow` first), so the existing `PaymentsService.markRefunded` tests should pass without modification.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- payments.service.spec.ts`
Expected: PASS (all tests, including the pre-existing `markPaid`/`markRefunded` ones and the 2 new `adminRefund` ones).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payments/payments.service.ts apps/api/src/payments/payments.service.spec.ts
git commit -m "feat(payments): add adminRefund, extract shared performRefund helper"
```

---

## Task 4: `NotificationsService.notifyDisputeRejected`

**Files:**
- Modify: `apps/api/src/notifications/notifications.service.ts`
- Modify: `apps/api/src/notifications/notifications.service.spec.ts`

**Interfaces:**
- Produces: `NotificationsService.notifyDisputeRejected({ to, customerName, reason?: string }): Promise<void>` — consumed by Task 5 (`DisputesService.resolve`).

- [ ] **Step 1: Write the failing test**

Append to `apps/api/src/notifications/notifications.service.spec.ts` (after the `NotificationsService.notifyVenueRejected` describe block, before `NotificationsService best-effort error handling`):

```ts
describe('NotificationsService.notifyDisputeRejected', () => {
  it('includes the reason in the email when provided', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyDisputeRejected({
      to: 'customer@test.com',
      customerName: 'Nguyễn Văn A',
      reason: 'Không đủ căn cứ hoàn tiền',
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'customer@test.com',
      'Khiếu nại của bạn đã bị từ chối',
      expect.stringContaining('Không đủ căn cứ hoàn tiền'),
    );
  });

  it('omits the reason section when not provided', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyDisputeRejected({
      to: 'customer@test.com',
      customerName: 'Nguyễn Văn A',
    });

    const html = mailService.send.mock.calls[0][2];
    expect(html).not.toContain('Lý do');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/api`): `npm test -- notifications.service.spec.ts`
Expected: FAIL — `service.notifyDisputeRejected is not a function`.

- [ ] **Step 3: Implement the method**

In `apps/api/src/notifications/notifications.service.ts`, add this interface after `VenueRejectionParams` (before the `@Injectable()` class):

```ts
export interface DisputeRejectionParams {
  to: string;
  customerName: string;
  reason?: string;
}
```

Add this method right after `notifyVenueRejected` (before `private async sendSafely`):

```ts
  notifyDisputeRejected(params: DisputeRejectionParams): Promise<void> {
    const reasonHtml = params.reason ? `<p>Lý do: ${params.reason}</p>` : '';
    const html = `<p>Chào ${params.customerName}, khiếu nại của bạn về một booking đã bị từ chối.</p>${reasonHtml}`;
    return this.sendSafely(params.to, 'Khiếu nại của bạn đã bị từ chối', html);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- notifications.service.spec.ts`
Expected: PASS (all tests, including the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/notifications/notifications.service.ts apps/api/src/notifications/notifications.service.spec.ts
git commit -m "feat(notifications): add dispute rejection email"
```

---

## Task 5: `DisputesService`

**Files:**
- Create: `apps/api/src/disputes/disputes.service.ts`
- Test: `apps/api/src/disputes/disputes.service.spec.ts`

**Interfaces:**
- Consumes: `BookingsService.findMineById`/`findByIdOrThrow` (Task 2, existing), `PaymentsService.adminRefund` (Task 3), `NotificationsService.notifyDisputeRejected` (Task 4), `CourtsService.findByIdOrThrow`/`VenuesService.findByIdOrThrow` (existing), `UsersService.findById` (existing), `Dispute`/`DisputeStatus` (Task 1).
- Produces:
  ```ts
  interface AdminDisputeRow {
    id: string;
    status: DisputeStatus;
    reason: string;
    createdAt: Date;
    customer: { id: string; fullName: string; email: string };
    booking: {
      id: string;
      courtName: string;
      venueName: string;
      date: string;
      startTime: string;
      endTime: string;
      totalPrice: number;
    };
  }
  ```
  `DisputesService.createDispute(customerId, bookingId, reason): Promise<Dispute>`, `findMineByCustomer(customerId): Promise<Dispute[]>`, `findAllForAdmin(status: 'pending' | 'all'): Promise<AdminDisputeRow[]>`, `resolve(id, adminId, action: 'refund' | 'reject', note?): Promise<Dispute>` — consumed by Task 6 (`DisputesController`/`AdminDisputesController`).

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/disputes/disputes.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DisputesService } from './disputes.service';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import { BookingsService } from '../bookings/bookings.service';
import { PaymentsService } from '../payments/payments.service';
import { CourtsService } from '../courts/courts.service';
import { VenuesService } from '../courts/venues.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentStatus } from '../payments/entities/payment.entity';

const mockDisputesRepository = () => ({
  create: jest.fn((data: unknown) => data),
  save: jest.fn((data: unknown) =>
    Promise.resolve({ id: 'dispute-1', ...(data as object) }),
  ),
  findOne: jest.fn(),
  find: jest.fn(),
});

const mockBookingsService = () => ({
  findMineById: jest.fn(),
  findByIdOrThrow: jest.fn(),
});

const mockPaymentsService = () => ({
  adminRefund: jest.fn(),
});

const mockCourtsService = () => ({
  findByIdOrThrow: jest.fn(),
});

const mockVenuesService = () => ({
  findByIdOrThrow: jest.fn(),
});

const mockUsersService = () => ({
  findById: jest.fn(),
});

const mockNotificationsService = () => ({
  notifyDisputeRejected: jest.fn().mockResolvedValue(undefined),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      DisputesService,
      {
        provide: getRepositoryToken(Dispute),
        useFactory: mockDisputesRepository,
      },
      { provide: BookingsService, useFactory: mockBookingsService },
      { provide: PaymentsService, useFactory: mockPaymentsService },
      { provide: CourtsService, useFactory: mockCourtsService },
      { provide: VenuesService, useFactory: mockVenuesService },
      { provide: UsersService, useFactory: mockUsersService },
      { provide: NotificationsService, useFactory: mockNotificationsService },
    ],
  }).compile();

  return {
    service: module.get(DisputesService),
    disputesRepo: module.get(getRepositoryToken(Dispute)) as ReturnType<
      typeof mockDisputesRepository
    >,
    bookingsService: module.get(BookingsService) as ReturnType<
      typeof mockBookingsService
    >,
    paymentsService: module.get(PaymentsService) as ReturnType<
      typeof mockPaymentsService
    >,
    courtsService: module.get(CourtsService) as ReturnType<
      typeof mockCourtsService
    >,
    venuesService: module.get(VenuesService) as ReturnType<
      typeof mockVenuesService
    >,
    usersService: module.get(UsersService) as ReturnType<
      typeof mockUsersService
    >,
    notificationsService: module.get(NotificationsService) as ReturnType<
      typeof mockNotificationsService
    >,
  };
}

describe('DisputesService.createDispute', () => {
  it('creates a pending dispute for a paid booking', async () => {
    const { service, disputesRepo, bookingsService } = await buildTestingModule();
    bookingsService.findMineById.mockResolvedValue({
      id: 'booking-1',
      paymentStatus: PaymentStatus.PAID,
    });
    disputesRepo.findOne.mockResolvedValue(null);

    const result = await service.createDispute(
      'customer-1',
      'booking-1',
      'Bị tính sai tiền',
    );

    expect(bookingsService.findMineById).toHaveBeenCalledWith(
      'customer-1',
      'booking-1',
    );
    expect(disputesRepo.create).toHaveBeenCalledWith({
      bookingId: 'booking-1',
      customerId: 'customer-1',
      reason: 'Bị tính sai tiền',
      status: DisputeStatus.PENDING,
    });
    expect(result.status).toBe(DisputeStatus.PENDING);
  });

  it('throws BadRequestException when the booking payment is not paid', async () => {
    const { service, bookingsService } = await buildTestingModule();
    bookingsService.findMineById.mockResolvedValue({
      id: 'booking-1',
      paymentStatus: PaymentStatus.UNPAID,
    });

    await expect(
      service.createDispute('customer-1', 'booking-1', 'Bị tính sai tiền'),
    ).rejects.toThrow('Chỉ có thể khiếu nại booking đã thanh toán');
  });

  it('throws ConflictException when a dispute already exists for the booking', async () => {
    const { service, disputesRepo, bookingsService } = await buildTestingModule();
    bookingsService.findMineById.mockResolvedValue({
      id: 'booking-1',
      paymentStatus: PaymentStatus.PAID,
    });
    disputesRepo.findOne.mockResolvedValue({ id: 'dispute-existing' });

    await expect(
      service.createDispute('customer-1', 'booking-1', 'Bị tính sai tiền'),
    ).rejects.toThrow('Booking này đã được khiếu nại trước đó');
  });
});

describe('DisputesService.findMineByCustomer', () => {
  it('returns disputes for the given customer, newest first', async () => {
    const { service, disputesRepo } = await buildTestingModule();
    disputesRepo.find.mockResolvedValue([{ id: 'dispute-1' }]);

    const result = await service.findMineByCustomer('customer-1');

    expect(disputesRepo.find).toHaveBeenCalledWith({
      where: { customerId: 'customer-1' },
      order: { createdAt: 'DESC' },
    });
    expect(result).toEqual([{ id: 'dispute-1' }]);
  });
});

describe('DisputesService.findAllForAdmin', () => {
  it('enriches each dispute with booking, court, venue, and customer info', async () => {
    const {
      service,
      disputesRepo,
      bookingsService,
      courtsService,
      venuesService,
      usersService,
    } = await buildTestingModule();
    disputesRepo.find.mockResolvedValue([
      {
        id: 'dispute-1',
        bookingId: 'booking-1',
        customerId: 'customer-1',
        reason: 'Bị tính sai tiền',
        status: DisputeStatus.PENDING,
        createdAt: new Date('2026-08-26T00:00:00Z'),
      },
    ]);
    bookingsService.findByIdOrThrow.mockResolvedValue({
      id: 'booking-1',
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 300000,
    });
    courtsService.findByIdOrThrow.mockResolvedValue({
      id: 'court-1',
      venueId: 'venue-1',
      name: 'Sân 1',
    });
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      name: 'Venue A',
    });
    usersService.findById.mockResolvedValue({
      id: 'customer-1',
      fullName: 'Nguyễn Văn A',
      email: 'customer@test.com',
    });

    const result = await service.findAllForAdmin('pending');

    expect(disputesRepo.find).toHaveBeenCalledWith({
      where: { status: DisputeStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
    expect(result).toEqual([
      {
        id: 'dispute-1',
        status: DisputeStatus.PENDING,
        reason: 'Bị tính sai tiền',
        createdAt: new Date('2026-08-26T00:00:00Z'),
        customer: {
          id: 'customer-1',
          fullName: 'Nguyễn Văn A',
          email: 'customer@test.com',
        },
        booking: {
          id: 'booking-1',
          courtName: 'Sân 1',
          venueName: 'Venue A',
          date: '2026-08-25',
          startTime: '08:00',
          endTime: '09:00',
          totalPrice: 300000,
        },
      },
    ]);
  });

  it('queries all statuses when given "all"', async () => {
    const { service, disputesRepo } = await buildTestingModule();
    disputesRepo.find.mockResolvedValue([]);

    await service.findAllForAdmin('all');

    expect(disputesRepo.find).toHaveBeenCalledWith({
      where: {},
      order: { createdAt: 'DESC' },
    });
  });
});

describe('DisputesService.resolve', () => {
  it('resolves as refund by calling PaymentsService.adminRefund', async () => {
    const { service, disputesRepo, paymentsService } = await buildTestingModule();
    disputesRepo.findOne.mockResolvedValue({
      id: 'dispute-1',
      bookingId: 'booking-1',
      customerId: 'customer-1',
      status: DisputeStatus.PENDING,
    });
    disputesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.resolve(
      'dispute-1',
      'admin-1',
      'refund',
      'Đã xác minh',
    );

    expect(paymentsService.adminRefund).toHaveBeenCalledWith(
      'booking-1',
      'admin-1',
      'Đã xác minh',
    );
    expect(result.status).toBe(DisputeStatus.RESOLVED_REFUND);
    expect(result.resolvedBy).toBe('admin-1');
    expect(result.resolvedAt).toBeInstanceOf(Date);
    expect(result.adminNote).toBe('Đã xác minh');
  });

  it('resolves as reject and sends a rejection email without touching payment', async () => {
    const {
      service,
      disputesRepo,
      paymentsService,
      usersService,
      notificationsService,
    } = await buildTestingModule();
    disputesRepo.findOne.mockResolvedValue({
      id: 'dispute-1',
      bookingId: 'booking-1',
      customerId: 'customer-1',
      status: DisputeStatus.PENDING,
    });
    disputesRepo.save.mockImplementation((data) => Promise.resolve(data));
    usersService.findById.mockResolvedValue({
      id: 'customer-1',
      fullName: 'Nguyễn Văn A',
      email: 'customer@test.com',
    });

    const result = await service.resolve(
      'dispute-1',
      'admin-1',
      'reject',
      'Không đủ căn cứ',
    );

    expect(paymentsService.adminRefund).not.toHaveBeenCalled();
    expect(notificationsService.notifyDisputeRejected).toHaveBeenCalledWith({
      to: 'customer@test.com',
      customerName: 'Nguyễn Văn A',
      reason: 'Không đủ căn cứ',
    });
    expect(result.status).toBe(DisputeStatus.REJECTED);
  });

  it('throws NotFoundException when the dispute does not exist', async () => {
    const { service, disputesRepo } = await buildTestingModule();
    disputesRepo.findOne.mockResolvedValue(null);

    await expect(
      service.resolve('dispute-1', 'admin-1', 'reject'),
    ).rejects.toThrow('Dispute dispute-1 không tồn tại');
  });

  it('throws BadRequestException when the dispute is not pending', async () => {
    const { service, disputesRepo } = await buildTestingModule();
    disputesRepo.findOne.mockResolvedValue({
      id: 'dispute-1',
      status: DisputeStatus.REJECTED,
    });

    await expect(
      service.resolve('dispute-1', 'admin-1', 'reject'),
    ).rejects.toThrow('Chỉ có thể xử lý khiếu nại đang chờ xử lý');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/api`): `npm test -- disputes.service.spec.ts`
Expected: FAIL — `Cannot find module './disputes.service'`.

- [ ] **Step 3: Implement `DisputesService`**

Create `apps/api/src/disputes/disputes.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Dispute, DisputeStatus } from './entities/dispute.entity';
import { BookingsService } from '../bookings/bookings.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentStatus } from '../payments/entities/payment.entity';
import { CourtsService } from '../courts/courts.service';
import { VenuesService } from '../courts/venues.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface AdminDisputeRow {
  id: string;
  status: DisputeStatus;
  reason: string;
  createdAt: Date;
  customer: { id: string; fullName: string; email: string };
  booking: {
    id: string;
    courtName: string;
    venueName: string;
    date: string;
    startTime: string;
    endTime: string;
    totalPrice: number;
  };
}

@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(Dispute)
    private readonly disputesRepository: Repository<Dispute>,
    private readonly bookingsService: BookingsService,
    private readonly paymentsService: PaymentsService,
    private readonly courtsService: CourtsService,
    private readonly venuesService: VenuesService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createDispute(
    customerId: string,
    bookingId: string,
    reason: string,
  ): Promise<Dispute> {
    const booking = await this.bookingsService.findMineById(
      customerId,
      bookingId,
    );
    if (booking.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException('Chỉ có thể khiếu nại booking đã thanh toán');
    }
    const existing = await this.disputesRepository.findOne({
      where: { bookingId },
    });
    if (existing) {
      throw new ConflictException('Booking này đã được khiếu nại trước đó');
    }
    const dispute = this.disputesRepository.create({
      bookingId,
      customerId,
      reason,
      status: DisputeStatus.PENDING,
    });
    return this.disputesRepository.save(dispute);
  }

  findMineByCustomer(customerId: string): Promise<Dispute[]> {
    return this.disputesRepository.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
    });
  }

  async findAllForAdmin(status: 'pending' | 'all'): Promise<AdminDisputeRow[]> {
    const disputes = await this.disputesRepository.find({
      where: status === 'all' ? {} : { status: DisputeStatus.PENDING },
      order: { createdAt: 'DESC' },
    });

    return Promise.all(
      disputes.map(async (dispute) => {
        const booking = await this.bookingsService.findByIdOrThrow(
          dispute.bookingId,
        );
        const court = await this.courtsService.findByIdOrThrow(booking.courtId);
        const venue = await this.venuesService.findByIdOrThrow(court.venueId);
        const customer = await this.usersService.findById(dispute.customerId);
        return {
          id: dispute.id,
          status: dispute.status,
          reason: dispute.reason,
          createdAt: dispute.createdAt,
          customer: {
            id: dispute.customerId,
            fullName: customer?.fullName ?? '',
            email: customer?.email ?? '',
          },
          booking: {
            id: booking.id,
            courtName: court.name,
            venueName: venue.name,
            date: booking.date,
            startTime: booking.startTime,
            endTime: booking.endTime,
            totalPrice: booking.totalPrice,
          },
        };
      }),
    );
  }

  async resolve(
    id: string,
    adminId: string,
    action: 'refund' | 'reject',
    note?: string,
  ): Promise<Dispute> {
    const dispute = await this.disputesRepository.findOne({ where: { id } });
    if (!dispute) {
      throw new NotFoundException(`Dispute ${id} không tồn tại`);
    }
    if (dispute.status !== DisputeStatus.PENDING) {
      throw new BadRequestException(
        'Chỉ có thể xử lý khiếu nại đang chờ xử lý',
      );
    }

    if (action === 'refund') {
      await this.paymentsService.adminRefund(dispute.bookingId, adminId, note);
      dispute.status = DisputeStatus.RESOLVED_REFUND;
    } else {
      const customer = await this.usersService.findById(dispute.customerId);
      await this.notificationsService.notifyDisputeRejected({
        to: customer?.email ?? '',
        customerName: customer?.fullName ?? '',
        reason: note,
      });
      dispute.status = DisputeStatus.REJECTED;
    }

    dispute.resolvedBy = adminId;
    dispute.resolvedAt = new Date();
    if (note !== undefined) dispute.adminNote = note;
    return this.disputesRepository.save(dispute);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- disputes.service.spec.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/disputes/disputes.service.ts apps/api/src/disputes/disputes.service.spec.ts
git commit -m "feat(disputes): add DisputesService"
```

---

## Task 6: Controllers, module wiring, and e2e tests

**Files:**
- Create: `apps/api/src/disputes/dto/create-dispute.dto.ts`
- Create: `apps/api/src/disputes/dto/resolve-dispute.dto.ts`
- Create: `apps/api/src/disputes/disputes.controller.ts`
- Create: `apps/api/src/disputes/disputes.module.ts`
- Create: `apps/api/src/admin/admin-disputes.controller.ts`
- Modify: `apps/api/src/admin/admin.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/disputes.e2e-spec.ts`

**Interfaces:**
- Consumes: `DisputesService` (Task 5).
- Produces: `POST /bookings/:id/disputes`, `GET /disputes/mine`, `GET /admin/disputes?status=`, `POST /admin/disputes/:id/resolve` — consumed by Task 7 (customer proxy route) and Task 8 (admin proxy routes + page).

- [ ] **Step 1: Write the failing e2e test**

Create `apps/api/test/disputes.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court } from '../src/courts/entities/court.entity';
import { Booking, BookingStatus } from '../src/bookings/entities/booking.entity';
import { Payment, PaymentStatus } from '../src/payments/entities/payment.entity';

describe('Disputes (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await clearDatabase(app);
    mockMailService.send.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createUser(
    email: string,
    role: UserRole,
  ): Promise<{ user: User; token: string }> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const repo = dataSource.getRepository(User);
    const user = await repo.save(
      repo.create({
        email,
        passwordHash,
        fullName: `User ${email}`,
        role,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' });
    return { user, token: loginResponse.body.accessToken as string };
  }

  async function createPaidBooking(
    ownerId: string,
    customerId: string,
  ): Promise<{ bookingId: string }> {
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
        closeTime: '20:00',
        slotDurationMinutes: 60,
        isActive: true,
      }),
    );
    const bookingsRepo = dataSource.getRepository(Booking);
    const booking = await bookingsRepo.save(
      bookingsRepo.create({
        courtId: court.id,
        customerId,
        date: '2026-09-01',
        startTime: '08:00',
        endTime: '09:00',
        totalPrice: 300000,
        status: BookingStatus.CONFIRMED,
      }),
    );
    const paymentsRepo = dataSource.getRepository(Payment);
    await paymentsRepo.save(
      paymentsRepo.create({
        bookingId: booking.id,
        status: PaymentStatus.PAID,
        paidAt: new Date(),
      }),
    );
    return { bookingId: booking.id };
  }

  it('lets a customer file a dispute on a paid booking, and it appears in the admin queue', async () => {
    const owner = await createUser('owner1@test.com', UserRole.OWNER);
    const customer = await createUser('customer1@test.com', UserRole.CUSTOMER);
    const admin = await createUser('admin1@test.com', UserRole.ADMIN);
    const { bookingId } = await createPaidBooking(owner.user.id, customer.user.id);

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Bị tính sai tiền' })
      .expect(201);

    const listResponse = await request(app.getHttpServer())
      .get('/admin/disputes')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0]).toMatchObject({
      status: 'pending',
      reason: 'Bị tính sai tiền',
      customer: { email: 'customer1@test.com' },
      booking: { id: bookingId, courtName: 'Sân 1', venueName: 'Sân ABC' },
    });
  });

  it('rejects filing a second dispute for the same booking with 409', async () => {
    const owner = await createUser('owner2@test.com', UserRole.OWNER);
    const customer = await createUser('customer2@test.com', UserRole.CUSTOMER);
    const { bookingId } = await createPaidBooking(owner.user.id, customer.user.id);

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Lần 1' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Lần 2' })
      .expect(409);
  });

  it('resolves a dispute as refund: payment becomes refunded and the customer is emailed', async () => {
    const owner = await createUser('owner3@test.com', UserRole.OWNER);
    const customer = await createUser('customer3@test.com', UserRole.CUSTOMER);
    const admin = await createUser('admin3@test.com', UserRole.ADMIN);
    const { bookingId } = await createPaidBooking(owner.user.id, customer.user.id);

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Bị tính sai tiền' })
      .expect(201);
    const disputeId = (
      await dataSource.query('SELECT id FROM disputes WHERE booking_id = $1', [
        bookingId,
      ])
    )[0].id as string;

    await request(app.getHttpServer())
      .post(`/admin/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ action: 'refund', note: 'Đã xác minh' })
      .expect(201);

    const payment = await dataSource
      .getRepository(Payment)
      .findOneOrFail({ where: { bookingId } });
    expect(payment.status).toBe(PaymentStatus.REFUNDED);
    expect(payment.refundedBy).toBe(admin.user.id);

    const call = mockMailService.send.mock.calls.find(
      ([to]) => to === 'customer3@test.com',
    );
    expect(call).toBeDefined();
  });

  it('resolves a dispute as reject: payment is untouched, customer emailed with the note', async () => {
    const owner = await createUser('owner4@test.com', UserRole.OWNER);
    const customer = await createUser('customer4@test.com', UserRole.CUSTOMER);
    const admin = await createUser('admin4@test.com', UserRole.ADMIN);
    const { bookingId } = await createPaidBooking(owner.user.id, customer.user.id);

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Bị tính sai tiền' })
      .expect(201);
    const disputeId = (
      await dataSource.query('SELECT id FROM disputes WHERE booking_id = $1', [
        bookingId,
      ])
    )[0].id as string;

    await request(app.getHttpServer())
      .post(`/admin/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ action: 'reject', note: 'Không đủ căn cứ' })
      .expect(201);

    const payment = await dataSource
      .getRepository(Payment)
      .findOneOrFail({ where: { bookingId } });
    expect(payment.status).toBe(PaymentStatus.PAID);

    const call = mockMailService.send.mock.calls.find(
      ([to]) => to === 'customer4@test.com',
    );
    expect(call).toBeDefined();
    expect(call![2]).toContain('Không đủ căn cứ');
  });

  it('rejects resolving an already-resolved dispute with 400', async () => {
    const owner = await createUser('owner5@test.com', UserRole.OWNER);
    const customer = await createUser('customer5@test.com', UserRole.CUSTOMER);
    const admin = await createUser('admin5@test.com', UserRole.ADMIN);
    const { bookingId } = await createPaidBooking(owner.user.id, customer.user.id);

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Bị tính sai tiền' })
      .expect(201);
    const disputeId = (
      await dataSource.query('SELECT id FROM disputes WHERE booking_id = $1', [
        bookingId,
      ])
    )[0].id as string;

    await request(app.getHttpServer())
      .post(`/admin/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ action: 'reject' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/admin/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ action: 'reject' })
      .expect(400);
  });

  it('rejects a non-admin calling the admin endpoint with 403', async () => {
    const customer = await createUser('customer6@test.com', UserRole.CUSTOMER);

    await request(app.getHttpServer())
      .get('/admin/disputes')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);
  });

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer()).get('/admin/disputes').expect(401);
    await request(app.getHttpServer()).get('/disputes/mine').expect(401);
  });
});
```

- [ ] **Step 2: Run the e2e test to verify it fails**

Run (from `apps/api`): `npm run test:e2e -- disputes.e2e-spec.ts`
Expected: FAIL — `404 Not Found` for `POST /bookings/:id/disputes` (nothing registered yet).

- [ ] **Step 3: Add the DTOs**

Create `apps/api/src/disputes/dto/create-dispute.dto.ts`:

```ts
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateDisputeDto {
  @IsNotEmpty()
  @IsString()
  reason: string;
}
```

Create `apps/api/src/disputes/dto/resolve-dispute.dto.ts`:

```ts
import { IsIn, IsOptional, IsString } from 'class-validator';

export class ResolveDisputeDto {
  @IsIn(['refund', 'reject'])
  action: 'refund' | 'reject';

  @IsOptional()
  @IsString()
  note?: string;
}
```

- [ ] **Step 4: Implement `DisputesController` (customer-facing)**

Create `apps/api/src/disputes/disputes.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DisputesService } from './disputes.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post('bookings/:id/disputes')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateDisputeDto,
  ) {
    return this.disputesService.createDispute(user.userId, id, dto.reason);
  }

  @Get('disputes/mine')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.disputesService.findMineByCustomer(user.userId);
  }
}
```

- [ ] **Step 5: Create `DisputesModule`**

Create `apps/api/src/disputes/disputes.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dispute } from './entities/dispute.entity';
import { DisputesService } from './disputes.service';
import { DisputesController } from './disputes.controller';
import { BookingsModule } from '../bookings/bookings.module';
import { PaymentsModule } from '../payments/payments.module';
import { CourtsModule } from '../courts/courts.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Dispute]),
    BookingsModule,
    PaymentsModule,
    CourtsModule,
    UsersModule,
    NotificationsModule,
  ],
  controllers: [DisputesController],
  providers: [DisputesService],
  exports: [DisputesService],
})
export class DisputesModule {}
```

- [ ] **Step 6: Implement `AdminDisputesController` (admin-facing)**

Create `apps/api/src/admin/admin-disputes.controller.ts`:

```ts
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
import { DisputesService } from '../disputes/disputes.service';
import { ResolveDisputeDto } from '../disputes/dto/resolve-dispute.dto';

@Controller('admin/disputes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminDisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Get()
  findAll(@Query('status') status?: string) {
    return this.disputesService.findAllForAdmin(
      status === 'all' ? 'all' : 'pending',
    );
  }

  @Post(':id/resolve')
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.disputesService.resolve(id, user.userId, dto.action, dto.note);
  }
}
```

- [ ] **Step 7: Wire `AdminModule` and `AppModule`**

In `apps/api/src/admin/admin.module.ts`, add the import and controller. Replace its contents with:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { CourtsModule } from '../courts/courts.module';
import { DisputesModule } from '../disputes/disputes.module';
import { User } from '../users/entities/user.entity';
import { Venue } from '../courts/entities/venue.entity';
import { Court } from '../courts/entities/court.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Payment } from '../payments/entities/payment.entity';
import { AdminController } from './admin.controller';
import { AdminVenuesController } from './admin-venues.controller';
import { AdminApprovalsController } from './admin-approvals.controller';
import { AdminApprovalsService } from './admin-approvals.service';
import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsService } from './admin-stats.service';
import { AdminDisputesController } from './admin-disputes.controller';

@Module({
  imports: [
    UsersModule,
    CourtsModule,
    DisputesModule,
    TypeOrmModule.forFeature([User, Venue, Court, Booking, Payment]),
  ],
  controllers: [
    AdminController,
    AdminVenuesController,
    AdminApprovalsController,
    AdminStatsController,
    AdminDisputesController,
  ],
  providers: [AdminApprovalsService, AdminStatsService],
})
export class AdminModule {}
```

In `apps/api/src/app.module.ts`, change the import block from:

```ts
import { NotificationsModule } from './notifications/notifications.module';
```

to:

```ts
import { NotificationsModule } from './notifications/notifications.module';
import { DisputesModule } from './disputes/disputes.module';
```

And change the `imports` array from:

```ts
    UsersModule,
    MailModule,
    AuthModule,
    AdminModule,
    CourtsModule,
    BookingsModule,
    PaymentsModule,
    NotificationsModule,
  ],
```

to:

```ts
    UsersModule,
    MailModule,
    AuthModule,
    AdminModule,
    CourtsModule,
    BookingsModule,
    PaymentsModule,
    NotificationsModule,
    DisputesModule,
  ],
```

- [ ] **Step 8: Run the e2e test to verify it passes**

Run (from `apps/api`): `npm run test:e2e -- disputes.e2e-spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 9: Run the full backend test suite**

Run: `npm test && npm run test:e2e`
Expected: PASS (all suites — confirms the `PaymentsService` refactor in Task 3 and the new module wiring didn't break anything elsewhere).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/disputes/dto apps/api/src/disputes/disputes.controller.ts apps/api/src/disputes/disputes.module.ts apps/api/src/admin/admin-disputes.controller.ts apps/api/src/admin/admin.module.ts apps/api/src/app.module.ts apps/api/test/disputes.e2e-spec.ts
git commit -m "feat(disputes): add customer and admin dispute endpoints"
```

---

## Task 7: Customer "Báo cáo vấn đề" button

**Files:**
- Create: `apps/web/src/app/api/bookings/[id]/disputes/route.ts`
- Modify: `apps/web/src/app/me/bookings/page.tsx`

**Interfaces:**
- Consumes: `POST /bookings/:id/disputes` (Task 6).

There is no `GET /disputes/mine` proxy route or UI in this task — nothing in the frontend scope (per spec §7) needs to display a customer's dispute list yet; the endpoint exists on the backend for future use. Building an unused proxy/page here would be speculative (YAGNI).

- [ ] **Step 1: Add the proxy route**

Create `apps/web/src/app/api/bookings/[id]/disputes/route.ts`:

```ts
import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const upstream = await fetchApi(`/bookings/${id}/disputes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: Add the button to the booking history page**

In `apps/web/src/app/me/bookings/page.tsx`, add a `disputedIds` state to track bookings the customer has just filed a dispute for (so the button hides without needing to re-fetch the list), and a handler that prompts for a reason. Replace the whole file with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSubmitErrorMessage } from "@/lib/error-message";

type BookingStatus = "confirmed" | "cancelled" | "completed";
type PaymentStatus = "unpaid" | "paid" | "refunded";

interface Booking {
  id: string;
  courtName: string;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
}

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Đã xác nhận",
  cancelled: "Đã huỷ",
  completed: "Hoàn thành",
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: "Chưa thanh toán",
  paid: "Đã thanh toán",
  refunded: "Đã hoàn tiền",
};

export default function MyBookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [disputedIds, setDisputedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/bookings/mine")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fme%2Fbookings");
          return null;
        }
        return (await res.json()) as Booking[];
      })
      .then((data) => {
        if (!data) return;
        setBookings(data);
      });
  }, [router]);

  async function handleCancel(id: string) {
    const response = await fetch(`/api/bookings/${id}/cancel`, {
      method: "POST",
    });
    const data = await response.json().catch(() => null);
    setConfirmingId(null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã huỷ booking");
    setBookings(
      (current) =>
        current?.map((booking) =>
          booking.id === id ? { ...booking, status: "cancelled" } : booking,
        ) ?? null,
    );
  }

  async function handleReportIssue(id: string) {
    const reason = window.prompt("Mô tả vấn đề bạn gặp phải với booking này:");
    if (reason === null) return;
    if (reason.trim() === "") {
      toast.error("Vui lòng nhập lý do khiếu nại.");
      return;
    }

    const response = await fetch(`/api/bookings/${id}/disputes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã gửi khiếu nại, admin sẽ xem xét sớm.");
    setDisputedIds((current) => new Set(current).add(id));
  }

  if (!bookings) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p>Đang tải...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">Booking của tôi</h1>

      {bookings.length === 0 && (
        <p className="text-muted-foreground">Bạn chưa có booking nào.</p>
      )}

      <div className="flex flex-col gap-4">
        {bookings.map((booking) => (
          <Card key={booking.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {booking.courtName} · {booking.venueName}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                <p>
                  {booking.date} · {booking.startTime}–{booking.endTime}
                </p>
                <p>
                  {booking.totalPrice.toLocaleString("vi-VN")}đ ·{" "}
                  {STATUS_LABEL[booking.status]}
                </p>
                <p>{PAYMENT_STATUS_LABEL[booking.paymentStatus]}</p>
              </div>
              <div className="flex gap-2">
                {booking.status === "confirmed" &&
                  (confirmingId === booking.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleCancel(booking.id)}
                      >
                        Xác nhận huỷ?
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmingId(null)}
                      >
                        Thôi
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmingId(booking.id)}
                    >
                      Huỷ
                    </Button>
                  ))}
                {booking.paymentStatus === "paid" &&
                  !disputedIds.has(booking.id) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleReportIssue(booking.id)}
                    >
                      Báo cáo vấn đề
                    </Button>
                  )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify the frontend build succeeds**

Run (from `apps/web`): `npm run build`
Expected: build succeeds, route table includes `ƒ /api/bookings/[id]/disputes`, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/bookings/\[id\]/disputes/route.ts apps/web/src/app/me/bookings/page.tsx
git commit -m "feat(web): add report-issue button to booking history"
```

---

## Task 8: Admin disputes page

**Files:**
- Create: `apps/web/src/app/api/admin/disputes/route.ts`
- Create: `apps/web/src/app/api/admin/disputes/[id]/resolve/route.ts`
- Create: `apps/web/src/app/admin/disputes/page.tsx`
- Modify: `apps/web/src/components/admin-nav.tsx`

**Interfaces:**
- Consumes: `GET /admin/disputes`, `POST /admin/disputes/:id/resolve` (Task 6).

- [ ] **Step 1: Add the proxy routes**

Create `apps/web/src/app/api/admin/disputes/route.ts`:

```ts
import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET() {
  const upstream = await fetchApi('/admin/disputes');
  return toNextResponse(upstream);
}
```

Create `apps/web/src/app/api/admin/disputes/[id]/resolve/route.ts`:

```ts
import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const upstream = await fetchApi(`/admin/disputes/${id}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: Create the admin disputes page**

Create `apps/web/src/app/admin/disputes/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminNav } from "@/components/admin-nav";
import { getSubmitErrorMessage } from "@/lib/error-message";

interface DisputeRow {
  id: string;
  status: "pending" | "resolved_refund" | "rejected";
  reason: string;
  createdAt: string;
  customer: { id: string; fullName: string; email: string };
  booking: {
    id: string;
    courtName: string;
    venueName: string;
    date: string;
    startTime: string;
    endTime: string;
    totalPrice: number;
  };
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export default function AdminDisputesPage() {
  const router = useRouter();
  const [disputes, setDisputes] = useState<DisputeRow[] | null>(null);

  async function loadPending() {
    const response = await fetch("/api/admin/disputes");
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fadmin%2Fdisputes");
      return;
    }
    const data = await response.json().catch(() => []);
    setDisputes(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadPending();
  }, []);

  async function handleResolve(row: DisputeRow, action: "refund" | "reject") {
    let note: string | undefined;
    if (action === "reject") {
      const input = window.prompt("Ghi chú (không bắt buộc):");
      if (input === null) return;
      note = input.trim() || undefined;
    } else {
      const confirmed = window.confirm(
        `Xác nhận hoàn ${currencyFormatter.format(row.booking.totalPrice)}đ cho khách hàng ${row.customer.fullName}?`,
      );
      if (!confirmed) return;
    }

    const response = await fetch(`/api/admin/disputes/${row.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, note }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success(action === "refund" ? "Đã hoàn tiền" : "Đã từ chối khiếu nại");
    loadPending();
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <AdminNav />
      <h1 className="text-2xl font-bold">Khiếu nại</h1>

      {disputes === null && <p>Đang tải...</p>}
      {disputes !== null && disputes.length === 0 && (
        <p className="text-muted-foreground">Không có khiếu nại nào đang chờ xử lý.</p>
      )}

      <div className="flex flex-col gap-4">
        {disputes?.map((row) => (
          <Card key={row.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {row.booking.courtName} · {row.booking.venueName}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {row.booking.date} · {row.booking.startTime}–{row.booking.endTime} ·{" "}
                {currencyFormatter.format(row.booking.totalPrice)}đ
              </p>
              <p className="text-sm text-muted-foreground">
                Khách hàng: {row.customer.fullName} ({row.customer.email})
              </p>
              <p className="text-sm">{row.reason}</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleResolve(row, "refund")}>
                  Hoàn tiền
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleResolve(row, "reject")}
                >
                  Từ chối
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Add the nav link**

In `apps/web/src/components/admin-nav.tsx`, change the `LINKS` array from:

```ts
const LINKS = [
  { href: "/admin/approvals", label: "Chờ duyệt" },
  { href: "/admin/stats", label: "Thống kê" },
];
```

to:

```ts
const LINKS = [
  { href: "/admin/approvals", label: "Chờ duyệt" },
  { href: "/admin/stats", label: "Thống kê" },
  { href: "/admin/disputes", label: "Khiếu nại" },
];
```

- [ ] **Step 4: Verify the frontend build succeeds**

Run (from `apps/web`): `npm run build`
Expected: build succeeds, route table includes `○ /admin/disputes`, `ƒ /api/admin/disputes`, `ƒ /api/admin/disputes/[id]/resolve`, no TypeScript errors.

- [ ] **Step 5: Manually verify against the running backend**

With Postgres/MailHog up and the API/web dev servers running:
1. As a customer, open a paid booking on `/me/bookings`, click "Báo cáo vấn đề", enter a reason — confirm a success toast and the button disappears for that booking.
2. As an admin, open `/admin/disputes` — confirm the dispute appears with the correct booking/customer/reason.
3. Click "Hoàn tiền", confirm the confirmation dialog, confirm the row disappears, a success toast shows, and the underlying payment is refunded (check via the owner's booking list or `psql`).
4. File a second dispute (as a different customer, different paid booking), click "Từ chối" with a note — confirm the row disappears and the note appears in the rejection email (check MailHog at `http://localhost:8025`).
5. Confirm "Khiếu nại" appears in the admin nav alongside "Chờ duyệt"/"Thống kê" and navigates correctly.

Report the result of each of these 5 checks before proceeding to commit.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/admin/disputes apps/web/src/app/admin/disputes/page.tsx apps/web/src/components/admin-nav.tsx
git commit -m "feat(web): add admin disputes page"
```

---

## Self-Review Notes

- **Spec coverage:** §2 data model incl. unique `booking_id` (Task 1), §3 API shape for all 4 endpoints (Task 6), §4 backend implementation incl. `adminRefund`/`findByIdOrThrow`/module wiring (Tasks 2, 3, 6), §5 notifications (Task 4), §6 validation — paid-only eligibility and duplicate-filing 409 (Task 5 unit tests, Task 6 e2e), already-resolved 400 (Task 5, Task 6 e2e), role/auth 403/401 (Task 6 e2e) — §7 frontend (Tasks 7, 8), §8 testing (unit in Tasks 2–5, e2e in Task 6). §9 out-of-scope items (venue/owner conduct complaints, general support tickets, multi-turn threads, partial refunds, attachments, owner notifications) are correctly absent from every task.
- **Type consistency:** `AdminDisputeRow` (Task 5) matches the e2e assertions in Task 6 and the `DisputeRow` interface in Task 8's page. `DisputeStatus` values (`pending`/`resolved_refund`/`rejected`) are consistent across the entity (Task 1), service (Task 5), DTO (Task 6), and frontend type (Task 8). `PaymentsService.adminRefund(bookingId, adminId, note?)` signature matches its Task 3 definition and Task 5's call site exactly.
- **Placeholder scan:** no TBD/TODO; every step has runnable code and exact commands.
