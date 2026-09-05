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
import { Court, CourtStatus } from '../courts/entities/court.entity';
import { Venue, VenueStatus } from '../courts/entities/venue.entity';
import { CreateBookingDto } from './dto/create-booking.dto';
import { CreateOwnerBookingDto } from './dto/create-owner-booking.dto';
import { generateBookingSlotStarts } from './booking-slot-generator';
import { Slot } from '../courts/slot-generator';
import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentStatus } from '../payments/entities/payment.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationSettingsService } from '../notification-settings/notification-settings.service';
import { CustomerContactsService } from '../customer-contacts/customer-contacts.service';
import { PricingService } from '../pricing/pricing.service';
import { buildBookingCode } from './booking-code.util';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UNIQUE_VIOLATION_CODE = '23505';

type PaymentInfo = {
  paymentStatus: PaymentStatus;
  paymentNote: string | null;
  paidAt: Date | null;
  refundedAt: Date | null;
};
type BookingWithCourtInfo = Booking & {
  courtName: string;
  venueName: string;
  bookingCode: string;
} & PaymentInfo;
type BookingWithCustomerInfo = Booking & {
  customerName: string;
  customerPhone: string | null;
  bookingCode: string;
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
    private readonly notificationSettingsService: NotificationSettingsService,
    private readonly customerContactsService: CustomerContactsService,
    private readonly pricingService: PricingService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(
    customerId: string | null,
    dto: CreateBookingDto,
  ): Promise<Booking & { bookingCode: string }> {
    const { booking, court, venue } = await this.createBookingRecord({
      courtId: dto.courtId,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      customerId: customerId ?? undefined,
      contactName: dto.contactName,
      contactPhone: dto.contactPhone,
      contactEmail: dto.contactEmail,
      note: dto.note,
    });

    const customer = customerId
      ? await this.usersService.findById(customerId)
      : null;
    const owner = await this.usersService.findById(venue.ownerId);

    if (customerId) {
      await this.notificationsService.notifyBookingConfirmed({
        to: customer?.email ?? '',
        customerName: customer?.fullName ?? '',
        venueName: venue.name,
        courtName: court.name,
        date: dto.date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        totalPrice: booking.totalPrice,
      });
    } else if (dto.contactEmail) {
      await this.notificationsService.notifyBookingConfirmed({
        to: dto.contactEmail,
        customerName: dto.contactName,
        venueName: venue.name,
        courtName: court.name,
        date: dto.date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        totalPrice: booking.totalPrice,
      });
    }

    const notificationSettings =
      await this.notificationSettingsService.getForOwner(venue.ownerId);
    if (notificationSettings.newBooking) {
      await this.notificationsService.notifyNewBookingForOwner({
        to: venue.email ?? owner?.email ?? '',
        venueName: venue.name,
        courtName: court.name,
        date: dto.date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        customerName: customer?.fullName ?? dto.contactName,
        customerPhone: customer?.phone ?? dto.contactPhone,
        totalPrice: booking.totalPrice,
      });
    }

    return { ...booking, bookingCode: buildBookingCode(booking.id) };
  }

  async createBookingRecord(params: {
    courtId: string;
    date: string;
    startTime: string;
    endTime: string;
    customerId?: string;
    customerContactId?: string;
    recurringScheduleId?: string;
    totalPriceOverride?: number;
    note?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
  }): Promise<{ booking: Booking; court: Court; venue: Venue }> {
    if (!DATE_PATTERN.test(params.date)) {
      throw new BadRequestException('date phải theo định dạng YYYY-MM-DD');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (params.date < today) {
      throw new BadRequestException('Không thể đặt sân cho ngày trong quá khứ');
    }

    const court = await this.courtsService.findByIdOrThrow(params.courtId);
    if (court.status !== CourtStatus.ACTIVE) {
      throw new NotFoundException(`Court ${params.courtId} không tồn tại`);
    }
    const venue = await this.venuesService.findByIdOrThrow(court.venueId);
    if (venue.status !== VenueStatus.ACTIVE) {
      throw new NotFoundException(`Court ${params.courtId} không tồn tại`);
    }

    const slotStarts = generateBookingSlotStarts(
      params.startTime,
      params.endTime,
      {
        openTime: court.openTime,
        closeTime: court.closeTime,
        slotDurationMinutes: court.slotDurationMinutes,
      },
    );
    if (!slotStarts) {
      throw new BadRequestException(
        'Khung giờ đặt không hợp lệ hoặc không thẳng hàng với slot của sân',
      );
    }

    let computedPrice = 0;
    for (const slotStart of slotStarts) {
      const resolvedPrice = await this.pricingService.resolvePrice(
        params.courtId,
        params.date,
        slotStart,
      );
      computedPrice += resolvedPrice * (court.slotDurationMinutes / 60);
    }
    computedPrice = Math.round(computedPrice * 100) / 100;
    const totalPrice = params.totalPriceOverride ?? computedPrice;

    try {
      const booking = await this.dataSource.transaction(async (manager) => {
        const entity = manager.create(Booking, {
          courtId: params.courtId,
          customerId: params.customerId ?? null,
          customerContactId: params.customerContactId ?? null,
          recurringScheduleId: params.recurringScheduleId ?? null,
          date: params.date,
          startTime: params.startTime,
          endTime: params.endTime,
          totalPrice,
          status: BookingStatus.CONFIRMED,
          note: params.note ?? null,
          contactName: params.contactName ?? null,
          contactPhone: params.contactPhone ?? null,
          contactEmail: params.contactEmail ?? null,
        });
        const saved = await manager.save(entity);

        const slots = slotStarts.map((slotStart) =>
          manager.create(BookingSlot, {
            bookingId: saved.id,
            courtId: params.courtId,
            date: params.date,
            slotStart,
          }),
        );
        await manager.save(slots);
        await this.paymentsService.createForBooking(saved.id, manager);

        return saved;
      });
      return { booking, court, venue };
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as unknown as { code?: string }).code === UNIQUE_VIOLATION_CODE
      ) {
        throw new ConflictException('Một hoặc nhiều khung giờ đã được đặt');
      }
      throw error;
    }
  }

  async cancelFutureOccurrences(
    scheduleId: string,
    cancelledBy: string,
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    await this.dataSource.transaction(async (manager) => {
      const bookings = await manager.find(Booking, {
        where: {
          recurringScheduleId: scheduleId,
          status: BookingStatus.CONFIRMED,
        },
      });
      for (const booking of bookings) {
        if (booking.date < today) {
          continue;
        }
        booking.status = BookingStatus.CANCELLED;
        booking.cancelledAt = new Date();
        booking.cancelledBy = cancelledBy;
        await manager.save(booking);
        await manager.delete(BookingSlot, { bookingId: booking.id });
      }
    });
  }

  findByRecurringScheduleId(recurringScheduleId: string): Promise<Booking[]> {
    return this.bookingsRepository.find({
      where: { recurringScheduleId },
      order: { date: 'ASC', startTime: 'ASC' },
    });
  }

  countByRecurringScheduleId(recurringScheduleId: string): Promise<number> {
    return this.bookingsRepository.count({ where: { recurringScheduleId } });
  }

  async createForOwner(
    ownerId: string,
    venueId: string,
    dto: CreateOwnerBookingDto,
  ): Promise<Booking> {
    const venue = await this.venuesService.getOwnedVenueOrThrow(
      ownerId,
      venueId,
    );
    const court = await this.courtsService.findByIdOrThrow(dto.courtId);
    if (court.venueId !== venueId) {
      throw new NotFoundException(`Court ${dto.courtId} không tồn tại`);
    }

    const customerRef = await this.customerContactsService.resolveSelector(
      ownerId,
      dto,
    );

    const { booking } = await this.createBookingRecord({
      courtId: dto.courtId,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      note: dto.note,
      ...customerRef,
    });

    if (customerRef.customerId) {
      const customer = await this.usersService.findById(customerRef.customerId);
      await this.notificationsService.notifyBookingConfirmed({
        to: customer?.email ?? '',
        customerName: customer?.fullName ?? '',
        venueName: venue.name,
        courtName: court.name,
        date: dto.date,
        startTime: dto.startTime,
        endTime: dto.endTime,
        totalPrice: booking.totalPrice,
      });
    }

    return booking;
  }

  async findMineByCustomer(
    customerId: string,
  ): Promise<BookingWithCourtInfo[]> {
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
        const { name, phone } = await this.resolveCustomerDisplay(booking);
        const withPayment = await this.attachPaymentInfo(booking);
        return {
          ...withPayment,
          customerName: name,
          customerPhone: phone,
          bookingCode: buildBookingCode(booking.id),
        };
      }),
    );
  }

  private async resolveCustomerDisplay(
    booking: Booking,
  ): Promise<{ name: string; phone: string | null }> {
    if (booking.contactName) {
      return { name: booking.contactName, phone: booking.contactPhone ?? null };
    }
    if (booking.customerId) {
      const customer = await this.usersService.findById(booking.customerId);
      return {
        name: customer?.fullName ?? 'Không rõ',
        phone: customer?.phone ?? null,
      };
    }
    if (booking.customerContactId) {
      const contact = await this.customerContactsService.findById(
        booking.customerContactId,
      );
      return {
        name: contact?.fullName ?? 'Không rõ',
        phone: contact?.phone ?? null,
      };
    }
    return { name: 'Không rõ', phone: null };
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

  async findByIdOrThrow(id: string): Promise<Booking> {
    const booking = await this.bookingsRepository.findOne({ where: { id } });
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
        return {
          ...withPayment,
          courtName: court.name,
          venueName: venue.name,
          bookingCode: buildBookingCode(booking.id),
        };
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

    if (booking.customerId) {
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
    }

    const cancelledByCustomer = cancelledBy === booking.customerId;
    if (cancelledByCustomer) {
      const notificationSettings =
        await this.notificationSettingsService.getForOwner(venue.ownerId);
      if (notificationSettings.cancellation) {
        const owner = await this.usersService.findById(venue.ownerId);
        await this.notificationsService.notifyBookingCancelledForOwner({
          to: venue.email ?? owner?.email ?? '',
          venueName: venue.name,
          courtName: court.name,
          date: booking.date,
          startTime: booking.startTime,
          endTime: booking.endTime,
        });
      }
    }

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
