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
