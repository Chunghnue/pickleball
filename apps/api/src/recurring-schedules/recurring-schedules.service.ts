import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecurringSchedule, RecurringScheduleStatus } from './entities/recurring-schedule.entity';
import { CreateRecurringScheduleDto } from './dto/create-recurring-schedule.dto';
import { generateOccurrenceDates } from './occurrence-dates.util';
import { CourtsService } from '../courts/courts.service';
import { VenuesService } from '../courts/venues.service';
import { CustomerContactsService } from '../customer-contacts/customer-contacts.service';
import { BookingsService } from '../bookings/bookings.service';

const MAX_SPAN_DAYS = 366;

@Injectable()
export class RecurringSchedulesService {
  constructor(
    @InjectRepository(RecurringSchedule)
    private readonly repository: Repository<RecurringSchedule>,
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

  async cancel(ownerId: string, venueId: string, id: string): Promise<RecurringSchedule> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const schedule = await this.repository.findOne({ where: { id } });
    if (!schedule) {
      throw new NotFoundException(`Lịch cố định ${id} không tồn tại`);
    }
    const court = await this.courtsService.findByIdOrThrow(schedule.courtId);
    if (court.venueId !== venueId) {
      throw new NotFoundException(`Lịch cố định ${id} không tồn tại`);
    }
    if (schedule.status === RecurringScheduleStatus.CANCELLED) {
      throw new BadRequestException('Lịch cố định đã bị huỷ');
    }

    schedule.status = RecurringScheduleStatus.CANCELLED;
    await this.repository.save(schedule);
    await this.bookingsService.cancelFutureOccurrences(id, ownerId);
    return schedule;
  }
}
