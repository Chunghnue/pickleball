import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { BookingsService } from './bookings.service';
import { Booking, BookingStatus } from './entities/booking.entity';
import { BookingSlot } from './entities/booking-slot.entity';
import { CourtsService } from '../courts/courts.service';
import { VenuesService } from '../courts/venues.service';
import { VenueStatus } from '../courts/entities/venue.entity';
import { CourtStatus } from '../courts/entities/court.entity';
import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentStatus } from '../payments/entities/payment.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { CustomerContactsService } from '../customer-contacts/customer-contacts.service';
import { PricingService } from '../pricing/pricing.service';
import { buildBookingCode } from './booking-code.util';

const mockBookingsRepository = () => {
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
};

const mockBookingSlotsRepository = () => ({
  find: jest.fn(),
});

const mockCourtsService = () => ({
  findByIdOrThrow: jest.fn(),
  findByVenueForOwner: jest.fn(),
  getSlotsForDate: jest.fn(),
});

const mockVenuesService = () => ({
  findByIdOrThrow: jest.fn(),
  getOwnedVenueOrThrow: jest.fn(),
});

const mockUsersService = () => ({
  findById: jest.fn(),
});

const mockPaymentsService = () => ({
  createForBooking: jest.fn().mockResolvedValue(undefined),
  findByBookingId: jest.fn().mockResolvedValue(null),
});

const mockNotificationsService = () => ({
  notifyBookingConfirmed: jest.fn().mockResolvedValue(undefined),
  notifyBookingCancelled: jest.fn().mockResolvedValue(undefined),
  notifyNewBookingForOwner: jest.fn().mockResolvedValue(undefined),
  notifyBookingCancelledForOwner: jest.fn().mockResolvedValue(undefined),
});

const mockNotificationSettingsService = () => ({
  getForOwner: jest.fn().mockResolvedValue({
    newBooking: true,
    cancellation: true,
    payment: true,
    dailyReport: true,
  }),
});

const mockCustomerContactsService = () => ({
  resolveSelector: jest.fn(),
  findById: jest.fn(),
});

const mockPricingService = () => ({
  resolvePrice: jest.fn().mockResolvedValue(100000),
});

function buildMockManager() {
  return {
    create: jest.fn((_entity: unknown, data: unknown) => data),
    save: jest.fn((data: unknown) =>
      Array.isArray(data)
        ? Promise.resolve(data)
        : Promise.resolve({ id: 'booking-1', ...(data as object) }),
    ),
    delete: jest.fn(),
  };
}

const mockDataSource = () => ({
  transaction: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      BookingsService,
      {
        provide: getRepositoryToken(Booking),
        useFactory: mockBookingsRepository,
      },
      {
        provide: getRepositoryToken(BookingSlot),
        useFactory: mockBookingSlotsRepository,
      },
      { provide: CourtsService, useFactory: mockCourtsService },
      { provide: VenuesService, useFactory: mockVenuesService },
      { provide: UsersService, useFactory: mockUsersService },
      { provide: PaymentsService, useFactory: mockPaymentsService },
      { provide: NotificationsService, useFactory: mockNotificationsService },
      {
        provide: NotificationSettingsService,
        useFactory: mockNotificationSettingsService,
      },
      {
        provide: CustomerContactsService,
        useFactory: mockCustomerContactsService,
      },
      { provide: PricingService, useFactory: mockPricingService },
      { provide: DataSource, useFactory: mockDataSource },
    ],
  }).compile();

  return {
    service: module.get(BookingsService),
    bookingsRepo: module.get(getRepositoryToken(Booking)),
    bookingSlotsRepo: module.get(getRepositoryToken(BookingSlot)),
    courtsService: module.get(CourtsService),
    venuesService: module.get(VenuesService),
    usersService: module.get(UsersService),
    paymentsService: module.get(PaymentsService),
    notificationsService: module.get(NotificationsService),
    notificationSettingsService: module.get(NotificationSettingsService),
    customerContactsService: module.get(CustomerContactsService),
    pricingService: module.get(PricingService),
    dataSource: module.get(DataSource),
  };
}

