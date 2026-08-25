# Notifications Module (email) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send best-effort Vietnamese email notifications for 5 booking/payment lifecycle events (booking confirmed, booking cancelled, new booking for owner, payment confirmed, payment refunded), without ever failing the triggering API request if email sending fails.

**Architecture:** New leaf `NotificationsModule` (depends only on the existing `MailModule`) owns 5 typed template methods on `NotificationsService`, each wrapping a call to a new generic `MailService.send(to, subject, html)` in a swallow-all try/catch. `BookingsService` and `PaymentsService` inject `NotificationsService` directly (no `forwardRef` needed — Notifications never imports Bookings/Payments) and call it after their respective DB transactions commit.

**Tech Stack:** NestJS, TypeORM, Jest (unit + e2e via supertest), existing `nodemailer`-based `MailService`.

## Global Constraints

- Email sending must never fail the triggering HTTP request — `NotificationsService` methods catch all errors internally and resolve (never reject).
- `NotificationsService` does not query the database itself — callers (`BookingsService`, `PaymentsService`) pass fully-resolved data (names, emails) as plain params.
- Payment confirmation/refund emails contain only date/time/amount — no venue/court name (keeps `PaymentsModule` from gaining a new dependency on Courts).
- Email HTML stays a single simple `<p>` block, matching the existing `sendVerificationEmail`/`sendPasswordResetEmail` style — no rich templates.
- `NotificationsModule` must not import `BookingsModule` or `PaymentsModule` (one-directional dependency, no `forwardRef`).

---

## File Structure

**Create:**
- `apps/api/src/notifications/notifications.service.ts` — 5 public `notifyXxx` methods + private `sendSafely` helper
- `apps/api/src/notifications/notifications.module.ts` — imports `MailModule`, exports `NotificationsService`
- `apps/api/src/notifications/notifications.service.spec.ts` — unit tests

**Modify:**
- `apps/api/src/mail/mail.service.ts` — add generic `send()`, refactor the two existing methods to use it
- `apps/api/src/mail/mail.service.spec.ts` — add test for `send()`
- `apps/api/src/app.module.ts` — register `NotificationsModule`
- `apps/api/src/bookings/bookings.module.ts` — import `NotificationsModule`
- `apps/api/src/bookings/bookings.service.ts` — inject `NotificationsService`; call it from `create()` and the private `cancel()`
- `apps/api/src/bookings/bookings.service.spec.ts` — mocks + assertions for the new calls
- `apps/api/src/payments/payments.module.ts` — import `UsersModule` and `NotificationsModule`
- `apps/api/src/payments/payments.service.ts` — inject `UsersService`/`NotificationsService`; call from `markPaid()`/`markRefunded()`
- `apps/api/src/payments/payments.service.spec.ts` — mocks + assertions for the new calls
- `apps/api/test/utils/test-app.ts` — add `send` to `mockMailService`
- `apps/api/test/bookings.e2e-spec.ts` — assert emails sent on create/cancel
- `apps/api/test/payments.e2e-spec.ts` — assert emails sent on mark-paid/mark-refunded

---

### Task 1: `MailService` generic `send()` method

**Files:**
- Modify: `apps/api/src/mail/mail.service.ts` (whole file, 40 lines)
- Test: `apps/api/src/mail/mail.service.spec.ts`

**Interfaces:**
- Produces: `MailService.send(to: string, subject: string, html: string): Promise<void>` — used by `NotificationsService` in Task 2.

- [ ] **Step 1: Write the failing test for `send()`**

Add to `apps/api/src/mail/mail.service.spec.ts`, after the existing `'sends a password reset email...'` test (before the closing `});` of the outer `describe`):

```ts
  it('sends a generic email with the given subject and html', async () => {
    await service.send('user@test.com', 'Test Subject', '<p>Hello</p>');

    expect(sendMail).toHaveBeenCalledWith({
      from: 'no-reply@pickleball.local',
      to: 'user@test.com',
      subject: 'Test Subject',
      html: '<p>Hello</p>',
    });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest mail.service.spec.ts`
Expected: FAIL — `service.send is not a function`

- [ ] **Step 3: Implement `send()`**

Replace the full contents of `apps/api/src/mail/mail.service.ts` with:

```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST', 'localhost'),
      port: this.config.get<number>('MAIL_PORT', 1025),
      secure: false,
    });
    this.from = this.config.get<string>('MAIL_FROM', 'no-reply@pickleball.local');
    this.appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to, subject, html });
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `${this.appUrl}/verify-email?token=${token}`;
    await this.send(
      to,
      'Xác thực email của bạn',
      `<p>Nhấn vào link để xác thực email: <a href="${link}">${link}</a></p>`,
    );
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const link = `${this.appUrl}/reset-password?token=${token}`;
    await this.send(
      to,
      'Đặt lại mật khẩu',
      `<p>Nhấn vào link để đặt lại mật khẩu: <a href="${link}">${link}</a></p>`,
    );
  }
}
```

