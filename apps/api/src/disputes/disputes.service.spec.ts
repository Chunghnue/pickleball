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