describe('BookingsService.create', () => {
  const FIXED_TODAY = new Date('2026-08-24T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_TODAY);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

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
  const ACTIVE_VENUE = {
    id: 'venue-1',
    name: 'Venue A',
    ownerId: 'owner-1',
    status: VenueStatus.ACTIVE,
  };

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
          ? {
              id: 'customer-1',
              email: 'customer@test.com',
              fullName: 'Nguyễn Văn A',
              phone: '0900000000',
            }
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
      contactName: 'Nguyễn Văn A',
      contactPhone: '0900000000',
    });

    expect(result.totalPrice).toBe(200000);
    expect(result.status).toBe(BookingStatus.CONFIRMED);
    expect(result.bookingCode).toBe(buildBookingCode('booking-1'));
    expect(paymentsService.createForBooking).toHaveBeenCalledWith(
      'booking-1',
      manager,
    );
    const slotSaveCall = manager.save.mock.calls.find((call) =>
      Array.isArray(call[0]),
    );
    expect(slotSaveCall![0]).toHaveLength(2);
    expect(
      slotSaveCall![0].map((s: { slotStart: string }) => s.slotStart),
    ).toEqual(['08:00', '09:00']);
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

  it('sums per-slot resolved prices instead of a single flat rate', async () => {
    const {
      service,
      courtsService,
      venuesService,
      usersService,
      dataSource,
      pricingService,
    } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    usersService.findById.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@test.com',
      fullName: 'Nguyễn Văn A',
    });
    pricingService.resolvePrice
      .mockResolvedValueOnce(120000)
      .mockResolvedValueOnce(150000);
    const manager = buildMockManager();
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.create('customer-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '10:00',
      contactName: 'Nguyễn Văn A',
      contactPhone: '0900000000',
    });

    expect(pricingService.resolvePrice).toHaveBeenCalledWith(
      'court-1',
      '2026-08-25',
      '08:00',
    );
    expect(pricingService.resolvePrice).toHaveBeenCalledWith(
      'court-1',
      '2026-08-25',
      '09:00',
    );
    expect(result.totalPrice).toBe(270000);
  });

  it('throws ConflictException when a slot is already taken', async () => {
    const { service, courtsService, venuesService, dataSource } =
      await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    const uniqueViolation = Object.assign(
      new QueryFailedError('INSERT', [], new Error('dup')),
      { code: '23505' },
    );
    dataSource.transaction.mockRejectedValue(uniqueViolation);

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
      }),
    ).rejects.toThrow('Một hoặc nhiều khung giờ đã được đặt');
  });

  it('throws BadRequestException for a date in the past', async () => {
    const { service } = await buildTestingModule();

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-01',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
      }),
    ).rejects.toThrow('Không thể đặt sân cho ngày trong quá khứ');
  });

  it('throws BadRequestException when the time range is not aligned to the slot grid', async () => {
    const { service, courtsService, venuesService } =
      await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:30',
        endTime: '09:30',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
      }),
    ).rejects.toThrow(
      'Khung giờ đặt không hợp lệ hoặc không thẳng hàng với slot của sân',
    );
  });

  it('throws NotFoundException when the court is inactive', async () => {
    const { service, courtsService, venuesService } =
      await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue({
      ...ACTIVE_COURT,
      status: CourtStatus.CLOSED,
    });
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
      }),
    ).rejects.toThrow('Court court-1 không tồn tại');
  });

  it('throws NotFoundException when the venue is not active', async () => {
    const { service, courtsService, venuesService } =
      await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      status: VenueStatus.PENDING_APPROVAL,
    });

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
      }),
    ).rejects.toThrow('Court court-1 không tồn tại');
  });

  it('creates a guest booking without a customerId, storing the submitted contact info', async () => {
    const {
      service,
      courtsService,
      venuesService,
      usersService,
      dataSource,
      notificationsService,
    } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    usersService.findById.mockResolvedValue({
      id: 'owner-1',
      email: 'owner@test.com',
      fullName: 'Owner',
    });
    const manager = buildMockManager();
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.create(null, {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      contactName: 'Khách vãng lai',
      contactPhone: '0911111111',
      contactEmail: 'guest@test.com',
    });

    expect(result.customerId).toBeNull();
    expect(result.contactName).toBe('Khách vãng lai');
    expect(result.contactPhone).toBe('0911111111');
    expect(usersService.findById).toHaveBeenCalledTimes(1);
    expect(usersService.findById).toHaveBeenCalledWith('owner-1');
    expect(notificationsService.notifyBookingConfirmed).toHaveBeenCalledWith({
      to: 'guest@test.com',
      customerName: 'Khách vãng lai',
      venueName: 'Venue A',
      courtName: 'Sân 1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 100000,
    });
    expect(notificationsService.notifyNewBookingForOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        customerName: 'Khách vãng lai',
        customerPhone: '0911111111',
      }),
    );
  });

  it('does not send a guest confirmation email when contactEmail is omitted', async () => {
    const {
      service,
      courtsService,
      venuesService,
      usersService,
      dataSource,
      notificationsService,
    } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    usersService.findById.mockResolvedValue({
      id: 'owner-1',
      email: 'owner@test.com',
      fullName: 'Owner',
    });
    dataSource.transaction.mockImplementation((cb) => cb(buildMockManager()));

    await service.create(null, {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      contactName: 'Khách vãng lai',
      contactPhone: '0911111111',
    });

    expect(notificationsService.notifyBookingConfirmed).not.toHaveBeenCalled();
    expect(notificationsService.notifyNewBookingForOwner).toHaveBeenCalled();
  });
});