- [ ] **Step 4: Run tests to verify all three pass**

Run: `cd apps/api && npx jest mail.service.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/mail/mail.service.ts apps/api/src/mail/mail.service.spec.ts
git commit -m "feat(api): add generic MailService.send() method"
```

---

### Task 2: `NotificationsModule` + `NotificationsService`

**Files:**
- Create: `apps/api/src/notifications/notifications.service.ts`
- Create: `apps/api/src/notifications/notifications.module.ts`
- Create: `apps/api/src/notifications/notifications.service.spec.ts`
- Modify: `apps/api/src/app.module.ts:1-14,32-39`

**Interfaces:**
- Consumes: `MailService.send(to, subject, html): Promise<void>` (Task 1).
- Produces (used by Task 3, 4, 5):
  - `NotificationsService.notifyBookingConfirmed(params: BookingConfirmedParams): Promise<void>`
  - `NotificationsService.notifyBookingCancelled(params: BookingCancelledParams): Promise<void>`
  - `NotificationsService.notifyNewBookingForOwner(params: NewBookingForOwnerParams): Promise<void>`
  - `NotificationsService.notifyPaymentConfirmed(params: PaymentStatusParams): Promise<void>`
  - `NotificationsService.notifyPaymentRefunded(params: PaymentStatusParams): Promise<void>`
  - Param shapes:
    ```ts
    interface BookingConfirmedParams { to: string; customerName: string; venueName: string; courtName: string; date: string; startTime: string; endTime: string; totalPrice: number }
    interface BookingCancelledParams { to: string; venueName: string; courtName: string; date: string; startTime: string; endTime: string; cancelledBy: 'customer' | 'owner' }
    interface NewBookingForOwnerParams { to: string; venueName: string; courtName: string; date: string; startTime: string; endTime: string; customerName: string; customerPhone: string | null; totalPrice: number }
    interface PaymentStatusParams { to: string; date: string; startTime: string; endTime: string; totalPrice: number }
    ```

- [ ] **Step 1: Write the failing unit test file**

Create `apps/api/src/notifications/notifications.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { MailService } from '../mail/mail.service';

const mockMailService = () => ({
  send: jest.fn().mockResolvedValue(undefined),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      NotificationsService,
      { provide: MailService, useFactory: mockMailService },
    ],
  }).compile();

  return {
    service: module.get(NotificationsService),
    mailService: module.get(MailService) as ReturnType<typeof mockMailService>,
  };
}

describe('NotificationsService.notifyBookingConfirmed', () => {
  it('sends a confirmation email with booking details', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyBookingConfirmed({
      to: 'customer@test.com',
      customerName: 'Nguyễn Văn A',
      venueName: 'Venue A',
      courtName: 'Sân 1',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 100000,
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'customer@test.com',
      'Xác nhận đặt sân',
      expect.stringContaining('Sân 1'),
    );
  });
});

describe('NotificationsService.notifyBookingCancelled', () => {
  it('sends a cancellation email naming who cancelled', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyBookingCancelled({
      to: 'customer@test.com',
      venueName: 'Venue A',
      courtName: 'Sân 1',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      cancelledBy: 'owner',
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'customer@test.com',
      'Booking đã được huỷ',
      expect.stringContaining('Sân 1'),
    );
  });
});

describe('NotificationsService.notifyNewBookingForOwner', () => {
  it('sends a new-booking email to the owner with customer contact info', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyNewBookingForOwner({
      to: 'owner@test.com',
      venueName: 'Venue A',
      courtName: 'Sân 1',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      customerName: 'Nguyễn Văn A',
      customerPhone: '0900000000',
      totalPrice: 100000,
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'owner@test.com',
      'Có booking mới',
      expect.stringContaining('Nguyễn Văn A'),
    );
  });
});

describe('NotificationsService.notifyPaymentConfirmed', () => {
  it('sends a payment confirmation email without venue/court name', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyPaymentConfirmed({
      to: 'customer@test.com',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 100000,
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'customer@test.com',
      'Xác nhận đã thanh toán',
      expect.any(String),
    );
  });
});

describe('NotificationsService.notifyPaymentRefunded', () => {
  it('sends a refund confirmation email', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyPaymentRefunded({
      to: 'customer@test.com',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 100000,
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'customer@test.com',
      'Xác nhận hoàn tiền',
      expect.any(String),
    );
  });
});

describe('NotificationsService best-effort error handling', () => {
  it('resolves without throwing when MailService.send rejects', async () => {
    const { service, mailService } = await buildTestingModule();
    mailService.send.mockRejectedValue(new Error('SMTP down'));

    await expect(
      service.notifyBookingConfirmed({
        to: 'customer@test.com',
        customerName: 'A',
        venueName: 'V',
        courtName: 'C',
        date: '2099-01-01',
        startTime: '08:00',
        endTime: '09:00',
        totalPrice: 100000,
      }),
    ).resolves.toBeUndefined();
  });

  it('skips sending and resolves when "to" is empty', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyPaymentConfirmed({
      to: '',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 100000,
    });

    expect(mailService.send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest notifications.service.spec.ts`
