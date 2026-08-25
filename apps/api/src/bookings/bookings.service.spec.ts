import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { BookingsService } from './bookings.service';
import { Booking, BookingStatus } from './entities/booking.entity';
import { BookingSlot } from './entities/booking-slot.entity';
import { CourtsService } from '../courts/courts.service';
import { VenuesService } from '../courts/venues.service';
import { VenueStatus } from '../courts/entities/venue.entity';
import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentStatus } from '../payments/entities/payment.entity';
import { NotificationsService } from '../notifications/notifications.service';

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
      { provide: DataSource, useFactory: mockDataSource },
    ],
  }).compile();

  return {
    service: module.get(BookingsService),
    bookingsRepo: module.get(getRepositoryToken(Booking)) as ReturnType<
      typeof mockBookingsRepository
    >,
    bookingSlotsRepo: module.get(
      getRepositoryToken(BookingSlot),
    ) as ReturnType<typeof mockBookingSlotsRepository>,
    courtsService: module.get(CourtsService) as ReturnType<
      typeof mockCourtsService
    >,
    venuesService: module.get(VenuesService) as ReturnType<
      typeof mockVenuesService
    >,
    usersService: module.get(UsersService) as ReturnType<
      typeof mockUsersService
    >,
    paymentsService: module.get(PaymentsService) as ReturnType<
      typeof mockPaymentsService
    >,
    notificationsService: module.get(NotificationsService) as ReturnType<
      typeof mockNotificationsService
    >,
    dataSource: module.get(DataSource) as ReturnType<typeof mockDataSource>,
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
      }),
    ).rejects.toThrow('Không thể đặt sân cho ngày trong quá khứ');
  });

  it('throws BadRequestException when the time range is not aligned to the slot grid', async () => {
    const { service, courtsService, venuesService } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:30',
        endTime: '09:30',
      }),
    ).rejects.toThrow(
      'Khung giờ đặt không hợp lệ hoặc không thẳng hàng với slot của sân',
    );
  });

  it('throws NotFoundException when the court is inactive', async () => {
    const { service, courtsService, venuesService } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue({
      ...ACTIVE_COURT,
      isActive: false,
    });
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:00',
        endTime: '09:00',
      }),
    ).rejects.toThrow('Court court-1 không tồn tại');
  });

  it('throws NotFoundException when the venue is not active', async () => {
    const { service, courtsService, venuesService } = await buildTestingModule();
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
      }),
    ).rejects.toThrow('Court court-1 không tồn tại');
  });
});

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

describe('BookingsService.cancelByCustomer', () => {
  const FIXED_NOW = new Date('2026-08-24T10:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('cancels a booking outside the cutoff window and frees its slots', async () => {
    const { service, bookingsRepo, courtsService, venuesService, dataSource } =
      await buildTestingModule();
    const booking = {
      id: 'booking-1',
      customerId: 'customer-1',
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '10:00',
      status: BookingStatus.CONFIRMED,
    };
    bookingsRepo.findOne.mockResolvedValue(booking);
    courtsService.findByIdOrThrow.mockResolvedValue({ venueId: 'venue-1' });
    venuesService.findByIdOrThrow.mockResolvedValue({
      cancellationCutoffHours: 2,
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

describe('BookingsService.cancelByOwner', () => {
  it('cancels a booking belonging to the venue regardless of cutoff', async () => {
    const { service, bookingsRepo, courtsService, dataSource } =
      await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([{ id: 'court-1' }]);
    bookingsRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      courtId: 'court-1',
      status: BookingStatus.CONFIRMED,
    });
    const manager = {
      save: jest.fn((data: unknown) => Promise.resolve(data)),
      delete: jest.fn(),
    };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.cancelByOwner('owner-1', 'venue-1', 'booking-1');

    expect(result.status).toBe(BookingStatus.CANCELLED);
    expect(result.cancelledBy).toBe('owner-1');
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
