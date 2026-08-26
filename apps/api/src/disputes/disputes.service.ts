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