Expected: FAIL — cannot find module `./notifications.service`

- [ ] **Step 3: Implement `NotificationsService`**

Create `apps/api/src/notifications/notifications.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';

const currencyFormatter = new Intl.NumberFormat('vi-VN');

export interface BookingConfirmedParams {
  to: string;
  customerName: string;
  venueName: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
}

export interface BookingCancelledParams {
  to: string;
  venueName: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  cancelledBy: 'customer' | 'owner';
}

export interface NewBookingForOwnerParams {
  to: string;
  venueName: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  customerName: string;
  customerPhone: string | null;
  totalPrice: number;
}

export interface PaymentStatusParams {
  to: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly mailService: MailService) {}

  notifyBookingConfirmed(params: BookingConfirmedParams): Promise<void> {
    const html = `<p>Chào ${params.customerName}, bạn đã đặt sân thành công.<br/>
Sân: ${params.courtName} - ${params.venueName}<br/>
Ngày: ${params.date}, ${params.startTime} - ${params.endTime}<br/>
Tổng tiền: ${currencyFormatter.format(params.totalPrice)} đ</p>`;
    return this.sendSafely(params.to, 'Xác nhận đặt sân', html);
  }

  notifyBookingCancelled(params: BookingCancelledParams): Promise<void> {
    const who = params.cancelledBy === 'owner' ? 'chủ sân' : 'bạn';
    const html = `<p>Booking sau đã được huỷ bởi ${who}:<br/>
Sân: ${params.courtName} - ${params.venueName}<br/>
Ngày: ${params.date}, ${params.startTime} - ${params.endTime}</p>`;
    return this.sendSafely(params.to, 'Booking đã được huỷ', html);
  }

  notifyNewBookingForOwner(params: NewBookingForOwnerParams): Promise<void> {
    const phone = params.customerPhone ? ` - ${params.customerPhone}` : '';
    const html = `<p>Bạn vừa có một booking mới:<br/>
Sân: ${params.courtName} - ${params.venueName}<br/>
Ngày: ${params.date}, ${params.startTime} - ${params.endTime}<br/>
Khách: ${params.customerName}${phone}<br/>
Tổng tiền: ${currencyFormatter.format(params.totalPrice)} đ</p>`;
    return this.sendSafely(params.to, 'Có booking mới', html);
  }

  notifyPaymentConfirmed(params: PaymentStatusParams): Promise<void> {
    const html = `<p>Thanh toán cho booking ngày ${params.date}, ${params.startTime} - ${params.endTime} (${currencyFormatter.format(params.totalPrice)} đ) đã được xác nhận.</p>`;
    return this.sendSafely(params.to, 'Xác nhận đã thanh toán', html);
  }

  notifyPaymentRefunded(params: PaymentStatusParams): Promise<void> {
    const html = `<p>Booking ngày ${params.date}, ${params.startTime} - ${params.endTime} (${currencyFormatter.format(params.totalPrice)} đ) đã được hoàn tiền.</p>`;
    return this.sendSafely(params.to, 'Xác nhận hoàn tiền', html);
  }

  private async sendSafely(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    if (!to) {
      this.logger.warn(
        `Bỏ qua gửi email "${subject}" vì thiếu địa chỉ người nhận`,
      );
      return;
    }
    try {
      await this.mailService.send(to, subject, html);
    } catch (error) {
      this.logger.warn(
        `Gửi email "${subject}" tới ${to} thất bại: ${(error as Error).message}`,
      );
    }
  }
}
```

Create `apps/api/src/notifications/notifications.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest notifications.service.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Register `NotificationsModule` in `AppModule`**

In `apps/api/src/app.module.ts`, add the import statement after the `PaymentsModule` import (line 13):

```ts
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
```

And add `NotificationsModule` to the `imports` array, after `PaymentsModule` (line 38):

```ts
    BookingsModule,
    PaymentsModule,
    NotificationsModule,
  ],
