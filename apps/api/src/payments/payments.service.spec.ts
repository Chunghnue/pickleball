import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { BookingsService } from '../bookings/bookings.service';
import { Booking } from '../bookings/entities/booking.entity';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { VenuesService } from '../courts/venues.service';
import { CourtsService } from '../courts/courts.service';

const mockPaymentsRepository = () => ({
  create: jest.fn((data: unknown) => data),
  save: jest.fn((data: unknown) =>
    Promise.resolve({ id: 'payment-1', ...(data as object) }),
  ),
  findOne: jest.fn(),
});

const mockBookingsService = () => ({
  findByIdForOwnerOrThrow: jest.fn(),
  findByIdOrThrow: jest.fn(),
});

const mockUsersService = () => ({
  findById: jest.fn(),
});

const mockNotificationsService = () => ({
  notifyPaymentConfirmed: jest.fn().mockResolvedValue(undefined),
  notifyPaymentRefunded: jest.fn().mockResolvedValue(undefined),
  notifyPaymentConfirmedForOwner: jest.fn().mockResolvedValue(undefined),
});

const mockNotificationSettingsService = () => ({
  getForOwner: jest.fn().mockResolvedValue({
    newBooking: true,
    cancellation: true,
    payment: true,
    dailyReport: true,
  }),
});

const mockVenuesService = () => ({
  findByIdOrThrow: jest.fn().mockResolvedValue({ id: 'venue-1', name: 'Venue A', email: null }),
});

const mockCourtsService = () => ({
  findByIdOrThrow: jest.fn().mockResolvedValue({ id: 'court-1', name: 'Sân 1', venueId: 'venue-1' }),
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
      { provide: UsersService, useFactory: mockUsersService },
      { provide: NotificationsService, useFactory: mockNotificationsService },
      { provide: NotificationSettingsService, useFactory: mockNotificationSettingsService },
      { provide: VenuesService, useFactory: mockVenuesService },
      { provide: CourtsService, useFactory: mockCourtsService },
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
    usersService: module.get(UsersService) as ReturnType<
      typeof mockUsersService
    >,
    notificationsService: module.get(NotificationsService) as ReturnType<
      typeof mockNotificationsService
    >,
    notificationSettingsService: module.get(NotificationSettingsService) as ReturnType<
      typeof mockNotificationSettingsService
    >,
    venuesService: module.get(VenuesService) as ReturnType<typeof mockVenuesService>,
    courtsService: module.get(CourtsService) as ReturnType<typeof mockCourtsService>,
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

describe('PaymentsService.markRefunded', () => {
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
