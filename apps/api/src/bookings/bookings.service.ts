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
import { Court } from '../courts/entities/court.entity';
import { Venue, VenueStatus } from '../courts/entities/venue.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { generateBookingSlotStarts } from './booking-slot-generator';
import { Slot } from '../courts/slot-generator';
import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentStatus } from '../payments/entities/payment.entity';
import { NotificationsService } from '../notifications/notifications.service';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UNIQUE_VIOLATION_CODE = '23505';

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

@Injectable()
export class BookingsService {
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
    private readonly notificationsService: NotificationsService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

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

  async findMineByCustomer(customerId: string): Promise<BookingWithCourtInfo[]> {
    await this.completePastBookings();
    const bookings = await this.bookingsRepository.find({
      where: { customerId },
      order: { date: 'DESC', startTime: 'DESC' },
    });
    return this.enrichWithCourtInfo(bookings);
  }

  async findMineById(
    customerId: string,
    id: string,
  ): Promise<BookingWithCourtInfo> {
    await this.completePastBookings();
    const booking = await this.bookingsRepository.findOne({
      where: { id, customerId },
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${id} không tồn tại`);
    }
    const [enriched] = await this.enrichWithCourtInfo([booking]);
    return enriched;
  }

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

  async findByVenueForOwner(
    ownerId: string,
    venueId: string,
    filters: { date?: string; courtId?: string },
  ): Promise<BookingWithCustomerInfo[]> {
    await this.completePastBookings();
    const courts = await this.courtsService.findByVenueForOwner(
      ownerId,
      venueId,
    );
    const courtIds = filters.courtId
      ? courts
          .filter((court) => court.id === filters.courtId)
          .map((court) => court.id)
      : courts.map((court) => court.id);

    const bookings = await this.bookingsRepository.find({
      where: {
        courtId: In(courtIds.length > 0 ? courtIds : ['__none__']),
        ...(filters.date ? { date: filters.date } : {}),
      },
      order: { date: 'ASC', startTime: 'ASC' },
    });

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
  }

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

  async getAvailability(
    courtId: string,
    date: string,
  ): Promise<Array<Slot & { isBooked: boolean }>> {
    const slots = await this.courtsService.getSlotsForDate(courtId, date);
    const bookedSlots = await this.bookingSlotsRepository.find({
      where: { courtId, date },
    });
    const bookedStarts = new Set(bookedSlots.map((slot) => slot.slotStart));
    return slots.map((slot) => ({
      ...slot,
      isBooked: bookedStarts.has(slot.start),
    }));
  }

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

  private async completePastBookings(): Promise<void> {
    await this.bookingsRepository
      .createQueryBuilder()
      .update(Booking)
      .set({ status: BookingStatus.COMPLETED })
      .where('status = :confirmed', { confirmed: BookingStatus.CONFIRMED })
      .andWhere(`(date + end_time) < now()`)
      .execute();
  }
}