describe('BookingsService.create — owner notification gating', () => {
  const FIXED_TODAY = new Date('2026-08-24T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_TODAY);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

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
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      status: VenueStatus.ACTIVE,
      name: 'Venue A',
      email: null,
    });
    usersService.findById.mockImplementation((id: string) =>
      id === 'owner-1'
        ? Promise.resolve({
            id: 'owner-1',
            email: 'owner@test.com',
            fullName: 'Owner',
          })
        : Promise.resolve({
            id,
            email: 'customer@test.com',
            fullName: 'Customer',
            phone: null,
          }),
    );
    dataSource.transaction.mockImplementation((cb) => cb(buildMockManager()));

    await service.create('customer-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      contactName: 'Nguyễn Văn A',
      contactPhone: '0900000000',
    });

    expect(
      notificationsService.notifyNewBookingForOwner,
    ).not.toHaveBeenCalled();
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
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      status: VenueStatus.ACTIVE,
      name: 'Venue A',
      email: 'venue@test.com',
    });
    usersService.findById.mockImplementation((id: string) =>
      id === 'owner-1'
        ? Promise.resolve({
            id: 'owner-1',
            email: 'owner@test.com',
            fullName: 'Owner',
          })
        : Promise.resolve({
            id,
            email: 'customer@test.com',
            fullName: 'Customer',
            phone: null,
          }),
    );
    dataSource.transaction.mockImplementation((cb) => cb(buildMockManager()));

    await service.create('customer-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      contactName: 'Nguyễn Văn A',
      contactPhone: '0900000000',
    });

    expect(notificationsService.notifyNewBookingForOwner).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'venue@test.com' }),
    );
  });
});

