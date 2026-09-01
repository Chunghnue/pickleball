import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { RecurringSchedule, RecurringScheduleStatus } from './entities/recurring-schedule.entity';
import { CreateRecurringScheduleDto } from './dto/create-recurring-schedule.dto';
import { UpdateRecurringScheduleDto } from './dto/update-recurring-schedule.dto';
import { generateOccurrenceDates } from './occurrence-dates.util';
import { addDays } from './date.util';
import { CourtsService } from '../courts/courts.service';
import { VenuesService } from '../courts/venues.service';
import { CustomerContactsService } from '../customer-contacts/customer-contacts.service';
import { BookingsService } from '../bookings/bookings.service';
import { Booking } from '../bookings/entities/booking.entity';
import { User } from '../users/entities/user.entity';
import { CustomerContact } from '../customer-contacts/entities/customer-contact.entity';

const MAX_SPAN_DAYS = 366;

@Injectable()
export class RecurringSchedulesService {
  constructor(
    @InjectRepository(RecurringSchedule)
    private readonly repository: Repository<RecurringSchedule>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(CustomerContact)
    private readonly customerContactsRepository: Repository<CustomerContact>,
    private readonly courtsService: CourtsService,
    private readonly venuesService: VenuesService,
    private readonly customerContactsService: CustomerContactsService,
    private readonly bookingsService: BookingsService,
  ) {}

  async create(
    ownerId: string,
    venueId: string,
    dto: CreateRecurringScheduleDto,
  ): Promise<{ schedule: RecurringSchedule; generatedCount: number; conflictingDates: string[] }> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const court = await this.courtsService.findByIdOrThrow(dto.courtId);
    if (court.venueId !== venueId) {
      throw new NotFoundException(`Court ${dto.courtId} không tồn tại`);
    }
    if (dto.validFrom > dto.validTo) {
      throw new BadRequestException('validFrom phải trước hoặc bằng validTo');
    }
    const spanDays =
      (new Date(`${dto.validTo}T00:00:00Z`).getTime() -
        new Date(`${dto.validFrom}T00:00:00Z`).getTime()) /
      (24 * 60 * 60 * 1000);
    if (spanDays > MAX_SPAN_DAYS) {
      throw new BadRequestException('Khoảng thời gian lịch cố định tối đa 12 tháng');
    }

    const customerRef = await this.customerContactsService.resolveSelector(ownerId, dto);

    const schedule = await this.repository.save(
      this.repository.create({
        courtId: dto.courtId,
        ...customerRef,
        dayOfWeek: dto.dayOfWeek,
        startTime: dto.startTime,
        endTime: dto.endTime,
        pricePerSession: dto.pricePerSession,
        discountPercent: dto.discountPercent ?? null,
        validFrom: dto.validFrom,
        validTo: dto.validTo,
        note: dto.note ?? null,
        autoRenew: dto.autoRenew ?? false,
      }),
    );

    const sessionPrice =
      Math.round(dto.pricePerSession * (1 - (dto.discountPercent ?? 0) / 100) * 100) / 100;
    const dates = generateOccurrenceDates(dto.validFrom, dto.validTo, dto.dayOfWeek);
    const conflictingDates: string[] = [];
    let generatedCount = 0;

    for (const date of dates) {
      try {
        await this.bookingsService.createBookingRecord({
          courtId: dto.courtId,
          date,
          startTime: dto.startTime,
          endTime: dto.endTime,
          ...customerRef,
          recurringScheduleId: schedule.id,
          totalPriceOverride: sessionPrice,
        });
        generatedCount += 1;
      } catch (error) {
        if (error instanceof ConflictException) {
          conflictingDates.push(date);
          continue;
        }
        throw error;
      }
    }

