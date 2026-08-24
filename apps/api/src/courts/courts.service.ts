import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Court } from './entities/court.entity';
import { VenuesService } from './venues.service';
import { CreateCourtDto } from './dto/create-court.dto';
import { UpdateCourtDto } from './dto/update-court.dto';
import { generateSlots, Slot } from './slot-generator';
import { timeToMinutes } from './time.util';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@Injectable()
export class CourtsService {
  constructor(
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    private readonly venuesService: VenuesService,
  ) {}

  async create(
    ownerId: string,
    venueId: string,
    dto: CreateCourtDto,
  ): Promise<Court> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    this.assertOpenBeforeClose(dto.openTime, dto.closeTime);
    const court = this.courtsRepository.create({
      venueId,
      name: dto.name,
      pricePerHour: dto.pricePerHour,
      openTime: dto.openTime,
      closeTime: dto.closeTime,
      slotDurationMinutes: dto.slotDurationMinutes,
      isActive: true,
    });
    return this.courtsRepository.save(court);
  }

  async findByVenueForOwner(
    ownerId: string,
    venueId: string,
  ): Promise<Court[]> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    return this.courtsRepository.find({ where: { venueId } });
  }

  async update(
    ownerId: string,
    venueId: string,
    courtId: string,
    dto: UpdateCourtDto,
  ): Promise<Court> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const court = await this.courtsRepository.findOne({
      where: { id: courtId, venueId },
    });
    if (!court) {
      throw new NotFoundException(`Court ${courtId} không tồn tại`);
    }
    const nextOpenTime = dto.openTime ?? court.openTime;
    const nextCloseTime = dto.closeTime ?? court.closeTime;
    this.assertOpenBeforeClose(nextOpenTime, nextCloseTime);

    if (dto.name !== undefined) court.name = dto.name;
    if (dto.pricePerHour !== undefined) court.pricePerHour = dto.pricePerHour;
    court.openTime = nextOpenTime;
    court.closeTime = nextCloseTime;
    if (dto.slotDurationMinutes !== undefined) {
      court.slotDurationMinutes = dto.slotDurationMinutes;
    }
    if (dto.isActive !== undefined) court.isActive = dto.isActive;

    return this.courtsRepository.save(court);
  }

  findActiveByVenue(venueId: string): Promise<Court[]> {
    return this.courtsRepository.find({
      where: { venueId, isActive: true },
    });
  }

  async getSlotsForDate(courtId: string, date: string): Promise<Slot[]> {
    if (!DATE_PATTERN.test(date)) {
      throw new BadRequestException('date phải theo định dạng YYYY-MM-DD');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (date < today) {
      throw new BadRequestException(
        'Không thể xem khung giờ của ngày trong quá khứ',
      );
    }

    const court = await this.courtsRepository.findOne({
      where: { id: courtId, isActive: true },
    });
    if (!court) {
      throw new NotFoundException(`Court ${courtId} không tồn tại`);
    }
    await this.venuesService.findPublicById(court.venueId);

    return generateSlots({
      openTime: court.openTime,
      closeTime: court.closeTime,
      slotDurationMinutes: court.slotDurationMinutes,
      pricePerHour: court.pricePerHour,
    });
  }

  private assertOpenBeforeClose(openTime: string, closeTime: string): void {
    if (timeToMinutes(openTime) >= timeToMinutes(closeTime)) {
      throw new BadRequestException('openTime phải trước closeTime');
    }
  }
}