describe('BookingsService.findMineByCustomer', () => {
  it('completes past bookings before listing, enriched with court/venue/payment info', async () => {
    const {
      service,
      bookingsRepo,
      courtsService,
      venuesService,
      paymentsService,
    } = await buildTestingModule();
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

describe('BookingsService.findMineById', () => {
  it('returns the booking enriched with court/venue/payment info', async () => {
    const {
      service,
      bookingsRepo,
      courtsService,
      venuesService,
      paymentsService,
    } = await buildTestingModule();
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

describe('BookingsService.cancelByCustomer', () => {
  const FIXED_NOW = new Date('2026-08-24T10:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

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

  it('throws ForbiddenException inside the cutoff window', async () => {
    const { service, bookingsRepo, courtsService, venuesService } =
      await buildTestingModule();
    bookingsRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      customerId: 'customer-1',
      courtId: 'court-1',
      date: '2026-08-24',
      startTime: '11:00',
      status: BookingStatus.CONFIRMED,
    });
    courtsService.findByIdOrThrow.mockResolvedValue({ venueId: 'venue-1' });
    venuesService.findByIdOrThrow.mockResolvedValue({
      cancellationCutoffHours: 2,
    });

    await expect(
      service.cancelByCustomer('customer-1', 'booking-1'),
    ).rejects.toThrow('Không thể huỷ trong vòng 2 giờ trước giờ chơi');
  });

  it('throws NotFoundException when the booking does not belong to the customer', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.cancelByCustomer('customer-1', 'booking-1'),
    ).rejects.toThrow('Booking booking-1 không tồn tại');
  });

  it('throws BadRequestException when the booking is not confirmed', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      customerId: 'customer-1',
      status: BookingStatus.CANCELLED,
    });

    await expect(
      service.cancelByCustomer('customer-1', 'booking-1'),
    ).rejects.toThrow('Chỉ có thể huỷ booking đang confirmed');
  });
});

describe('BookingsService cancel — owner notification', () => {
  it('notifies the owner when a customer cancels and the setting is on', async () => {
    const {
      service,
      bookingsRepo,
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
      status: BookingStatus.CONFIRMED,
    };
    bookingsRepo.findOne.mockResolvedValue(booking);
    courtsService.findByIdOrThrow.mockResolvedValue({
      id: 'court-1',
      name: 'Sân 1',
      venueId: 'venue-1',
    });
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      name: 'Venue A',
      email: null,
      cancellationCutoffHours: 0,
    });
    usersService.findById.mockImplementation((id: string) =>
      id === 'owner-1'
        ? Promise.resolve({
            id: 'owner-1',
            email: 'owner@test.com',
            fullName: 'Owner',
          })
        : Promise.resolve({
            id,
            email: 'customer@test.com',
            fullName: 'Customer',
          }),
    );
    dataSource.transaction.mockImplementation((cb) => cb(buildMockManager()));

    await service.cancelByCustomer('customer-1', 'booking-1');

    expect(notificationSettingsService.getForOwner).toHaveBeenCalledWith(
      'owner-1',
    );
    expect(
      notificationsService.notifyBookingCancelledForOwner,
    ).toHaveBeenCalledWith(expect.objectContaining({ to: 'owner@test.com' }));
  });

  it('does not notify the owner when the owner cancels their own booking', async () => {
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
    const booking = {
      id: 'booking-1',
      customerId: 'customer-1',
      courtId: 'court-1',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      status: BookingStatus.CONFIRMED,
    };
    bookingsRepo.findOne.mockResolvedValue(booking);
    courtsService.findByIdOrThrow.mockResolvedValue({
      id: 'court-1',
      name: 'Sân 1',
      venueId: 'venue-1',
    });
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      name: 'Venue A',
      email: null,
      cancellationCutoffHours: 0,
    });
    usersService.findById.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@test.com',
      fullName: 'Customer',
    });
    dataSource.transaction.mockImplementation((cb) => cb(buildMockManager()));

    await service.cancelByOwner('owner-1', 'venue-1', 'booking-1');

    expect(
      notificationsService.notifyBookingCancelledForOwner,
    ).not.toHaveBeenCalled();
  });
});

