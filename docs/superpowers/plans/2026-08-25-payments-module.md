# Payments Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add manual payment-status tracking to bookings — owner marks a booking as paid/refunded, customer sees the status read-only.

**Architecture:** New `PaymentsModule` in the NestJS API owns a `payments` table (1-1 with `bookings`). `BookingsService` auto-creates a `Payment` row inside its existing create-booking transaction and embeds payment fields into its read responses (same pattern it already uses for court/venue/customer enrichment). `PaymentsService` verifies booking ownership by calling back into `BookingsService`. This is a genuine two-way module dependency, resolved with `forwardRef()` on both sides. Frontend: owner gets two-step "mark paid" / "mark refunded" buttons with an optional note, customer gets a read-only badge.

**Tech Stack:** NestJS 11, TypeORM (raw-SQL migrations), Jest + Supertest, Next.js BFF route handlers, React (shadcn/ui components).

## Global Constraints

- All user-facing error/validation messages are in Vietnamese, matching the existing message style in `bookings.service.ts`.
- Payment status transitions are forward-only: `unpaid → paid → refunded`. No undo/correction endpoint.
- No new read endpoints — payment fields ride along on the existing `GET /bookings/mine`, `GET /bookings/mine/:id`, `GET /venues/mine/:venueId/bookings` responses.
- Only the owner can mutate payment status (`mark-paid`, `mark-refunded`); the customer view is read-only.
- Cancelling a booking never auto-changes payment status.
- `BookingsModule` and `PaymentsModule` import each other via `forwardRef()` — this is intentional, documented in the design spec (`docs/superpowers/specs/2026-08-25-payments-module-design.md`), not a mistake to "fix".

---

### Task 1: Payment entity + migration

**Files:**
- Create: `apps/api/src/payments/entities/payment.entity.ts`
- Create: `apps/api/src/migrations/1787670000000-CreatePayments.ts`
- Modify: `apps/api/test/utils/test-app.ts:34-39`

**Interfaces:**
- Produces: `Payment` entity class and `PaymentStatus` enum (`UNPAID`, `PAID`, `REFUNDED`), consumed by every later task.

- [ ] **Step 1: Create the entity**