```

- [ ] **Step 6: Verify the app still compiles**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/notifications apps/api/src/app.module.ts
git commit -m "feat(api): add NotificationsModule with 5 email templates"
```

---

### Task 3: Wire booking-confirmed + new-booking-for-owner emails into `BookingsService.create()`

**Files:**
- Modify: `apps/api/src/bookings/bookings.module.ts` (whole file, 23 lines)
- Modify: `apps/api/src/bookings/bookings.service.ts:1-124`
- Modify: `apps/api/src/bookings/bookings.service.spec.ts`

**Interfaces:**
- Consumes: `NotificationsService.notifyBookingConfirmed`, `NotificationsService.notifyNewBookingForOwner` (Task 2). `UsersService.findById(id): Promise<User | null>` (existing). `Venue.ownerId`, `Venue.name`, `Court.name` (existing entity fields).

- [ ] **Step 1: Import `NotificationsModule` in `BookingsModule`**

Replace the full contents of `apps/api/src/bookings/bookings.module.ts`:

```ts
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { BookingSlot } from './entities/booking-slot.entity';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { CourtsModule } from '../courts/courts.module';
import { UsersModule } from '../users/users.module';
import { PaymentsModule } from '../payments/payments.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking, BookingSlot]),
    CourtsModule,
    UsersModule,
    forwardRef(() => PaymentsModule),
    NotificationsModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
```

- [ ] **Step 2: Update the failing/passing unit test scaffolding for `create()`**

In `apps/api/src/bookings/bookings.service.spec.ts`, add the import and mock factory alongside the existing ones (after the `import { PaymentStatus } ...` line, and after `mockPaymentsService`):

```ts
import { NotificationsService } from '../notifications/notifications.service';
```

```ts
const mockNotificationsService = () => ({
  notifyBookingConfirmed: jest.fn().mockResolvedValue(undefined),
  notifyBookingCancelled: jest.fn().mockResolvedValue(undefined),
  notifyNewBookingForOwner: jest.fn().mockResolvedValue(undefined),
});
```

In `buildTestingModule()`, add the provider to the `providers` array (after the `PaymentsService` provider entry):

```ts
      { provide: PaymentsService, useFactory: mockPaymentsService },
      { provide: NotificationsService, useFactory: mockNotificationsService },
      { provide: DataSource, useFactory: mockDataSource },
```

And add it to the returned object (after `paymentsService`):

```ts
    paymentsService: module.get(PaymentsService) as ReturnType<
      typeof mockPaymentsService
    >,
    notificationsService: module.get(NotificationsService) as ReturnType<
      typeof mockNotificationsService
    >,
    dataSource: module.get(DataSource) as ReturnType<typeof mockDataSource>,
```

Update `ACTIVE_COURT` and `ACTIVE_VENUE` fixtures in the `describe('BookingsService.create', ...)` block to include the fields the new email calls need:

```ts
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
  const ACTIVE_VENUE = {
    id: 'venue-1',
    name: 'Venue A',
    ownerId: 'owner-1',
    status: VenueStatus.ACTIVE,
  };
```

Update the first test, `'creates a booking with one booking_slots row per unit slot'`, to mock `usersService.findById` and assert the two new notification calls. Replace the whole test body with:

```ts
  it('creates a booking with one booking_slots row per unit slot', async () => {
    const {
      service,
      courtsService,
      venuesService,
      usersService,
      dataSource,
      paymentsService,
      notificationsService,
    } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    usersService.findById.mockImplementation((id: string) =>
      Promise.resolve(
        id === 'customer-1'
          ? { id: 'customer-1', email: 'customer@test.com', fullName: 'Nguyễn Văn A', phone: '0900000000' }
          : { id: 'owner-1', email: 'owner@test.com', fullName: 'Owner' },
      ),
    );
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
    expect(notificationsService.notifyBookingConfirmed).toHaveBeenCalledWith({
      to: 'customer@test.com',
      customerName: 'Nguyễn Văn A',
      venueName: 'Venue A',
      courtName: 'Sân 1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '10:00',
      totalPrice: 200000,
    });
    expect(notificationsService.notifyNewBookingForOwner).toHaveBeenCalledWith({
      to: 'owner@test.com',
      venueName: 'Venue A',
      courtName: 'Sân 1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '10:00',
      customerName: 'Nguyễn Văn A',
      customerPhone: '0900000000',
      totalPrice: 200000,
    });
  });
```

- [ ] **Step 3: Run tests to verify this test fails**

Run: `cd apps/api && npx jest bookings.service.spec.ts -t "creates a booking with one booking_slots row"`
Expected: FAIL — `notificationsService.notifyBookingConfirmed` was not called (or `usersService.findById` mock unused), since `create()` doesn't call it yet.