describe('BookingsService.findByVenueForOwner', () => {
  it('lists bookings for every court in the venue, enriched with customer/payment info', async () => {
    const {
      service,
      bookingsRepo,
      courtsService,
      usersService,
      paymentsService,
    } = await buildTestingModule();
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
        bookingCode: buildBookingCode('booking-1'),
        paymentStatus: PaymentStatus.UNPAID,
        paymentNote: null,
        paidAt: null,
        refundedAt: null,
      },
    ]);
  });

  it('resolves customer name/phone from customer_contacts for walk-in bookings', async () => {
    const {
      service,
      bookingsRepo,
      courtsService,
      customerContactsService,
      paymentsService,
    } = await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([{ id: 'court-1' }]);
    bookingsRepo.find.mockResolvedValue([
      { id: 'booking-2', customerId: null, customerContactId: 'contact-1' },
    ]);
    customerContactsService.findById.mockResolvedValue({
      id: 'contact-1',
      fullName: 'Khách vãng lai',
      phone: '0922222222',
    });
    paymentsService.findByBookingId.mockResolvedValue(null);

    const result = await service.findByVenueForOwner('owner-1', 'venue-1', {});

    expect(result[0]).toMatchObject({
      customerName: 'Khách vãng lai',
      customerPhone: '0922222222',
      bookingCode: buildBookingCode('booking-2'),
    });
  });

  it('prefers the contact snapshot on the booking over customerId/customerContactId joins', async () => {
    const {
      service,
      bookingsRepo,
      courtsService,
      usersService,
      customerContactsService,
      paymentsService,
    } = await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([{ id: 'court-1' }]);
    bookingsRepo.find.mockResolvedValue([
      {
        id: 'booking-3',
        customerId: 'customer-1',
        contactName: 'Trần Thị B',
        contactPhone: '0933333333',
      },
    ]);
    paymentsService.findByBookingId.mockResolvedValue(null);

    const result = await service.findByVenueForOwner('owner-1', 'venue-1', {});

    expect(result[0]).toMatchObject({
      customerName: 'Trần Thị B',
      customerPhone: '0933333333',
    });
    expect(usersService.findById).not.toHaveBeenCalled();
    expect(customerContactsService.findById).not.toHaveBeenCalled();
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

describe('BookingsService.cancelByOwner', () => {
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

    const result = await service.cancelByOwner(
      'owner-1',
      'venue-1',
      'booking-1',
    );

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

  it('throws NotFoundException when the booking is not on any court in the venue', async () => {
    const { service, bookingsRepo, courtsService } = await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([{ id: 'court-1' }]);
    bookingsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.cancelByOwner('owner-1', 'venue-1', 'booking-1'),
    ).rejects.toThrow('Booking booking-1 không tồn tại');
  });
});

describe('BookingsService.findByIdForOwnerOrThrow', () => {
  it('returns the booking when it belongs to a court in the venue', async () => {
    const { service, bookingsRepo, courtsService } = await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([{ id: 'court-1' }]);
    bookingsRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      courtId: 'court-1',
    });

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

describe('BookingsService.getAvailability', () => {
  it('marks slots that already have a booking_slots row as booked', async () => {
    const { service, courtsService, bookingSlotsRepo } =
      await buildTestingModule();
    courtsService.getSlotsForDate.mockResolvedValue([
      { start: '08:00', end: '09:00', price: 100000 },
      { start: '09:00', end: '10:00', price: 100000 },
    ]);
    bookingSlotsRepo.find.mockResolvedValue([{ slotStart: '08:00' }]);

    const result = await service.getAvailability('court-1', '2026-08-25');

    expect(bookingSlotsRepo.find).toHaveBeenCalledWith({
      where: { courtId: 'court-1', date: '2026-08-25' },
    });
    expect(result).toEqual([
      { start: '08:00', end: '09:00', price: 100000, isBooked: true },
      { start: '09:00', end: '10:00', price: 100000, isBooked: false },
    ]);
  });
});

describe('BookingsService.findByIdOrThrow', () => {
  it('returns the booking regardless of who owns it', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      customerId: 'someone-else',
    });

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

describe('BookingsService.createForOwner', () => {
  const FIXED_TODAY = new Date('2026-08-24T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_TODAY);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

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
  const ACTIVE_VENUE = {
    id: 'venue-1',
    name: 'Venue A',
    ownerId: 'owner-1',
    status: VenueStatus.ACTIVE,
  };

  it('creates a walk-in booking via newCustomer and skips the customer email', async () => {
    const {
      service,
      courtsService,
      venuesService,
      customerContactsService,
      dataSource,
      notificationsService,
    } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue(ACTIVE_VENUE);
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    customerContactsService.resolveSelector.mockResolvedValue({
      customerContactId: 'contact-1',
    });
    const manager = buildMockManager();
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.createForOwner('owner-1', 'venue-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '10:00',
      newCustomer: { fullName: 'Khách vãng lai', phone: '0911111111' },
    });

    expect(customerContactsService.resolveSelector).toHaveBeenCalledWith(
      'owner-1',
      {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:00',
        endTime: '10:00',
        newCustomer: { fullName: 'Khách vãng lai', phone: '0911111111' },
      },
    );
    expect(result.customerContactId).toBe('contact-1');
    expect(result.totalPrice).toBe(200000);
    expect(notificationsService.notifyBookingConfirmed).not.toHaveBeenCalled();
  });

  it('persists the note when provided', async () => {
    const {
      service,
      courtsService,
      venuesService,
      customerContactsService,
      dataSource,
    } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue(ACTIVE_VENUE);
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    customerContactsService.resolveSelector.mockResolvedValue({
      customerContactId: 'contact-1',
    });
    const manager = buildMockManager();
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.createForOwner('owner-1', 'venue-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      note: 'Cần thuê áo đấu',
      newCustomer: { fullName: 'Khách vãng lai', phone: '0911111111' },
    });

    expect(result.note).toBe('Cần thuê áo đấu');
  });

  it('sends the confirmation email when the resolved customer is a registered user', async () => {
    const {
      service,
      courtsService,
      venuesService,
      usersService,
      customerContactsService,
      dataSource,
      notificationsService,
    } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue(ACTIVE_VENUE);
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    customerContactsService.resolveSelector.mockResolvedValue({
      customerId: 'customer-1',
    });
    usersService.findById.mockResolvedValue({
      id: 'customer-1',
      email: 'customer@test.com',
      fullName: 'Nguyễn Văn A',
    });
    const manager = buildMockManager();
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    await service.createForOwner('owner-1', 'venue-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '09:00',
      customerId: 'customer-1',
    });

    expect(notificationsService.notifyBookingConfirmed).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'customer@test.com' }),
    );
    expect(
      notificationsService.notifyNewBookingForOwner,
    ).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the court does not belong to the venue', async () => {
    const { service, courtsService, venuesService } =
      await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue(ACTIVE_VENUE);
    courtsService.findByIdOrThrow.mockResolvedValue({
      ...ACTIVE_COURT,
      venueId: 'other-venue',
    });

    await expect(
      service.createForOwner('owner-1', 'venue-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:00',
        endTime: '09:00',
        customerId: 'customer-1',
      }),
    ).rejects.toThrow('Court court-1 không tồn tại');
  });
});

