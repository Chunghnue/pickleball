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