    return { schedule, generatedCount, conflictingDates };
  }

  private async getOwnedScheduleOrThrow(
    ownerId: string,
    venueId: string,
    id: string,
  ): Promise<RecurringSchedule> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const schedule = await this.repository.findOne({ where: { id } });
    if (!schedule) {
      throw new NotFoundException(`Lịch cố định ${id} không tồn tại`);
    }
    const court = await this.courtsService.findByIdOrThrow(schedule.courtId);
    if (court.venueId !== venueId) {
      throw new NotFoundException(`Lịch cố định ${id} không tồn tại`);
    }
    return schedule;
  }

  async cancel(ownerId: string, venueId: string, id: string): Promise<RecurringSchedule> {
    const schedule = await this.getOwnedScheduleOrThrow(ownerId, venueId, id);
    if (schedule.status === RecurringScheduleStatus.CANCELLED) {
      throw new BadRequestException('Lịch cố định đã bị huỷ');
    }

    schedule.status = RecurringScheduleStatus.CANCELLED;
    await this.repository.save(schedule);
    await this.bookingsService.cancelFutureOccurrences(id, ownerId);
    return schedule;
  }

  async pause(ownerId: string, venueId: string, id: string): Promise<RecurringSchedule> {
    const schedule = await this.getOwnedScheduleOrThrow(ownerId, venueId, id);
    if (schedule.status !== RecurringScheduleStatus.ACTIVE) {
      throw new BadRequestException('Chỉ có thể tạm dừng lịch đang hoạt động');
    }
    schedule.status = RecurringScheduleStatus.PAUSED;
    return this.repository.save(schedule);
  }

  async resume(ownerId: string, venueId: string, id: string): Promise<RecurringSchedule> {
    const schedule = await this.getOwnedScheduleOrThrow(ownerId, venueId, id);
    if (schedule.status !== RecurringScheduleStatus.PAUSED) {
      throw new BadRequestException('Chỉ có thể tiếp tục lịch đang tạm dừng');
    }
    schedule.status = RecurringScheduleStatus.ACTIVE;
    return this.repository.save(schedule);
  }

  async update(
    ownerId: string,
    venueId: string,
    id: string,
    dto: UpdateRecurringScheduleDto,
  ): Promise<RecurringSchedule> {
    const schedule = await this.getOwnedScheduleOrThrow(ownerId, venueId, id);
    if (schedule.status === RecurringScheduleStatus.CANCELLED) {
      throw new BadRequestException('Không thể sửa lịch cố định đã huỷ');
    }
    if (dto.validTo !== undefined && dto.validTo < schedule.validFrom) {
      throw new BadRequestException('validTo phải sau hoặc bằng validFrom');
    }

    if (dto.pricePerSession !== undefined) schedule.pricePerSession = dto.pricePerSession;
    if (dto.discountPercent !== undefined) schedule.discountPercent = dto.discountPercent;
    if (dto.note !== undefined) schedule.note = dto.note;
    if (dto.autoRenew !== undefined) schedule.autoRenew = dto.autoRenew;
    if (dto.validTo !== undefined) schedule.validTo = dto.validTo;

    return this.repository.save(schedule);
  }

  private async resolveCustomerInfo(
    schedules: RecurringSchedule[],
  ): Promise<Map<string, { fullName: string; phone: string | null }>> {
    const userIds = schedules.map((s) => s.customerId).filter((id): id is string => !!id);
    const contactIds = schedules
      .map((s) => s.customerContactId)
      .filter((id): id is string => !!id);

    const [users, contacts] = await Promise.all([
      userIds.length > 0 ? this.usersRepository.find({ where: { id: In(userIds) } }) : [],
      contactIds.length > 0
        ? this.customerContactsRepository.find({ where: { id: In(contactIds) } })
        : [],
    ]);

    const info = new Map<string, { fullName: string; phone: string | null }>();
    for (const user of users) info.set(user.id, { fullName: user.fullName, phone: user.phone });
    for (const contact of contacts)
      info.set(contact.id, { fullName: contact.fullName, phone: contact.phone });
    return info;
  }

  async findByVenueForOwner(
    ownerId: string,
    venueId: string,
  ): Promise<
    Array<
      RecurringSchedule & {
        occurrenceCount: number;
        customerName: string;
        customerPhone: string | null;
      }
    >
  > {
    const courts = await this.courtsService.findByVenueForOwner(ownerId, venueId);
    const courtIds = courts.map((court) => court.id);
    const schedules = await this.repository.find({
      where: { courtId: In(courtIds.length > 0 ? courtIds : ['__none__']) },
      order: { createdAt: 'DESC' },
    });
    const info = await this.resolveCustomerInfo(schedules);
    return Promise.all(
      schedules.map(async (schedule) => {
        const customer = info.get(schedule.customerId ?? schedule.customerContactId ?? '');
        return {
          ...schedule,
          occurrenceCount: await this.bookingsService.countByRecurringScheduleId(schedule.id),
          customerName: customer?.fullName ?? 'Khách hàng',
          customerPhone: customer?.phone ?? null,
        };
      }),
    );
  }

  async findByIdForOwner(
    ownerId: string,
    venueId: string,
    id: string,
  ): Promise<{ schedule: RecurringSchedule; occurrences: Booking[] }> {
    const schedule = await this.getOwnedScheduleOrThrow(ownerId, venueId, id);
    const occurrences = await this.bookingsService.findByRecurringScheduleId(id);
    return { schedule, occurrences };
  }

  @Cron('0 1 * * *')
  async renewExpiringSchedules(): Promise<void> {
    const cutoff = addDays(new Date().toISOString().slice(0, 10), 7);
    const dueSchedules = await this.repository.find({
      where: {
        status: RecurringScheduleStatus.ACTIVE,
        autoRenew: true,
        validTo: LessThanOrEqual(cutoff),
      },
    });
    for (const schedule of dueSchedules) {
      await this.renewSchedule(schedule);
    }
  }

  async renewSchedule(
    schedule: RecurringSchedule,
  ): Promise<{ generatedCount: number; conflictingDates: string[] }> {
    const renewalStart = addDays(schedule.validTo, 1);
    const newValidTo = addDays(schedule.validTo, 30);
    const sessionPrice =
      Math.round(schedule.pricePerSession * (1 - (schedule.discountPercent ?? 0) / 100) * 100) /
      100;
    const dates = generateOccurrenceDates(renewalStart, newValidTo, schedule.dayOfWeek);
    const customerRef = schedule.customerId
      ? { customerId: schedule.customerId }
      : { customerContactId: schedule.customerContactId as string };

    const conflictingDates: string[] = [];
    let generatedCount = 0;
    for (const date of dates) {
      try {
        await this.bookingsService.createBookingRecord({
          courtId: schedule.courtId,
          date,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          ...customerRef,
          recurringScheduleId: schedule.id,
          totalPriceOverride: sessionPrice,
        });
        generatedCount += 1;
      } catch (error) {
        if (error instanceof ConflictException) {
          conflictingDates.push(date);
          continue;
        }
        throw error;
      }
    }

    schedule.validTo = newValidTo;
    await this.repository.save(schedule);

    return { generatedCount, conflictingDates };
  }
}