describe('BookingsService.cancelFutureOccurrences', () => {
  const FIXED_NOW = new Date('2026-08-24T10:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('cancels only confirmed future occurrences of the schedule and frees their slots', async () => {
    const { service, dataSource } = await buildTestingModule();
    const futureBooking = {
      id: 'booking-future',
      date: '2026-08-25',
      status: BookingStatus.CONFIRMED,
    };
    const pastBooking = {
      id: 'booking-past',
      date: '2026-08-01',
      status: BookingStatus.CONFIRMED,
    };
    const manager = {
      find: jest.fn().mockResolvedValue([futureBooking, pastBooking]),
      save: jest.fn((data: unknown) => Promise.resolve(data)),
      delete: jest.fn(),
    };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    await service.cancelFutureOccurrences('schedule-1', 'owner-1');

    expect(manager.find).toHaveBeenCalledWith(Booking, {
      where: {
        recurringScheduleId: 'schedule-1',
        status: BookingStatus.CONFIRMED,
      },
    });
    expect(futureBooking.status).toBe(BookingStatus.CANCELLED);
    expect(manager.delete).toHaveBeenCalledWith(BookingSlot, {
      bookingId: 'booking-future',
    });
    expect(manager.delete).not.toHaveBeenCalledWith(BookingSlot, {
      bookingId: 'booking-past',
    });
    expect(pastBooking.status).toBe(BookingStatus.CONFIRMED);
  });
});

describe('BookingsService.findByRecurringScheduleId', () => {
  it('returns bookings for the schedule ordered by date/startTime', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.find.mockResolvedValue([
      { id: 'booking-1', recurringScheduleId: 'schedule-1' },
    ]);

    const result = await service.findByRecurringScheduleId('schedule-1');

    expect(bookingsRepo.find).toHaveBeenCalledWith({
      where: { recurringScheduleId: 'schedule-1' },
      order: { date: 'ASC', startTime: 'ASC' },
    });
    expect(result).toEqual([
      { id: 'booking-1', recurringScheduleId: 'schedule-1' },
    ]);
  });
});

describe('BookingsService.countByRecurringScheduleId', () => {
  it('counts bookings for the schedule', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.count.mockResolvedValue(3);

    const result = await service.countByRecurringScheduleId('schedule-1');

    expect(bookingsRepo.count).toHaveBeenCalledWith({
      where: { recurringScheduleId: 'schedule-1' },
    });
    expect(result).toBe(3);
  });
});