```typescript
// apps/api/src/payments/entities/payment.entity.ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum PaymentStatus {
  UNPAID = 'unpaid',
  PAID = 'paid',
  REFUNDED = 'refunded',
}

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', unique: true })
  bookingId: string;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.UNPAID,
  })
  status: PaymentStatus;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'paid_by', nullable: true, type: 'varchar' })
  paidBy: string | null;

  @Column({ name: 'refunded_at', type: 'timestamp', nullable: true })
  refundedAt: Date | null;

  @Column({ name: 'refunded_by', nullable: true, type: 'varchar' })
  refundedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Write the migration by hand, matching the style of `1787580899019-CreateBookings.ts`**

```typescript
// apps/api/src/migrations/1787670000000-CreatePayments.ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePayments1787670000000 implements MigrationInterface {
    name = 'CreatePayments1787670000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('unpaid', 'paid', 'refunded')`);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "booking_id" character varying NOT NULL, "status" "public"."payments_status_enum" NOT NULL DEFAULT 'unpaid', "note" text, "paid_at" TIMESTAMP, "paid_by" character varying, "refunded_at" TIMESTAMP, "refunded_by" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_payments_booking_id" UNIQUE ("booking_id"), CONSTRAINT "PK_payments_id" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    }

}
```

- [ ] **Step 3: Run the migration against the local dev database**

Run (from `apps/api`, with `docker compose up -d postgres` already running from the repo root):
```bash
npm run migration:run
```
Expected: output includes `CreatePayments1787670000000` under "migrations executed", no errors.

- [ ] **Step 4: Add `payments` to the e2e test truncate list**

In `apps/api/test/utils/test-app.ts`, update `clearDatabase`:

```typescript
export async function clearDatabase(app: INestApplication): Promise<void> {
  const dataSource = app.get(DataSource);
  await dataSource.query(
    'TRUNCATE TABLE payments, booking_slots, bookings, venue_images, courts, venues, refresh_tokens, password_reset_tokens, email_verification_tokens, users RESTART IDENTITY CASCADE',
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payments/entities/payment.entity.ts apps/api/src/migrations/1787670000000-CreatePayments.ts apps/api/test/utils/test-app.ts
git commit -m "feat(api): add Payment entity and migration"
```

---

### Task 2: Extract `BookingsService.findByIdForOwnerOrThrow`

Payments needs a way to verify "does this booking belong to this owner's venue" without touching the `bookings` table directly. `cancelByOwner` already has this exact lookup inline — extract it into a public method so both `cancelByOwner` and the future `PaymentsService` share it.

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts:201-221` (the `cancelByOwner` method)
- Test: `apps/api/src/bookings/bookings.service.spec.ts`

**Interfaces:**
- Produces: `BookingsService.findByIdForOwnerOrThrow(ownerId: string, venueId: string, id: string): Promise<Booking>` — throws `NotFoundException` if the booking doesn't belong to a court in that owner's venue. Consumed by `PaymentsService` in Task 3.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/bookings/bookings.service.spec.ts`, after the `describe('BookingsService.cancelByOwner', ...)` block:

```typescript
describe('BookingsService.findByIdForOwnerOrThrow', () => {
  it('returns the booking when it belongs to a court in the venue', async () => {
    const { service, bookingsRepo, courtsService } = await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([{ id: 'court-1' }]);
    bookingsRepo.findOne.mockResolvedValue({ id: 'booking-1', courtId: 'court-1' });

    const result = await service.findByIdForOwnerOrThrow(
      'owner-1',
      'venue-1',
      'booking-1',
    );

    expect(result).toEqual({ id: 'booking-1', courtId: 'court-1' });
  });

  it('throws NotFoundException when the booking is not on any court in the venue', async () => {
    const { service, bookingsRepo, courtsService } = await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([{ id: 'court-1' }]);
    bookingsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findByIdForOwnerOrThrow('owner-1', 'venue-1', 'booking-1'),
    ).rejects.toThrow('Booking booking-1 không tồn tại');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/api`):
```bash
npx jest bookings.service.spec.ts -t findByIdForOwnerOrThrow
```
Expected: FAIL — `service.findByIdForOwnerOrThrow is not a function`.

- [ ] **Step 3: Extract the method, refactor `cancelByOwner` to use it**

In `apps/api/src/bookings/bookings.service.ts`, replace the `cancelByOwner` method (lines 201-221):

```typescript
  async cancelByOwner(
    ownerId: string,
    venueId: string,
    id: string,
  ): Promise<Booking> {
    const booking = await this.findByIdForOwnerOrThrow(ownerId, venueId, id);
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Chỉ có thể huỷ booking đang confirmed');
    }
    return this.cancel(booking, ownerId);
  }

  async findByIdForOwnerOrThrow(
    ownerId: string,
    venueId: string,
    id: string,
  ): Promise<Booking> {
    const courts = await this.courtsService.findByVenueForOwner(
      ownerId,
      venueId,
    );
    const courtIds = courts.map((court) => court.id);
    const booking = await this.bookingsRepository.findOne({
      where: { id, courtId: In(courtIds.length > 0 ? courtIds : ['__none__']) },
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${id} không tồn tại`);
    }
    return booking;
  }
```

- [ ] **Step 4: Run the full bookings unit suite to verify everything still passes**

Run (from `apps/api`):
```bash
npx jest bookings.service.spec.ts
```
Expected: PASS, all tests including the new `findByIdForOwnerOrThrow` describe block and the unmodified `cancelByOwner` tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.service.spec.ts
git commit -m "refactor(api): extract findByIdForOwnerOrThrow from cancelByOwner"
```

---

### Task 3: `PaymentsService`

**Files:**
- Create: `apps/api/src/payments/payments.service.ts`
- Test: `apps/api/src/payments/payments.service.spec.ts`

**Interfaces:**
- Consumes: `Payment`, `PaymentStatus` from Task 1; `BookingsService.findByIdForOwnerOrThrow(ownerId, venueId, id): Promise<Booking>` from Task 2.
- Produces:
  - `PaymentsService.createForBooking(bookingId: string, manager?: EntityManager): Promise<Payment>`
  - `PaymentsService.findByBookingId(bookingId: string): Promise<Payment | null>`
  - `PaymentsService.markPaid(ownerId: string, venueId: string, bookingId: string, note?: string): Promise<Payment>`
  - `PaymentsService.markRefunded(ownerId: string, venueId: string, bookingId: string, note?: string): Promise<Payment>`

  All four consumed by Task 4 (controller) and Task 5 (`BookingsService` enrichment/creation).

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/payments/payments.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { BookingsService } from '../bookings/bookings.service';
import { Booking } from '../bookings/entities/booking.entity';

const mockPaymentsRepository = () => ({
  create: jest.fn((data: unknown) => data),
  save: jest.fn((data: unknown) =>
    Promise.resolve({ id: 'payment-1', ...(data as object) }),
  ),
  findOne: jest.fn(),
});

const mockBookingsService = () => ({
  findByIdForOwnerOrThrow: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PaymentsService,
      {
        provide: getRepositoryToken(Payment),
        useFactory: mockPaymentsRepository,
      },
      { provide: BookingsService, useFactory: mockBookingsService },
    ],
  }).compile();

  return {
    service: module.get(PaymentsService),
    paymentsRepo: module.get(getRepositoryToken(Payment)) as ReturnType<
      typeof mockPaymentsRepository
    >,
    bookingsService: module.get(BookingsService) as ReturnType<
      typeof mockBookingsService
    >,
  };
}

describe('PaymentsService.createForBooking', () => {
  it('creates an unpaid payment row using the injected repository', async () => {
    const { service, paymentsRepo } = await buildTestingModule();

    const result = await service.createForBooking('booking-1');

    expect(paymentsRepo.create).toHaveBeenCalledWith({
      bookingId: 'booking-1',
      status: PaymentStatus.UNPAID,
    });
    expect(result).toMatchObject({
      bookingId: 'booking-1',
      status: PaymentStatus.UNPAID,
    });
  });

  it('uses the given EntityManager instead of the injected repository when provided', async () => {
    const { service } = await buildTestingModule();
    const managerRepo = {
      create: jest.fn((data: unknown) => data),
      save: jest.fn((data: unknown) =>
        Promise.resolve({ id: 'payment-2', ...(data as object) }),
      ),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue(managerRepo),
    } as unknown as EntityManager;

    const result = await service.createForBooking('booking-2', manager);

    expect(manager.getRepository).toHaveBeenCalledWith(Payment);
    expect(managerRepo.create).toHaveBeenCalledWith({
      bookingId: 'booking-2',
      status: PaymentStatus.UNPAID,
    });
    expect(result).toMatchObject({
      bookingId: 'booking-2',
      status: PaymentStatus.UNPAID,
    });
  });
});

describe('PaymentsService.findByBookingId', () => {
  it('returns null when no payment row exists', async () => {
    const { service, paymentsRepo } = await buildTestingModule();
    paymentsRepo.findOne.mockResolvedValue(null);

    const result = await service.findByBookingId('booking-1');

    expect(result).toBeNull();
  });
});

describe('PaymentsService.markPaid', () => {
  it('transitions unpaid to paid and records who/when/note', async () => {
    const { service, paymentsRepo, bookingsService } = await buildTestingModule();
    bookingsService.findByIdForOwnerOrThrow.mockResolvedValue({
      id: 'booking-1',
    } as Booking);
    paymentsRepo.findOne.mockResolvedValue({
      id: 'payment-1',
      bookingId: 'booking-1',
      status: PaymentStatus.UNPAID,
      note: null,
    });

    const result = await service.markPaid(
      'owner-1',
      'venue-1',
      'booking-1',
      'CK Vietcombank',
    );

    expect(bookingsService.findByIdForOwnerOrThrow).toHaveBeenCalledWith(
      'owner-1',
      'venue-1',
      'booking-1',
    );
    expect(result.status).toBe(PaymentStatus.PAID);
    expect(result.paidBy).toBe('owner-1');
    expect(result.note).toBe('CK Vietcombank');
    expect(result.paidAt).toBeInstanceOf(Date);
  });

  it('throws BadRequestException when payment is not unpaid', async () => {
    const { service, paymentsRepo, bookingsService } = await buildTestingModule();
    bookingsService.findByIdForOwnerOrThrow.mockResolvedValue({
      id: 'booking-1',
    } as Booking);
    paymentsRepo.findOne.mockResolvedValue({
      id: 'payment-1',
      bookingId: 'booking-1',
      status: PaymentStatus.PAID,
    });

    await expect(
      service.markPaid('owner-1', 'venue-1', 'booking-1'),
    ).rejects.toThrow(
      'Chỉ có thể đánh dấu đã nhận tiền khi đang ở trạng thái chưa thanh toán',
    );
  });

  it('throws NotFoundException when the booking is not owned by this owner/venue', async () => {
    const { service, bookingsService } = await buildTestingModule();
    bookingsService.findByIdForOwnerOrThrow.mockRejectedValue(
      new NotFoundException('Booking booking-1 không tồn tại'),
    );

    await expect(
      service.markPaid('owner-1', 'venue-1', 'booking-1'),
    ).rejects.toThrow('Booking booking-1 không tồn tại');
  });

  it('throws NotFoundException when no payment row exists for the booking', async () => {
    const { service, paymentsRepo, bookingsService } = await buildTestingModule();
    bookingsService.findByIdForOwnerOrThrow.mockResolvedValue({
      id: 'booking-1',
    } as Booking);
    paymentsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.markPaid('owner-1', 'venue-1', 'booking-1'),
    ).rejects.toThrow('Payment cho booking booking-1 không tồn tại');
  });
});

describe('PaymentsService.markRefunded', () => {
  it('transitions paid to refunded and records who/when/note', async () => {
    const { service, paymentsRepo, bookingsService } = await buildTestingModule();
    bookingsService.findByIdForOwnerOrThrow.mockResolvedValue({
      id: 'booking-1',
    } as Booking);
    paymentsRepo.findOne.mockResolvedValue({
      id: 'payment-1',
      bookingId: 'booking-1',
      status: PaymentStatus.PAID,
      note: null,
    });

    const result = await service.markRefunded(
      'owner-1',
      'venue-1',
      'booking-1',
      'Đã CK lại',
    );

    expect(result.status).toBe(PaymentStatus.REFUNDED);
    expect(result.refundedBy).toBe('owner-1');
    expect(result.note).toBe('Đã CK lại');
    expect(result.refundedAt).toBeInstanceOf(Date);
  });

  it('throws BadRequestException when payment is not paid', async () => {
    const { service, paymentsRepo, bookingsService } = await buildTestingModule();
    bookingsService.findByIdForOwnerOrThrow.mockResolvedValue({
      id: 'booking-1',
    } as Booking);
    paymentsRepo.findOne.mockResolvedValue({
      id: 'payment-1',
      bookingId: 'booking-1',
      status: PaymentStatus.UNPAID,
    });

    await expect(
      service.markRefunded('owner-1', 'venue-1', 'booking-1'),
    ).rejects.toThrow(
      'Chỉ có thể đánh dấu đã hoàn tiền khi đang ở trạng thái đã thanh toán',
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/api`):
```bash
npx jest payments.service.spec.ts
```
Expected: FAIL — cannot find module `./payments.service`.

- [ ] **Step 3: Implement `PaymentsService`**

```typescript
// apps/api/src/payments/payments.service.ts
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
import { BookingsService } from '../bookings/bookings.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @Inject(forwardRef(() => BookingsService))
    private readonly bookingsService: BookingsService,
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
    await this.bookingsService.findByIdForOwnerOrThrow(
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
    return this.paymentsRepository.save(payment);
  }

  async markRefunded(
    ownerId: string,
    venueId: string,
    bookingId: string,
    note?: string,
  ): Promise<Payment> {
    await this.bookingsService.findByIdForOwnerOrThrow(
      ownerId,
      venueId,
      bookingId,
    );
    const payment = await this.getPaymentOrThrow(bookingId);
    if (payment.status !== PaymentStatus.PAID) {
      throw new BadRequestException(
        'Chỉ có thể đánh dấu đã hoàn tiền khi đang ở trạng thái đã thanh toán',
      );
    }
    payment.status = PaymentStatus.REFUNDED;
    payment.refundedAt = new Date();
    payment.refundedBy = ownerId;
    if (note !== undefined) payment.note = note;
    return this.paymentsRepository.save(payment);
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

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/api`):
```bash
npx jest payments.service.spec.ts
```
Expected: PASS, all 8 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/payments/payments.service.ts apps/api/src/payments/payments.service.spec.ts
git commit -m "feat(api): add PaymentsService"
```

---

### Task 4: `PaymentsController`, DTO, `PaymentsModule`

**Files:**
- Create: `apps/api/src/payments/dto/mark-payment.dto.ts`
- Create: `apps/api/src/payments/payments.controller.ts`
- Create: `apps/api/src/payments/payments.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PaymentsService` from Task 3.
- Produces: `POST /venues/mine/:venueId/bookings/:id/payment/mark-paid` and `POST /venues/mine/:venueId/bookings/:id/payment/mark-refunded`, both role-gated to `owner`. Consumed by Task 6 (e2e) and Task 7 (frontend BFF).

- [ ] **Step 1: Create the DTO**

```typescript
// apps/api/src/payments/dto/mark-payment.dto.ts
import { IsOptional, IsString } from 'class-validator';

export class MarkPaymentDto {
  @IsOptional()
  @IsString()
  note?: string;
}
```

- [ ] **Step 2: Create the controller**

```typescript
// apps/api/src/payments/payments.controller.ts
import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { PaymentsService } from './payments.service';
import { MarkPaymentDto } from './dto/mark-payment.dto';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('venues/mine/:venueId/bookings/:id/payment/mark-paid')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  markPaid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
    @Body() dto: MarkPaymentDto,
  ) {
    return this.paymentsService.markPaid(user.userId, venueId, id, dto.note);
  }

  @Post('venues/mine/:venueId/bookings/:id/payment/mark-refunded')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  markRefunded(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
    @Body() dto: MarkPaymentDto,
  ) {
    return this.paymentsService.markRefunded(
      user.userId,
      venueId,
      id,
      dto.note,
    );
  }
}
```

- [ ] **Step 3: Create the module**

```typescript
// apps/api/src/payments/payments.module.ts
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { BookingsModule } from '../bookings/bookings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    forwardRef(() => BookingsModule),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
```

- [ ] **Step 4: Register `PaymentsModule` in `AppModule`**

In `apps/api/src/app.module.ts`, add the import statement after `import { BookingsModule } from './bookings/bookings.module';`:

```typescript
import { PaymentsModule } from './payments/payments.module';
```

And add `PaymentsModule` to the `imports` array, after `BookingsModule`:

```typescript
    CourtsModule,
    BookingsModule,
    PaymentsModule,
  ],
```

- [ ] **Step 5: Verify the app boots (this also proves the `forwardRef` wiring compiles even before Task 5 adds the reverse import)**

Run (from `apps/api`):
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/payments/dto/mark-payment.dto.ts apps/api/src/payments/payments.controller.ts apps/api/src/payments/payments.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): add PaymentsController and wire PaymentsModule into AppModule"
```

---

### Task 5: Wire `BookingsModule` → `PaymentsModule`; auto-create + enrich

**Files:**
- Modify: `apps/api/src/bookings/bookings.module.ts`
- Modify: `apps/api/src/bookings/bookings.service.ts`
- Modify: `apps/api/src/bookings/bookings.service.spec.ts`

**Interfaces:**
- Consumes: `PaymentsService.createForBooking`, `PaymentsService.findByBookingId`, `PaymentStatus` from Tasks 1 & 3.
- Produces: `BookingWithCourtInfo` and `BookingWithCustomerInfo` now include `paymentStatus: PaymentStatus`, `paymentNote: string | null`, `paidAt: Date | null`, `refundedAt: Date | null`. Consumed by Task 6 (e2e) and Tasks 8–9 (frontend).

- [ ] **Step 1: Update the failing tests first**

In `apps/api/src/bookings/bookings.service.spec.ts`:

Add imports at the top, after the existing `UsersService` import:

```typescript
import { PaymentsService } from '../payments/payments.service';
import { PaymentStatus } from '../payments/entities/payment.entity';
```

Add a mock factory, after `mockUsersService`:

```typescript
const mockPaymentsService = () => ({
  createForBooking: jest.fn().mockResolvedValue(undefined),
  findByBookingId: jest.fn().mockResolvedValue(null),
});
```

In `buildTestingModule`, add the provider (after the `UsersService` provider) and expose it in the returned object (after `usersService`):

```typescript
      { provide: UsersService, useFactory: mockUsersService },
      { provide: PaymentsService, useFactory: mockPaymentsService },
```
```typescript
    usersService: module.get(UsersService) as ReturnType<
      typeof mockUsersService
    >,
    paymentsService: module.get(PaymentsService) as ReturnType<
      typeof mockPaymentsService
    >,
```

In the `'creates a booking with one booking_slots row per unit slot'` test (inside `describe('BookingsService.create', ...)`), destructure `paymentsService` too and assert it was called:

```typescript
  it('creates a booking with one booking_slots row per unit slot', async () => {
    const { service, courtsService, venuesService, dataSource, paymentsService } =
      await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    const manager = buildMockManager();
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.create('customer-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '10:00',
    });

    expect(result.totalPrice).toBe(200000);
    expect(result.status).toBe(BookingStatus.CONFIRMED);
    expect(paymentsService.createForBooking).toHaveBeenCalledWith(
      'booking-1',
      manager,
    );
    const slotSaveCall = manager.save.mock.calls.find((call) =>
      Array.isArray(call[0]),
    );
    expect(slotSaveCall![0]).toHaveLength(2);
    expect(slotSaveCall![0].map((s: { slotStart: string }) => s.slotStart)).toEqual([
      '08:00',
      '09:00',
    ]);
  });
```

Replace the `findMineByCustomer` test body:

```typescript
describe('BookingsService.findMineByCustomer', () => {
  it('completes past bookings before listing, enriched with court/venue/payment info', async () => {
    const { service, bookingsRepo, courtsService, venuesService, paymentsService } =
      await buildTestingModule();
    bookingsRepo.find.mockResolvedValue([
      { id: 'booking-1', courtId: 'court-1' },
    ]);
    courtsService.findByIdOrThrow.mockResolvedValue({
      id: 'court-1',
      venueId: 'venue-1',
      name: 'Sân 1',
    });
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      name: 'Venue A',
    });
    paymentsService.findByBookingId.mockResolvedValue({
      status: PaymentStatus.PAID,
      note: 'CK',
      paidAt: new Date('2026-08-24T00:00:00Z'),
      refundedAt: null,
    });

    const result = await service.findMineByCustomer('customer-1');

    expect(bookingsRepo.createQueryBuilder().execute).toHaveBeenCalled();
    expect(bookingsRepo.find).toHaveBeenCalledWith({
      where: { customerId: 'customer-1' },
      order: { date: 'DESC', startTime: 'DESC' },
    });
    expect(result).toEqual([
      {
        id: 'booking-1',
        courtId: 'court-1',
        courtName: 'Sân 1',
        venueName: 'Venue A',
        paymentStatus: PaymentStatus.PAID,
        paymentNote: 'CK',
        paidAt: new Date('2026-08-24T00:00:00Z'),
        refundedAt: null,
      },
    ]);
  });

  it('defaults to unpaid when no payment row exists for the booking', async () => {
    const { service, bookingsRepo, courtsService, venuesService } =
      await buildTestingModule();
    bookingsRepo.find.mockResolvedValue([
      { id: 'booking-1', courtId: 'court-1' },
    ]);
    courtsService.findByIdOrThrow.mockResolvedValue({
      id: 'court-1',
      venueId: 'venue-1',
      name: 'Sân 1',
    });
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      name: 'Venue A',
    });

    const result = await service.findMineByCustomer('customer-1');

    expect(result[0]).toMatchObject({
      paymentStatus: PaymentStatus.UNPAID,
      paymentNote: null,
      paidAt: null,
      refundedAt: null,
    });
  });
});
```

Replace the `findMineById` test body (keep the `NotFoundException` test unchanged):

```typescript
describe('BookingsService.findMineById', () => {
  it('returns the booking enriched with court/venue/payment info', async () => {
    const { service, bookingsRepo, courtsService, venuesService, paymentsService } =
      await buildTestingModule();
    bookingsRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      customerId: 'customer-1',
      courtId: 'court-1',
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
    paymentsService.findByBookingId.mockResolvedValue(null);

    const result = await service.findMineById('customer-1', 'booking-1');

    expect(result).toEqual({
      id: 'booking-1',
      customerId: 'customer-1',
      courtId: 'court-1',
      courtName: 'Sân 1',
      venueName: 'Venue A',
      paymentStatus: PaymentStatus.UNPAID,
      paymentNote: null,
      paidAt: null,
      refundedAt: null,
    });
  });

  it('throws NotFoundException when the booking does not belong to the customer', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findMineById('customer-1', 'booking-1'),
    ).rejects.toThrow('Booking booking-1 không tồn tại');
  });
});
```

Replace the first `findByVenueForOwner` test body (keep the `'filters to a single court...'` test unchanged):

```typescript
describe('BookingsService.findByVenueForOwner', () => {
  it('lists bookings for every court in the venue, enriched with customer/payment info', async () => {
    const { service, bookingsRepo, courtsService, usersService, paymentsService } =
      await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([
      { id: 'court-1' },
      { id: 'court-2' },
    ]);
    bookingsRepo.find.mockResolvedValue([
      { id: 'booking-1', customerId: 'customer-1' },
    ]);
    usersService.findById.mockResolvedValue({
      id: 'customer-1',
      fullName: 'Nguyễn Văn A',
      phone: '0900000000',
    });
    paymentsService.findByBookingId.mockResolvedValue(null);

    const result = await service.findByVenueForOwner('owner-1', 'venue-1', {});

    expect(courtsService.findByVenueForOwner).toHaveBeenCalledWith(
      'owner-1',
      'venue-1',
    );
    expect(bookingsRepo.find).toHaveBeenCalledWith({
      where: { courtId: expect.anything() },
      order: { date: 'ASC', startTime: 'ASC' },
    });
    expect(result).toEqual([
      {
        id: 'booking-1',
        customerId: 'customer-1',
        customerName: 'Nguyễn Văn A',
        customerPhone: '0900000000',
        paymentStatus: PaymentStatus.UNPAID,
        paymentNote: null,
        paidAt: null,
        refundedAt: null,
      },
    ]);
  });

  it('filters to a single court when courtId is provided', async () => {
    const { service, bookingsRepo, courtsService } = await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([
      { id: 'court-1' },
      { id: 'court-2' },
    ]);
    bookingsRepo.find.mockResolvedValue([]);

    await service.findByVenueForOwner('owner-1', 'venue-1', {
      courtId: 'court-2',
    });

    const whereArg = bookingsRepo.find.mock.calls[0][0].where;
    expect(whereArg.courtId.value).toEqual(['court-2']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/api`):
```bash
npx jest bookings.service.spec.ts
```
Expected: FAIL — `Cannot find module '../payments/payments.service'` and/or assertion mismatches (payment fields missing from actual output).

- [ ] **Step 3: Wire `BookingsModule` to import `PaymentsModule`**

Replace `apps/api/src/bookings/bookings.module.ts`:

```typescript
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { BookingSlot } from './entities/booking-slot.entity';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { CourtsModule } from '../courts/courts.module';
import { UsersModule } from '../users/users.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, BookingSlot]),
    CourtsModule,
    UsersModule,
    forwardRef(() => PaymentsModule),
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
```

- [ ] **Step 4: Update `bookings.service.ts`**

Update the import block at the top of `apps/api/src/bookings/bookings.service.ts` (lines 1-18):

```typescript
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import { Booking, BookingStatus } from './entities/booking.entity';
import { BookingSlot } from './entities/booking-slot.entity';
import { CourtsService } from '../courts/courts.service';
import { VenuesService } from '../courts/venues.service';
import { VenueStatus } from '../courts/entities/venue.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { generateBookingSlotStarts } from './booking-slot-generator';
import { Slot } from '../courts/slot-generator';
import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentStatus } from '../payments/entities/payment.entity';
```

Update the type aliases (lines 23-27):

```typescript
type PaymentInfo = {
  paymentStatus: PaymentStatus;
  paymentNote: string | null;
  paidAt: Date | null;
  refundedAt: Date | null;
};
type BookingWithCourtInfo = Booking & { courtName: string; venueName: string } & PaymentInfo;
type BookingWithCustomerInfo = Booking & {
  customerName: string;
  customerPhone: string | null;
} & PaymentInfo;
```

Update the constructor (lines 30-41):

```typescript
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
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}
```

In `create()`, add the payment-creation call inside the transaction, right before `return savedBooking;` (around line 100):

```typescript
        await manager.save(slots);
        await this.paymentsService.createForBooking(savedBooking.id, manager);

        return savedBooking;
```

Add the new private helper right after `enrichWithCourtInfo` (after line 248, before `private async cancel`):

```typescript
  private async attachPaymentInfo<T extends Booking>(
    booking: T,
  ): Promise<T & PaymentInfo> {
    const payment = await this.paymentsService.findByBookingId(booking.id);
    return {
      ...booking,
      paymentStatus: payment?.status ?? PaymentStatus.UNPAID,
      paymentNote: payment?.note ?? null,
      paidAt: payment?.paidAt ?? null,
      refundedAt: payment?.refundedAt ?? null,
    };
  }
```

Update `enrichWithCourtInfo` (lines 238-248):

```typescript
  private async enrichWithCourtInfo(
    bookings: Booking[],
  ): Promise<BookingWithCourtInfo[]> {
    return Promise.all(
      bookings.map(async (booking) => {
        const court = await this.courtsService.findByIdOrThrow(booking.courtId);
        const venue = await this.venuesService.findByIdOrThrow(court.venueId);
        const withPayment = await this.attachPaymentInfo(booking);
        return { ...withPayment, courtName: court.name, venueName: venue.name };
      }),
    );
  }
```

Update the mapping inside `findByVenueForOwner` (lines 189-198):

```typescript
    return Promise.all(
      bookings.map(async (booking) => {
        const customer = await this.usersService.findById(booking.customerId);
        const withPayment = await this.attachPaymentInfo(booking);
        return {
          ...withPayment,
          customerName: customer?.fullName ?? 'Không rõ',
          customerPhone: customer?.phone ?? null,
        };
      }),
    );
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `apps/api`):
```bash
npx jest bookings.service.spec.ts
```
Expected: PASS, all tests.

- [ ] **Step 6: Type-check the whole API**

Run (from `apps/api`):
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/bookings/bookings.module.ts apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.service.spec.ts
git commit -m "feat(api): auto-create payment on booking creation and embed payment info in booking reads"
```

---

### Task 6: E2E coverage for the payment flow

**Files:**
- Create: `apps/api/test/payments.e2e-spec.ts`

**Interfaces:**
- Consumes: `POST /bookings`, `POST /venues/mine/:venueId/bookings/:id/payment/mark-paid`, `POST /venues/mine/:venueId/bookings/:id/payment/mark-refunded`, `GET /bookings/mine`, `GET /venues/mine/:venueId/bookings` (all existing/Task-4 endpoints).

- [ ] **Step 1: Write the e2e test**

```typescript
// apps/api/test/payments.e2e-spec.ts
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court } from '../src/courts/entities/court.entity';

describe('Payments (e2e)', () => {
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

  async function createActiveUserAndLogin(
    email: string,
    role: UserRole,
  ): Promise<{ userId: string; token: string }> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const repo = dataSource.getRepository(User);
    const user = await repo.save(
      repo.create({
        email,
        passwordHash,
        fullName: 'Test User',
        role,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' });
    return {
      userId: user.id,
      token: loginResponse.body.accessToken as string,
    };
  }

  async function createActiveVenueAndCourt(
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
        cancellationCutoffHours: 2,
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
    return { venueId: venue.id, courtId: court.id };
  }

  it('walks a booking from unpaid through paid to refunded, visible to both owner and customer', async () => {
    const owner = await createActiveUserAndLogin(
      'payowner1@test.com',
      UserRole.OWNER,
    );
    const { venueId, courtId } = await createActiveVenueAndCourt(owner.userId);
    const customer = await createActiveUserAndLogin(
      'paycustomer1@test.com',
      UserRole.CUSTOMER,
    );

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        courtId,
        date: '2099-02-01',
        startTime: '08:00',
        endTime: '09:00',
      })
      .expect(201);
    const bookingId = createResponse.body.id;

    const mineBeforePaid = await request(app.getHttpServer())
      .get('/bookings/mine')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(mineBeforePaid.body[0]).toMatchObject({ paymentStatus: 'unpaid' });

    await request(app.getHttpServer())
      .post(`/venues/mine/${venueId}/bookings/${bookingId}/payment/mark-paid`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ note: 'CK Vietcombank' })
      .expect(201);

    const ownerListAfterPaid = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/bookings`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(ownerListAfterPaid.body[0]).toMatchObject({
      paymentStatus: 'paid',
      paymentNote: 'CK Vietcombank',
    });

    const mineAfterPaid = await request(app.getHttpServer())
      .get('/bookings/mine')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(mineAfterPaid.body[0]).toMatchObject({ paymentStatus: 'paid' });

    await request(app.getHttpServer())
      .post(
        `/venues/mine/${venueId}/bookings/${bookingId}/payment/mark-paid`,
      )
      .set('Authorization', `Bearer ${owner.token}`)
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .post(
        `/venues/mine/${venueId}/bookings/${bookingId}/payment/mark-refunded`,
      )
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ note: 'Đã hoàn tiền qua CK' })
      .expect(201);

    const ownerListAfterRefunded = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/bookings`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(ownerListAfterRefunded.body[0]).toMatchObject({
      paymentStatus: 'refunded',
      paymentNote: 'Đã hoàn tiền qua CK',
    });
  });

  it('rejects mark-paid/mark-refunded for a booking on another owner\'s venue', async () => {
    const owner = await createActiveUserAndLogin(
      'payowner2@test.com',
      UserRole.OWNER,
    );
    const otherOwner = await createActiveUserAndLogin(
      'payowner3@test.com',
      UserRole.OWNER,
    );
    const { venueId: otherVenueId } = await createActiveVenueAndCourt(
      otherOwner.userId,
    );
    const { courtId } = await createActiveVenueAndCourt(owner.userId);
    const customer = await createActiveUserAndLogin(
      'paycustomer2@test.com',
      UserRole.CUSTOMER,
    );

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        courtId,
        date: '2099-02-02',
        startTime: '08:00',
        endTime: '09:00',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/venues/mine/${otherVenueId}/bookings/${createResponse.body.id}/payment/mark-paid`,
      )
      .set('Authorization', `Bearer ${otherOwner.token}`)
      .send({})
      .expect(404);
  });
});
```

- [ ] **Step 2: Run the e2e suite**

Run (from `apps/api`, with the dev Postgres container up):
```bash
npm run test:e2e -- payments.e2e-spec.ts
```
Expected: PASS, both tests.

- [ ] **Step 3: Run the full e2e suite to check for regressions**

Run (from `apps/api`):
```bash
npm run test:e2e
```
Expected: PASS, all e2e specs including `bookings.e2e-spec.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/payments.e2e-spec.ts
git commit -m "test(api): add e2e coverage for the payment mark-paid/mark-refunded flow"
```

---

### Task 7: Web BFF routes for mark-paid / mark-refunded

**Files:**
- Create: `apps/web/src/app/api/venues/mine/[venueId]/bookings/[id]/payment/mark-paid/route.ts`
- Create: `apps/web/src/app/api/venues/mine/[venueId]/bookings/[id]/payment/mark-refunded/route.ts`

**Interfaces:**
- Consumes: `POST /venues/mine/:venueId/bookings/:id/payment/mark-paid` and `.../mark-refunded` from Task 4.
- Produces: `POST /api/venues/mine/[venueId]/bookings/[id]/payment/mark-paid` and `.../mark-refunded` (Next.js BFF routes), consumed by Task 8.

- [ ] **Step 1: Create the mark-paid route**

```typescript
// apps/web/src/app/api/venues/mine/[venueId]/bookings/[id]/payment/mark-paid/route.ts
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string }> },
) {
  const { venueId, id } = await params;
  const body = await request.json();
  const upstream = await fetchApi(
    `/venues/mine/${venueId}/bookings/${id}/payment/mark-paid`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: Create the mark-refunded route**

```typescript
// apps/web/src/app/api/venues/mine/[venueId]/bookings/[id]/payment/mark-refunded/route.ts
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string }> },
) {
  const { venueId, id } = await params;
  const body = await request.json();
  const upstream = await fetchApi(
    `/venues/mine/${venueId}/bookings/${id}/payment/mark-refunded`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 3: Type-check the web app**

Run (from `apps/web`):
```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/api/venues/mine/[venueId]/bookings/[id]/payment/mark-paid/route.ts" "apps/web/src/app/api/venues/mine/[venueId]/bookings/[id]/payment/mark-refunded/route.ts"
git commit -m "feat(web): add BFF routes for payment mark-paid/mark-refunded"
```

---

### Task 8: Owner UI — payment status + actions in `bookings-section.tsx`

**Files:**
- Modify: `apps/web/src/app/owner/venues/[id]/bookings-section.tsx`

**Interfaces:**
- Consumes: `paymentStatus`, `paymentNote` fields now present on `GET /venues/mine/:venueId/bookings` responses (Task 5); BFF routes from Task 7.

- [ ] **Step 1: Add the payment type, label map, and state**

In `apps/web/src/app/owner/venues/[id]/bookings-section.tsx`, update the top of the file:

```typescript
type BookingStatus = "confirmed" | "cancelled" | "completed";
type PaymentStatus = "unpaid" | "paid" | "refunded";

interface OwnerBooking {
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
```

Add state, after the existing `confirmingId` state:

```typescript
  const [paymentAction, setPaymentAction] = useState<{
    bookingId: string;
    type: "pay" | "refund";
    note: string;
  } | null>(null);
```

- [ ] **Step 2: Add the mutation handler**

Add after `handleCancel`:

```typescript
  async function handlePaymentAction() {
    if (!paymentAction) return;
    const { bookingId, type, note } = paymentAction;
    const path = type === "pay" ? "mark-paid" : "mark-refunded";
    const response = await fetch(
      `/api/venues/mine/${venueId}/bookings/${bookingId}/payment/${path}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      },
    );
    const data = await response.json().catch(() => null);
    setPaymentAction(null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success(
      type === "pay" ? "Đã đánh dấu đã nhận tiền" : "Đã đánh dấu đã hoàn tiền",
    );
    setBookings(
      (current) =>
        current?.map((booking) =>
          booking.id === bookingId
            ? {
                ...booking,
                paymentStatus: type === "pay" ? "paid" : "refunded",
                paymentNote: note.trim() || booking.paymentNote,
              }
            : booking,
        ) ?? null,
    );
  }
```

- [ ] **Step 3: Restructure the booking card to show payment status + actions**

Replace the `<Card key={booking.id}>...</Card>` block inside the `bookings?.map(...)`:

```tsx
            <Card key={booking.id}>
              <CardContent className="flex flex-col gap-3 pt-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">
                      {courtName(booking.courtId)}
                    </p>
                    <p>
                      {booking.date} · {booking.startTime}–{booking.endTime}
                    </p>
                    <p>
                      {booking.customerName} · {booking.customerPhone ?? "Chưa có"}
                    </p>
                    <p>
                      {booking.totalPrice.toLocaleString("vi-VN")}đ ·{" "}
                      {STATUS_LABEL[booking.status]}
                    </p>
                  </div>
                  {booking.status === "confirmed" && (
                    <div className="flex gap-2">
                      {confirmingId === booking.id ? (
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
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <p className="text-sm text-muted-foreground">
                    {PAYMENT_STATUS_LABEL[booking.paymentStatus]}
                    {booking.paymentNote ? ` · ${booking.paymentNote}` : ""}
                  </p>
                  {paymentAction?.bookingId === booking.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Ghi chú (tuỳ chọn)"
                        value={paymentAction.note}
                        onChange={(event) =>
                          setPaymentAction({
                            ...paymentAction,
                            note: event.target.value,
                          })
                        }
                        className="h-8 w-40"
                      />
                      <Button size="sm" onClick={handlePaymentAction}>
                        Xác nhận
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPaymentAction(null)}
                      >
                        Thôi
                      </Button>
                    </div>
                  ) : (
                    <>
                      {booking.paymentStatus === "unpaid" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPaymentAction({
                              bookingId: booking.id,
                              type: "pay",
                              note: "",
                            })
                          }
                        >
                          Đã nhận tiền
                        </Button>
                      )}
                      {booking.paymentStatus === "paid" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setPaymentAction({
                              bookingId: booking.id,
                              type: "refund",
                              note: "",
                            })
                          }
                        >
                          Đánh dấu đã hoàn tiền
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
```

- [ ] **Step 4: Type-check and lint**

Run (from `apps/web`):
```bash
npx tsc --noEmit
npx eslint src/app/owner/venues/[id]/bookings-section.tsx
```
Expected: no errors.

- [ ] **Step 5: Manual check in the browser**

Run (from `apps/web`):
```bash
npm run dev
```
Then, as an owner with an existing venue and an unpaid confirmed booking: open the venue detail page, confirm the booking card shows "Chưa thanh toán" and an "Đã nhận tiền" button; click it, type a note, click "Xác nhận"; confirm the card updates to "Đã thanh toán · <note>" and the button becomes "Đánh dấu đã hoàn tiền"; click through to refunded and confirm the label updates to "Đã hoàn tiền" with no further action button. Stop the dev server after checking.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/src/app/owner/venues/[id]/bookings-section.tsx"
git commit -m "feat(web): add payment status and mark-paid/mark-refunded actions to owner bookings"
```

---

### Task 9: Customer UI — read-only payment badge in `/me/bookings`

**Files:**
- Modify: `apps/web/src/app/me/bookings/page.tsx`

**Interfaces:**
- Consumes: `paymentStatus` field now present on `GET /bookings/mine` responses (Task 5).

- [ ] **Step 1: Add the payment type, label map, and field**

In `apps/web/src/app/me/bookings/page.tsx`, update the top of the file:

```typescript
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
```

- [ ] **Step 2: Render the badge**

Update the `CardContent` block for each booking:

```tsx
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
```

(The `{booking.status === "confirmed" && (...)}` cancel-button block below stays unchanged.)

- [ ] **Step 3: Type-check and lint**

Run (from `apps/web`):
```bash
npx tsc --noEmit
npx eslint src/app/me/bookings/page.tsx
```
Expected: no errors.

- [ ] **Step 4: Manual check in the browser**

Run (from `apps/web`):
```bash
npm run dev
```
Then log in as a customer with at least one booking, visit `/me/bookings`, and confirm each booking card shows a payment status line ("Chưa thanh toán" by default). Stop the dev server after checking.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/me/bookings/page.tsx"
git commit -m "feat(web): show read-only payment status on customer bookings page"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1), forwardRef wiring (Tasks 3–5), state machine + validation (Task 3), API endpoints (Task 4), no separate read endpoints / embedded fields (Task 5), owner UI two-step + note (Task 8), customer read-only badge (Task 9), testing — unit (Tasks 2–3, 5), e2e (Task 6). All spec sections have a task.
- **Placeholder scan:** no TBD/TODO; every step has complete code or an exact command with expected output.
- **Type consistency:** `PaymentStatus` enum values (`unpaid`/`paid`/`refunded`) match across entity (Task 1), service (Task 3), `BookingsService` enrichment (Task 5), and frontend string-literal types (Tasks 8–9). `findByIdForOwnerOrThrow` signature (Task 2) matches its call site in `PaymentsService.markPaid`/`markRefunded` (Task 3).