- [ ] **Step 4: Implement the calls in `BookingsService.create()`**

In `apps/api/src/bookings/bookings.service.ts`, add the import (after the `PaymentStatus` import, line 22):

```ts
import { PaymentStatus } from '../payments/entities/payment.entity';
import { NotificationsService } from '../notifications/notifications.service';
```

Add the constructor param (after `paymentsService`, before `dataSource`):

```ts
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    private readonly notificationsService: NotificationsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
```

Replace the `create()` method body (lines 55-124) with:

```ts
  async create(customerId: string, dto: CreateBookingDto): Promise<Booking> {
    if (!DATE_PATTERN.test(dto.date)) {
      throw new BadRequestException('date phải theo định dạng YYYY-MM-DD');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (dto.date < today) {
      throw new BadRequestException(
        'Không thể đặt sân cho ngày trong quá khứ',
      );
    }

    const court = await this.courtsService.findByIdOrThrow(dto.courtId);
    if (!court.isActive) {
      throw new NotFoundException(`Court ${dto.courtId} không tồn tại`);
    }
    const venue = await this.venuesService.findByIdOrThrow(court.venueId);
    if (venue.status !== VenueStatus.ACTIVE) {
      throw new NotFoundException(`Court ${dto.courtId} không tồn tại`);
    }

    const slotStarts = generateBookingSlotStarts(dto.startTime, dto.endTime, {
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
    const totalPrice = Math.round(pricePerSlot * slotStarts.length * 100) / 100;

    let savedBooking: Booking;
    try {
      savedBooking = await this.dataSource.transaction(async (manager) => {
        const booking = manager.create(Booking, {
          courtId: dto.courtId,
          customerId,
          date: dto.date,
          startTime: dto.startTime,
          endTime: dto.endTime,
          totalPrice,
          status: BookingStatus.CONFIRMED,
        });
        const saved = await manager.save(booking);

        const slots = slotStarts.map((slotStart) =>
          manager.create(BookingSlot, {
            bookingId: saved.id,
            courtId: dto.courtId,
            date: dto.date,
            slotStart,
          }),
        );
        await manager.save(slots);
        await this.paymentsService.createForBooking(saved.id, manager);

        return saved;
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as unknown as { code?: string }).code === UNIQUE_VIOLATION_CODE
      ) {
        throw new ConflictException('Một hoặc nhiều khung giờ đã được đặt');
      }
      throw error;
    }

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
      totalPrice,
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
      totalPrice,
    });

    return savedBooking;
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest bookings.service.spec.ts`
Expected: PASS (all tests in the file, including the pre-existing `create` tests that don't reference notifications — they still pass because `usersService.findById` mock defaults to `jest.fn()` returning `undefined`, so `customer?.email ?? ''` safely falls back)

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/bookings/bookings.module.ts apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.service.spec.ts
git commit -m "feat(api): send booking-confirmed and new-booking-for-owner emails"
```

---

### Task 4: Wire booking-cancelled email into `BookingsService.cancel()`

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.ts` (imports, `cancelByCustomer`, `cancelByOwner`, private `cancel`)
- Modify: `apps/api/src/bookings/bookings.service.spec.ts`

**Interfaces:**
- Consumes: `NotificationsService.notifyBookingCancelled` (Task 2, already injected via Task 3's constructor change).

- [ ] **Step 1: Update `cancelByCustomer`/`cancelByOwner` unit tests**

In `apps/api/src/bookings/bookings.service.spec.ts`, in `describe('BookingsService.cancelByCustomer', ...)`, update the first test (`'cancels a booking outside the cutoff window and frees its slots'`) to mock `usersService.findById` and assert the notification call. Replace its body with:

```ts
  it('cancels a booking outside the cutoff window and frees its slots', async () => {
    const {
      service,
      bookingsRepo,
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
      date: '2026-08-25',
      startTime: '10:00',
      endTime: '11:00',
      status: BookingStatus.CONFIRMED,
    };
    bookingsRepo.findOne.mockResolvedValue(booking);
    courtsService.findByIdOrThrow.mockResolvedValue({
      venueId: 'venue-1',
      name: 'Sân 1',
    });
    venuesService.findByIdOrThrow.mockResolvedValue({
      cancellationCutoffHours: 2,
      name: 'Venue A',
    });
    usersService.findById.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@test.com',
    });
    const manager = {
      save: jest.fn((data: unknown) => Promise.resolve(data)),
      delete: jest.fn(),
    };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.cancelByCustomer('customer-1', 'booking-1');

    expect(result.status).toBe(BookingStatus.CANCELLED);
    expect(result.cancelledBy).toBe('customer-1');
    expect(manager.delete).toHaveBeenCalledWith(BookingSlot, {
      bookingId: 'booking-1',
    });
    expect(notificationsService.notifyBookingCancelled).toHaveBeenCalledWith({
      to: 'customer@test.com',
      venueName: 'Venue A',
      courtName: 'Sân 1',
      date: '2026-08-25',
      startTime: '10:00',
      endTime: '11:00',
      cancelledBy: 'customer',
    });
  });
```

In `describe('BookingsService.cancelByOwner', ...)`, update the first test (`'cancels a booking belonging to the venue regardless of cutoff'`) to add court/venue/customer lookups and assert the notification call. Replace its body with:

```ts
  it('cancels a booking belonging to the venue regardless of cutoff', async () => {
    const {
      service,
      bookingsRepo,
      courtsService,
      venuesService,
      usersService,
      dataSource,
      notificationsService,
    } = await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([{ id: 'court-1' }]);
    bookingsRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      courtId: 'court-1',
      customerId: 'customer-1',
      date: '2026-08-25',
      startTime: '10:00',
      endTime: '11:00',
      status: BookingStatus.CONFIRMED,
    });
    courtsService.findByIdOrThrow.mockResolvedValue({
      venueId: 'venue-1',
      name: 'Sân 1',
    });
    venuesService.findByIdOrThrow.mockResolvedValue({ name: 'Venue A' });
    usersService.findById.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@test.com',
    });
    const manager = {
      save: jest.fn((data: unknown) => Promise.resolve(data)),
      delete: jest.fn(),
    };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.cancelByOwner('owner-1', 'venue-1', 'booking-1');

    expect(result.status).toBe(BookingStatus.CANCELLED);
    expect(result.cancelledBy).toBe('owner-1');
    expect(notificationsService.notifyBookingCancelled).toHaveBeenCalledWith({
      to: 'customer@test.com',
      venueName: 'Venue A',
      courtName: 'Sân 1',
      date: '2026-08-25',
      startTime: '10:00',
      endTime: '11:00',
      cancelledBy: 'owner',
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest bookings.service.spec.ts -t cancel`
Expected: FAIL — `notificationsService.notifyBookingCancelled` was not called; `cancelByOwner` test also fails because `courtsService.findByIdOrThrow`/`venuesService.findByIdOrThrow` aren't called by the current implementation.

- [ ] **Step 3: Implement the calls**

In `apps/api/src/bookings/bookings.service.ts`, replace the existing `CourtsService`/`VenuesService`/`VenueStatus` import lines with the block below, which adds `Court` and `Venue`:

```ts
import { CourtsService } from '../courts/courts.service';
import { VenuesService } from '../courts/venues.service';
import { Court } from '../courts/entities/court.entity';
import { Venue, VenueStatus } from '../courts/entities/venue.entity';
```

Replace `cancelByCustomer` with:

```ts
  async cancelByCustomer(customerId: string, id: string): Promise<Booking> {
    const booking = await this.bookingsRepository.findOne({
      where: { id, customerId },
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${id} không tồn tại`);
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Chỉ có thể huỷ booking đang confirmed');
    }

    const court = await this.courtsService.findByIdOrThrow(booking.courtId);
    const venue = await this.venuesService.findByIdOrThrow(court.venueId);
    // Simplification: treat date+time as UTC, matching CourtsService's
    // date-string handling — no per-venue timezone support in MVP.
    const startsAtMs = new Date(
      `${booking.date}T${booking.startTime}:00Z`,
    ).getTime();
    const cutoffMs = venue.cancellationCutoffHours * 60 * 60 * 1000;
    if (Date.now() >= startsAtMs - cutoffMs) {
      throw new ForbiddenException(
        `Không thể huỷ trong vòng ${venue.cancellationCutoffHours} giờ trước giờ chơi`,
      );
    }

    return this.cancel(booking, customerId, court, venue);
  }
