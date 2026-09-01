import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { unlink } from 'fs/promises';
import { basename, join } from 'path';
import { Court, CourtStatus } from './entities/court.entity';
import { CourtImage } from './entities/court-image.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { VenuesService } from './venues.service';
import { CreateCourtDto } from './dto/create-court.dto';
import { UpdateCourtDto } from './dto/update-court.dto';
import { generateSlotTimes, Slot } from './slot-generator';
import { timeToMinutes } from './time.util';
import { getUploadsDir } from './court-image-upload.config';
import { PricingService } from '../pricing/pricing.service';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface CourtWithImages extends Court {
  images: CourtImage[];
}

export interface CourtWithVenueName extends CourtWithImages {
  venueName: string;
}

@Injectable()
export class CourtsService {
  constructor(
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    @InjectRepository(CourtImage)
    private readonly courtImagesRepository: Repository<CourtImage>,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    private readonly venuesService: VenuesService,
    private readonly pricingService: PricingService,
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
      description: dto.description ?? null,
      capacity: dto.capacity ?? null,
      displayOrder: dto.displayOrder ?? 0,
      status: CourtStatus.ACTIVE,
    });
    return this.courtsRepository.save(court);
  }

  async findByVenueForOwner(
    ownerId: string,
    venueId: string,
  ): Promise<CourtWithImages[]> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const courts = await this.courtsRepository.find({ where: { venueId } });
    return this.attachImages(courts);
  }

  async findAllForOwner(ownerId: string): Promise<CourtWithVenueName[]> {
    const venues = await this.venuesService.findMineByOwner(ownerId);
    if (venues.length === 0) {
      return [];
    }
    const venueNameById = new Map(venues.map((venue) => [venue.id, venue.name]));
    const courts = await this.courtsRepository.find({
      where: { venueId: In(venues.map((venue) => venue.id)) },
    });
    const withImages = await this.attachImages(courts);
    return withImages.map((court) => ({
      ...court,
      venueName: venueNameById.get(court.venueId) ?? '',
    }));
  }

  private async attachImages(courts: Court[]): Promise<CourtWithImages[]> {
    if (courts.length === 0) {
      return [];
    }
    const images = await this.courtImagesRepository.find({
      where: { courtId: In(courts.map((court) => court.id)) },
    });
    const imagesByCourtId = new Map<string, CourtImage[]>();
    for (const image of images) {
      const list = imagesByCourtId.get(image.courtId) ?? [];
      list.push(image);
      imagesByCourtId.set(image.courtId, list);
    }
    return courts.map((court) => ({
      ...court,
      images: imagesByCourtId.get(court.id) ?? [],
    }));
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
    if (dto.description !== undefined) court.description = dto.description;
    if (dto.capacity !== undefined) court.capacity = dto.capacity;
    if (dto.displayOrder !== undefined) court.displayOrder = dto.displayOrder;
    if (dto.status !== undefined) court.status = dto.status;

    return this.courtsRepository.save(court);
  }

  async remove(ownerId: string, venueId: string, courtId: string): Promise<void> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const court = await this.courtsRepository.findOne({
      where: { id: courtId, venueId },
    });
    if (!court) {
      throw new NotFoundException(`Court ${courtId} không tồn tại`);
    }
    const bookingCount = await this.bookingsRepository.count({
      where: { courtId },
    });
    if (bookingCount > 0) {
      throw new ConflictException(
        'Sân đã có lịch sử đặt sân, hãy chuyển sang trạng thái Tạm đóng thay vì xóa',
      );
    }
    await this.courtImagesRepository.delete({ courtId });
    await this.courtsRepository.remove(court);
  }

  async addImage(
    ownerId: string,
    venueId: string,
    courtId: string,
    file: Express.Multer.File,
  ): Promise<CourtImage> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const court = await this.courtsRepository.findOne({
      where: { id: courtId, venueId },
    });
    if (!court) {
      throw new NotFoundException(`Court ${courtId} không tồn tại`);
    }
    const image = this.courtImagesRepository.create({
      courtId,
      url: `/uploads/courts/${courtId}/${file.filename}`,
    });
    return this.courtImagesRepository.save(image);
  }

  async removeImage(
    ownerId: string,
    venueId: string,
    courtId: string,
    imageId: string,
  ): Promise<void> {
    await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
    const image = await this.courtImagesRepository.findOne({
      where: { id: imageId, courtId },
    });
    if (!image) {
      throw new NotFoundException(`Ảnh ${imageId} không tồn tại`);
    }
    const filePath = join(getUploadsDir(), 'courts', courtId, basename(image.url));
    await unlink(filePath).catch(() => undefined);
    await this.courtImagesRepository.remove(image);
  }

  findActiveByVenue(venueId: string): Promise<Court[]> {
    return this.courtsRepository.find({
      where: { venueId, status: CourtStatus.ACTIVE },
    });
  }

  async findByIdOrThrow(id: string): Promise<Court> {
    const court = await this.courtsRepository.findOne({ where: { id } });
    if (!court) {
      throw new NotFoundException(`Court ${id} không tồn tại`);
    }
    return court;
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
      where: { id: courtId, status: CourtStatus.ACTIVE },
    });
    if (!court) {
      throw new NotFoundException(`Court ${courtId} không tồn tại`);
    }
    await this.venuesService.findPublicById(court.venueId);

    const slotTimes = generateSlotTimes({
      openTime: court.openTime,
      closeTime: court.closeTime,
      slotDurationMinutes: court.slotDurationMinutes,
    });

    const slots: Slot[] = [];
    for (const slotTime of slotTimes) {
      const resolvedPrice = await this.pricingService.resolvePrice(courtId, date, slotTime.start);
      const price = Math.round(resolvedPrice * (court.slotDurationMinutes / 60) * 100) / 100;
      slots.push({ ...slotTime, price });
    }
    return slots;
  }

  private assertOpenBeforeClose(openTime: string, closeTime: string): void {
    if (timeToMinutes(openTime) >= timeToMinutes(closeTime)) {
      throw new BadRequestException('openTime phải trước closeTime');
    }
  }
}