```

Replace `cancelByOwner` with:

```ts
  async cancelByOwner(
    ownerId: string,
    venueId: string,
    id: string,
  ): Promise<Booking> {
    const booking = await this.findByIdForOwnerOrThrow(ownerId, venueId, id);
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Chỉ có thể huỷ booking đang confirmed');
    }
    const court = await this.courtsService.findByIdOrThrow(booking.courtId);
    const venue = await this.venuesService.findByIdOrThrow(court.venueId);
    return this.cancel(booking, ownerId, court, venue);
  }
```

Replace the private `cancel` method with:

```ts
  private async cancel(
    booking: Booking,
    cancelledBy: string,
    court: Court,
    venue: Venue,
  ): Promise<Booking> {
    const saved = await this.dataSource.transaction(async (manager) => {
      booking.status = BookingStatus.CANCELLED;
      booking.cancelledAt = new Date();
      booking.cancelledBy = cancelledBy;
      const savedBooking = await manager.save(booking);
      await manager.delete(BookingSlot, { bookingId: booking.id });
      return savedBooking;
    });

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
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest bookings.service.spec.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.service.spec.ts
git commit -m "feat(api): send booking-cancelled email on customer/owner cancel"
```

---

### Task 5: Wire payment-confirmed/refunded emails into `PaymentsService`

**Files:**
- Modify: `apps/api/src/payments/payments.module.ts` (whole file, 18 lines)
- Modify: `apps/api/src/payments/payments.service.ts` (whole file, 97 lines)
- Modify: `apps/api/src/payments/payments.service.spec.ts`

**Interfaces:**
- Consumes: `NotificationsService.notifyPaymentConfirmed`, `NotificationsService.notifyPaymentRefunded` (Task 2). `UsersService.findById` (existing). `Booking.customerId/date/startTime/endTime/totalPrice` (existing entity fields, now captured from `findByIdForOwnerOrThrow`'s return value instead of discarded).

- [ ] **Step 1: Update `PaymentsModule` imports**

Replace the full contents of `apps/api/src/payments/payments.module.ts`:

```ts
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { BookingsModule } from '../bookings/bookings.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    forwardRef(() => BookingsModule),
    UsersModule,
    NotificationsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
```

- [ ] **Step 2: Update `markPaid`/`markRefunded` unit tests**

In `apps/api/src/payments/payments.service.spec.ts`, add imports after the existing `Booking` import:

```ts
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
```

Add mock factories after `mockBookingsService`:

```ts
const mockUsersService = () => ({
  findById: jest.fn(),
});

const mockNotificationsService = () => ({
  notifyPaymentConfirmed: jest.fn().mockResolvedValue(undefined),
  notifyPaymentRefunded: jest.fn().mockResolvedValue(undefined),
});
```

In `buildTestingModule()`, add the providers (after the `BookingsService` provider):

```ts
      { provide: BookingsService, useFactory: mockBookingsService },
      { provide: UsersService, useFactory: mockUsersService },
      { provide: NotificationsService, useFactory: mockNotificationsService },
```

And add to the returned object (after `bookingsService`):

```ts
    bookingsService: module.get(BookingsService) as ReturnType<
      typeof mockBookingsService
    >,
    usersService: module.get(UsersService) as ReturnType<
      typeof mockUsersService
    >,
    notificationsService: module.get(NotificationsService) as ReturnType<
      typeof mockNotificationsService
    >,
```

Update the booking fixture and assertion in `describe('PaymentsService.markPaid', ...)`'s first test (`'transitions unpaid to paid and records who/when/note'`). Replace its body with:

```ts
  it('transitions unpaid to paid and records who/when/note', async () => {
    const {
      service,
      paymentsRepo,
      bookingsService,
      usersService,
      notificationsService,
    } = await buildTestingModule();
    bookingsService.findByIdForOwnerOrThrow.mockResolvedValue({
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
      status: PaymentStatus.UNPAID,
      note: null,
    });
    usersService.findById.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@test.com',
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
    expect(notificationsService.notifyPaymentConfirmed).toHaveBeenCalledWith({
      to: 'customer@test.com',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 100000,
    });
  });
```

Update the booking fixture and assertion in `describe('PaymentsService.markRefunded', ...)`'s first test (`'transitions paid to refunded and records who/when/note'`). Replace its body with:

```ts
  it('transitions paid to refunded and records who/when/note', async () => {
    const {
      service,
      paymentsRepo,
      bookingsService,
      usersService,
      notificationsService,
    } = await buildTestingModule();
    bookingsService.findByIdForOwnerOrThrow.mockResolvedValue({
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
    expect(notificationsService.notifyPaymentRefunded).toHaveBeenCalledWith({
      to: 'customer@test.com',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 100000,
    });
  });
```

The other existing tests in this file (`markPaid`'s "not unpaid"/"not owned"/"no payment row" cases, `markRefunded`'s "not paid" case) mock `bookingsService.findByIdForOwnerOrThrow` to resolve `{ id: 'booking-1' }` with no other fields, or to reject — these paths throw before reaching the notification call, so they need no changes.

- [ ] **Step 3: Run tests to verify the two updated tests fail**

Run: `cd apps/api && npx jest payments.service.spec.ts -t "records who/when/note"`
Expected: FAIL — `notificationsService.notifyPaymentConfirmed`/`notifyPaymentRefunded` not called, since `PaymentsService` doesn't have `UsersService`/`NotificationsService` wired in yet.

- [ ] **Step 4: Implement the calls in `PaymentsService`**

Replace the full contents of `apps/api/src/payments/payments.service.ts`:

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

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest payments.service.spec.ts`
Expected: PASS (all tests)

- [ ] **Step 6: Run the full unit test suite and typecheck**

Run: `cd apps/api && npx jest --testPathIgnorePatterns=e2e && npx tsc --noEmit`
Expected: PASS, no type errors

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/payments/payments.module.ts apps/api/src/payments/payments.service.ts apps/api/src/payments/payments.service.spec.ts
git commit -m "feat(api): send payment-confirmed and payment-refunded emails"
```

---

### Task 6: E2E coverage

**Files:**
- Modify: `apps/api/test/utils/test-app.ts:12-15`
- Modify: `apps/api/test/bookings.e2e-spec.ts`
- Modify: `apps/api/test/payments.e2e-spec.ts`

**Interfaces:**
- Consumes: `mockMailService.send` (jest mock, new — parallel to the existing `sendVerificationEmail`/`sendPasswordResetEmail` mocks).

- [ ] **Step 1: Add `send` to `mockMailService`**

In `apps/api/test/utils/test-app.ts`, replace the `mockMailService` export:

```ts
export const mockMailService = {
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  send: jest.fn().mockResolvedValue(undefined),
};
```

- [ ] **Step 2: Add failing e2e assertions for bookings**

In `apps/api/test/bookings.e2e-spec.ts`, add the import (replace line 5):

```ts
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';
```

In the `beforeEach` block, add a clear call alongside `clearDatabase`:

```ts
  beforeEach(async () => {
    await clearDatabase(app);
    mockMailService.send.mockClear();
  });
```

In the test `'books a slot, shows it as booked in availability, and lists it under /bookings/mine'`, add assertions right after the existing `expect(createResponse.body).toMatchObject(...)` block:

```ts
    expect(mockMailService.send).toHaveBeenCalledWith(
      'customer1@test.com',
      'Xác nhận đặt sân',
      expect.stringContaining('Sân 1'),
    );
    expect(mockMailService.send).toHaveBeenCalledWith(
      'owner1@test.com',
      'Có booking mới',
      expect.stringContaining('Sân 1'),
    );
```

In the test `'blocks customer cancellation inside the cutoff window but allows owner cancellation'`, add an assertion right after the owner-cancel request block (`.expect(201);` for the owner cancel call):

```ts
    expect(mockMailService.send).toHaveBeenCalledWith(
      'customer3@test.com',
      'Booking đã được huỷ',
      expect.any(String),
    );
```

- [ ] **Step 3: Run bookings e2e to verify it fails, then implementation already makes it pass**

Run: `cd apps/api && npx jest --config test/jest-e2e.json bookings.e2e-spec.ts`
Expected: PASS — Tasks 3 and 4 already implemented the calls; this step confirms the real integration (`BookingsModule` → `NotificationsModule` → `MailModule`) is wired correctly end-to-end.

(If it fails, check `docker-compose.yml` — the API test DB must be running: `docker compose up -d` from the repo root, then re-run.)

- [ ] **Step 4: Add e2e assertions for payments**

In `apps/api/test/payments.e2e-spec.ts`, add the import (replace line 5):

```ts
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';
```

In the `beforeEach` block, add a clear call:

```ts
  beforeEach(async () => {
    await clearDatabase(app);
    mockMailService.send.mockClear();
  });
```

In the test `'walks a booking from unpaid through paid to refunded, visible to both owner and customer'`, add an assertion right after the mark-paid request block (after the `.expect(201);` for mark-paid):

```ts
    expect(mockMailService.send).toHaveBeenCalledWith(
      'paycustomer1@test.com',
      'Xác nhận đã thanh toán',
      expect.any(String),
    );
```

And add an assertion right after the mark-refunded request block (after its `.expect(201);`):

```ts
    expect(mockMailService.send).toHaveBeenCalledWith(
      'paycustomer1@test.com',
      'Xác nhận hoàn tiền',
      expect.any(String),
    );
```

- [ ] **Step 5: Run payments e2e to verify it passes**

Run: `cd apps/api && npx jest --config test/jest-e2e.json payments.e2e-spec.ts`
Expected: PASS

- [ ] **Step 6: Run the full test suite**

Run: `cd apps/api && npx jest && npx jest --config test/jest-e2e.json`
Expected: PASS (all unit + e2e tests)

- [ ] **Step 7: Commit**

```bash
git add apps/api/test/utils/test-app.ts apps/api/test/bookings.e2e-spec.ts apps/api/test/payments.e2e-spec.ts
git commit -m "test(api): add e2e coverage for booking/payment notification emails"
```
