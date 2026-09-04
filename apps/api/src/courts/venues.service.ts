import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  FindOptionsOrder,
  FindOptionsWhere,
  ILike,
  In,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { Venue, VenueStatus } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';
import { VenueSlugHistory } from './entities/venue-slug-history.entity';
import { VenueOperatingHours } from './entities/venue-operating-hours.entity';
import { Court, CourtStatus } from './entities/court.entity';
import { CourtImage } from './entities/court-image.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingSlot } from '../bookings/entities/booking-slot.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { PricingRule } from '../pricing/entities/pricing-rule.entity';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { AddVenueImageDto } from './dto/add-venue-image.dto';
import { OperatingHourItemDto } from './dto/operating-hour-item.dto';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { slugify } from './slug.util';
import { getCurrentMonthRange } from '../common/date-range.utils';
import { getUploadsDir } from './court-image-upload.config';
import { generateSlotTimes } from './slot-generator';
import { DATE_PATTERN, TIME_PATTERN } from './time.util';

export interface VenueWithCourtsCount extends Venue {
  courtsCount: number;
}

export interface SearchVenuesResult {
  items: VenueWithCourtsCount[];
  total: number;
  page: number;
  pageSize: number;
}

export interface VenueWithMetrics extends Venue {
  courtsCount: number;
  bookingsThisMonth: number;
  revenueThisMonth: number;
}

export interface OperatingHourView {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}

const DEFAULT_OPERATING_HOURS: OperatingHourView[] = [0, 1, 2, 3, 4, 5, 6].map(
  (dayOfWeek) => ({
    dayOfWeek,
    isOpen: true,
    openTime: '06:00',
    closeTime: '22:00',
  }),
);

// Postgres `time` columns round-trip through node-postgres/TypeORM as
// "HH:mm:ss" strings, not "HH:mm" — normalize before returning to callers.
function toHhMm(value: string | null): string | null {
  return value ? value.slice(0, 5) : null;
}

const SEARCH_DEFAULT_PAGE_SIZE = 20;
const SEARCH_MAX_PAGE_SIZE = 100;

function clampPage(raw?: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function clampPageSize(raw?: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return SEARCH_DEFAULT_PAGE_SIZE;
  return Math.min(SEARCH_MAX_PAGE_SIZE, Math.max(1, Math.floor(n)));
}

@Injectable()
export class VenuesService {
  constructor(
    @InjectRepository(Venue)
    private readonly venuesRepository: Repository<Venue>,
    @InjectRepository(VenueImage)
    private readonly venueImagesRepository: Repository<VenueImage>,
    @InjectRepository(VenueSlugHistory)
    private readonly slugHistoryRepository: Repository<VenueSlugHistory>,
    @InjectRepository(VenueOperatingHours)
    private readonly operatingHoursRepository: Repository<VenueOperatingHours>,
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(BookingSlot)
    private readonly bookingSlotsRepository: Repository<BookingSlot>,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(ownerId: string, dto: CreateVenueDto): Promise<Venue> {
    const existingCount = await this.venuesRepository.count({
      where: { ownerId },
    });
    const slug = await this.resolveSlugForCreate(dto.slug, dto.name);
    const venue = this.venuesRepository.create({
      ownerId,
      name: dto.name,
      address: dto.address,
      city: dto.city,
      district: dto.district ?? null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      description: dto.description ?? null,
      status: VenueStatus.PENDING_APPROVAL,
      isDefault: existingCount === 0,
      slug,
    });
    return this.venuesRepository.save(venue);
  }

  private async resolveSlugForCreate(
    requested: string | undefined,
    name: string,
  ): Promise<string> {
    const trimmed = requested?.trim();
    if (trimmed) {
      const taken = await this.venuesRepository.findOne({
        where: { slug: trimmed },
      });
      if (taken) {
        throw new ConflictException('Đường dẫn này đã được sử dụng');
      }
      return trimmed;
    }
    return this.generateUniqueSlug(name);
  }

  private async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    let candidate = base;
    for (let attempt = 0; attempt < 20; attempt++) {
      const taken = await this.venuesRepository.findOne({
        where: { slug: candidate },
      });
      if (!taken) {
        return candidate;
      }
      const suffix = Math.floor(1000 + Math.random() * 9000);
      candidate = `${base}-${suffix}`;
    }
    throw new ConflictException(
      'Không thể tạo đường dẫn duy nhất, vui lòng thử lại',
    );
  }

  findMineByOwner(ownerId: string): Promise<Venue[]> {
    return this.venuesRepository.find({ where: { ownerId } });
  }

  findMineById(ownerId: string, id: string): Promise<Venue> {
    return this.getOwnedVenueOrThrow(ownerId, id);
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateVenueDto,
  ): Promise<Venue> {
    const venue = await this.getOwnedVenueOrThrow(ownerId, id);
    if (dto.name !== undefined) venue.name = dto.name;
    if (dto.address !== undefined) venue.address = dto.address;
    if (dto.city !== undefined) venue.city = dto.city;
    if (dto.description !== undefined) venue.description = dto.description;
    if (dto.cancellationCutoffHours !== undefined) {
      venue.cancellationCutoffHours = dto.cancellationCutoffHours;
    }
    if (dto.phone !== undefined) venue.phone = dto.phone;
    if (dto.district !== undefined) venue.district = dto.district;
    if (dto.latitude !== undefined) venue.latitude = dto.latitude;
    if (dto.longitude !== undefined) venue.longitude = dto.longitude;
    if (dto.email !== undefined) venue.email = dto.email;
    if (dto.isHidden !== undefined) venue.isHidden = dto.isHidden;
    if (dto.website !== undefined) venue.website = dto.website;
    if (dto.slug !== undefined && dto.slug !== venue.slug) {
      await this.changeSlug(venue, dto.slug);
    }
    return this.venuesRepository.save(venue);
  }

  private async changeSlug(venue: Venue, nextSlug: string): Promise<void> {
    const taken = await this.venuesRepository.findOne({
      where: { slug: nextSlug },
    });
    if (taken && taken.id !== venue.id) {
      throw new ConflictException('Đường dẫn này đã được sử dụng');
    }

    const cutoff180 = new Date();
    cutoff180.setDate(cutoff180.getDate() - 180);
    const recentChangeCount = await this.slugHistoryRepository.count({
      where: { venueId: venue.id, changedAt: MoreThanOrEqual(cutoff180) },
    });
    if (recentChangeCount >= 3) {
      throw new BadRequestException(
        'Đã đạt giới hạn đổi đường dẫn (3 lần/180 ngày)',
      );
    }

    const lastChange = await this.slugHistoryRepository.findOne({
      where: { venueId: venue.id },
      order: { changedAt: 'DESC' },
    });
    if (lastChange) {
      const cutoff60 = new Date();
      cutoff60.setDate(cutoff60.getDate() - 60);
      if (lastChange.changedAt > cutoff60) {
        throw new BadRequestException('Cần đợi đủ 60 ngày kể từ lần đổi trước');
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.insert(VenueSlugHistory, {
        venueId: venue.id,
        oldSlug: venue.slug,
      });
    });
    venue.slug = nextSlug;
  }

  async setDefault(ownerId: string, id: string): Promise<Venue> {
    await this.getOwnedVenueOrThrow(ownerId, id);
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Venue, { ownerId }, { isDefault: false });
      await manager.update(Venue, { id }, { isDefault: true });
    });
    return this.getOwnedVenueOrThrow(ownerId, id);
  }

  async remove(ownerId: string, id: string): Promise<void> {
    const venue = await this.getOwnedVenueOrThrow(ownerId, id);
    const courts = await this.courtsRepository.find({ where: { venueId: id } });
    const courtIds = courts.map((court) => court.id);

    if (courtIds.length > 0) {
      const bookingCount = await this.bookingsRepository.count({
        where: { courtId: In(courtIds) },
      });
      if (bookingCount > 0) {
        throw new ConflictException(
          'Chi nhánh đã có lịch sử đặt sân, không thể xoá. Hãy dùng tính năng "Ẩn" thay thế.',
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      if (courtIds.length > 0) {
        await manager.delete(PricingRule, { courtId: In(courtIds) });
        await manager.delete(CourtImage, { courtId: In(courtIds) });
        await manager.delete(Court, { id: In(courtIds) });
      }
      await manager.delete(VenueImage, { venueId: id });
      await manager.delete(VenueSlugHistory, { venueId: id });
      await manager.delete(Venue, { id });
    });

    if (venue.isDefault) {
      const remaining = await this.venuesRepository.find({
        where: { ownerId },
        order: { createdAt: 'ASC' },
      });
      if (remaining.length > 0) {
        remaining[0].isDefault = true;
        await this.venuesRepository.save(remaining[0]);
      }
    }
  }

  async uploadLogo(
    ownerId: string,
    venueId: string,
    file: Express.Multer.File,
  ): Promise<Venue> {
    const venue = await this.getOwnedVenueOrThrow(ownerId, venueId);
    const oldLogoUrl = venue.logoUrl;
    venue.logoUrl = `/uploads/venues/${venueId}/${file.filename}`;
    const saved = await this.venuesRepository.save(venue);
    if (oldLogoUrl) {
      const oldPath = join(
        getUploadsDir(),
        oldLogoUrl.replace('/uploads/', ''),
      );
      await unlink(oldPath).catch(() => undefined);
    }
    return saved;
  }

  async addImage(
    ownerId: string,
    venueId: string,
    dto: AddVenueImageDto,
  ): Promise<VenueImage> {
    await this.getOwnedVenueOrThrow(ownerId, venueId);
    const image = this.venueImagesRepository.create({
      venueId,
      url: dto.url,
    });
    return this.venueImagesRepository.save(image);
  }

  async removeImage(
    ownerId: string,
    venueId: string,
    imageId: string,
  ): Promise<void> {
    await this.getOwnedVenueOrThrow(ownerId, venueId);
    const image = await this.venueImagesRepository.findOne({
      where: { id: imageId, venueId },
    });
    if (!image) {
      throw new NotFoundException(`Ảnh ${imageId} không tồn tại`);
    }
    await this.venueImagesRepository.remove(image);
  }

  findImagesByVenue(venueId: string): Promise<VenueImage[]> {
    return this.venueImagesRepository.find({ where: { venueId } });
  }

  async getOwnedVenueOrThrow(ownerId: string, venueId: string): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({
      where: { id: venueId },
    });
    if (!venue) {
      throw new NotFoundException(`Venue ${venueId} không tồn tại`);
    }
    if (venue.ownerId !== ownerId) {
      throw new ForbiddenException('Bạn không có quyền truy cập venue này');
    }
    return venue;
  }

  async findByIdOrThrow(id: string): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({ where: { id } });
    if (!venue) {
      throw new NotFoundException(`Venue ${id} không tồn tại`);
    }
    return venue;
  }

  findPendingVenues(): Promise<Venue[]> {
    return this.venuesRepository.find({
      where: { status: VenueStatus.PENDING_APPROVAL },
    });
  }

  approveVenue(id: string): Promise<Venue> {
    return this.transitionStatus(id, VenueStatus.ACTIVE);
  }

  rejectVenue(id: string, reason?: string): Promise<Venue> {
    return this.transitionStatus(id, VenueStatus.REJECTED, reason);
  }

  private async transitionStatus(
    id: string,
    nextStatus: VenueStatus,
    reason?: string,
  ): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({ where: { id } });
    if (!venue) {
      throw new NotFoundException(`Venue ${id} không tồn tại`);
    }
    if (venue.status !== VenueStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Chỉ có thể duyệt/từ chối venue đang chờ duyệt',
      );
    }
    venue.status = nextStatus;
    const saved = await this.venuesRepository.save(venue);
    const owner = await this.usersService.findById(saved.ownerId);
    // venue owners always register with email (RegisterDto requires it) —
    // only staff accounts (never venue owners) can have a null email.
    if (owner) {
      if (nextStatus === VenueStatus.ACTIVE) {
        await this.notificationsService.notifyVenueApproved({
          to: owner.email!,
          ownerName: owner.fullName,
          venueName: saved.name,
        });
      } else {
        await this.notificationsService.notifyVenueRejected({
          to: owner.email!,
          ownerName: owner.fullName,
          venueName: saved.name,
          reason,
        });
      }
    }
    return saved;
  }

  async searchPublic(
    query?: string,
    date?: string,
    time?: string,
    city?: string,
    sort?: string,
    pageRaw?: string,
    pageSizeRaw?: string,
  ): Promise<SearchVenuesResult> {
    if ((date && !time) || (time && !date)) {
      throw new BadRequestException(
        'date và time phải được truyền cùng nhau',
      );
    }
    if (date && !DATE_PATTERN.test(date)) {
      throw new BadRequestException('date phải theo định dạng YYYY-MM-DD');
    }
    if (date) {
      const today = new Date().toISOString().slice(0, 10);
      if (date < today) {
        throw new BadRequestException(
          'Không thể tìm sân của ngày trong quá khứ',
        );
      }
    }
    if (time && !TIME_PATTERN.test(time)) {
      throw new BadRequestException('time phải theo định dạng HH:mm');
    }
    if (sort && sort !== 'name' && sort !== 'courts' && sort !== 'city') {
      throw new BadRequestException(
        "sort phải là 'name', 'courts' hoặc 'city'",
      );
    }

    const page = clampPage(pageRaw);
    const pageSize = clampPageSize(pageSizeRaw);

    let availableVenueIds: string[] | undefined;
    if (date && time) {
      const candidates = await this.venuesRepository.find({
        where: this.buildSearchWhere(query, city),
        select: { id: true },
      });
      if (candidates.length === 0) {
        return { items: [], total: 0, page, pageSize };
      }
      const candidateIds = candidates.map((venue) => venue.id);
      const courts = await this.courtsRepository.find({
        where: { venueId: In(candidateIds), status: CourtStatus.ACTIVE },
      });
      availableVenueIds = [
        ...(await this.findVenueIdsWithAvailability(courts, date, time)),
      ];
      if (availableVenueIds.length === 0) {
        return { items: [], total: 0, page, pageSize };
      }
    }

    if (sort === 'courts') {
      return this.searchPublicSortedByCourts(
        query,
        city,
        availableVenueIds,
        page,
        pageSize,
      );
    }

    const where = this.buildSearchWhere(query, city, availableVenueIds);
    const total = await this.venuesRepository.count({ where });
    if (total === 0) {
      return { items: [], total: 0, page, pageSize };
    }
    const order: FindOptionsOrder<Venue> =
      sort === 'name'
        ? { name: 'ASC' }
        : sort === 'city'
          ? { city: 'ASC', name: 'ASC' }
          : { createdAt: 'DESC' };
    const venues = await this.venuesRepository.find({
      where,
      order,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const items = await this.attachCourtsCount(venues);
    return { items, total, page, pageSize };
  }

  private buildSearchWhere(
    query?: string,
    city?: string,
    venueIds?: string[],
  ): FindOptionsWhere<Venue> | FindOptionsWhere<Venue>[] {
    const common: FindOptionsWhere<Venue> = {
      status: VenueStatus.ACTIVE,
      isHidden: false,
    };
    if (city) common.city = city;
    if (venueIds) common.id = In(venueIds);

    if (!query) return common;

    const branches: FindOptionsWhere<Venue>[] = [
      { ...common, name: ILike(`%${query}%`) },
      { ...common, address: ILike(`%${query}%`) },
    ];
    if (!city) {
      branches.push({ ...common, city: ILike(`%${query}%`) });
    }
    return branches;
  }

  private async attachCourtsCount(
    venues: Venue[],
  ): Promise<VenueWithCourtsCount[]> {
    if (venues.length === 0) return [];
    const courts = await this.courtsRepository.find({
      where: {
        venueId: In(venues.map((venue) => venue.id)),
        status: CourtStatus.ACTIVE,
      },
    });
    const courtsCountByVenue = new Map<string, number>();
    for (const court of courts) {
      courtsCountByVenue.set(
        court.venueId,
        (courtsCountByVenue.get(court.venueId) ?? 0) + 1,
      );
    }
    return venues.map((venue) => ({
      ...venue,
      courtsCount: courtsCountByVenue.get(venue.id) ?? 0,
    }));
  }

  private async searchPublicSortedByCourts(
    query: string | undefined,
    city: string | undefined,
    availableVenueIds: string[] | undefined,
    page: number,
    pageSize: number,
  ): Promise<SearchVenuesResult> {
    const candidates = await this.venuesRepository.find({
      where: this.buildSearchWhere(query, city, availableVenueIds),
      select: { id: true, name: true },
    });
    const total = candidates.length;
    if (total === 0) {
      return { items: [], total: 0, page, pageSize };
    }

    const candidateIds = candidates.map((venue) => venue.id);
    const countRows = await this.courtsRepository
      .createQueryBuilder('court')
      .select('court.venue_id', 'venueId')
      .addSelect('COUNT(*)', 'count')
      .where('court.status = :status', { status: CourtStatus.ACTIVE })
      .andWhere('court.venue_id IN (:...ids)', { ids: candidateIds })
      .groupBy('court.venue_id')
      .getRawMany<{ venueId: string; count: string }>();
    const countByVenue = new Map(
      countRows.map((row) => [row.venueId, Number(row.count)]),
    );

    const sorted = [...candidates].sort((a, b) => {
      const diff =
        (countByVenue.get(b.id) ?? 0) - (countByVenue.get(a.id) ?? 0);
      return diff !== 0 ? diff : a.name.localeCompare(b.name);
    });
    const pageIds = sorted
      .slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
      .map((venue) => venue.id);
    if (pageIds.length === 0) {
      return { items: [], total, page, pageSize };
    }

    const pageVenues = await this.venuesRepository.find({
      where: { id: In(pageIds) },
    });
    const venueById = new Map(pageVenues.map((venue) => [venue.id, venue]));
    const items = pageIds.map((id) => ({
      ...venueById.get(id)!,
      courtsCount: countByVenue.get(id) ?? 0,
    }));
    return { items, total, page, pageSize };
  }

  private async findVenueIdsWithAvailability(
    courts: Court[],
    date: string,
    time: string,
  ): Promise<Set<string>> {
    const candidateCourtIds = courts
      .filter((court) =>
        generateSlotTimes({
          openTime: court.openTime,
          closeTime: court.closeTime,
          slotDurationMinutes: court.slotDurationMinutes,
        }).some((slot) => slot.start === time),
      )
      .map((court) => court.id);
    if (candidateCourtIds.length === 0) {
      return new Set();
    }

    const bookedSlots = await this.bookingSlotsRepository.find({
      where: { courtId: In(candidateCourtIds), date, slotStart: time },
    });
    const bookedCourtIds = new Set(bookedSlots.map((slot) => slot.courtId));

    const availableVenueIds = new Set<string>();
    for (const court of courts) {
      if (
        candidateCourtIds.includes(court.id) &&
        !bookedCourtIds.has(court.id)
      ) {
        availableVenueIds.add(court.venueId);
      }
    }
    return availableVenueIds;
  }

  async listActiveCities(): Promise<{ city: string; count: number }[]> {
    const rows = await this.venuesRepository
      .createQueryBuilder('venue')
      .select('venue.city', 'city')
      .addSelect('COUNT(*)', 'count')
      .where('venue.status = :status', { status: VenueStatus.ACTIVE })
      .andWhere('venue.is_hidden = false')
      .groupBy('venue.city')
      .orderBy('venue.city', 'ASC')
      .getRawMany<{ city: string; count: string }>();
    return rows.map((row) => ({ city: row.city, count: Number(row.count) }));
  }

  async findPublicById(id: string): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({
      where: { id, status: VenueStatus.ACTIVE, isHidden: false },
    });
    if (!venue) {
      throw new NotFoundException(`Venue ${id} không tồn tại`);
    }
    return venue;
  }

  async findPublicBySlug(slug: string): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({
      where: { slug, status: VenueStatus.ACTIVE, isHidden: false },
    });
    if (!venue) {
      throw new NotFoundException(`Venue với slug ${slug} không tồn tại`);
    }
    return venue;
  }

  async findMineWithMetrics(
    ownerId: string,
    opts: {
      status?: 'active' | 'hidden' | 'all';
      search?: string;
      sort?: 'default' | 'name' | 'newest';
    } = {},
  ): Promise<VenueWithMetrics[]> {
    const qb = this.venuesRepository
      .createQueryBuilder('venue')
      .where('venue.owner_id = :ownerId', { ownerId });
    if (opts.status === 'active') {
      qb.andWhere('venue.is_hidden = false');
    } else if (opts.status === 'hidden') {
      qb.andWhere('venue.is_hidden = true');
    }
    if (opts.search) {
      qb.andWhere(
        '(venue.name ILIKE :search OR venue.address ILIKE :search OR venue.city ILIKE :search)',
        { search: `%${opts.search}%` },
      );
    }
    const venues = await qb.getMany();
    if (venues.length === 0) {
      return [];
    }

    const courts = await this.courtsRepository.find({
      where: { venueId: In(venues.map((venue) => venue.id)) },
    });
    const courtIds = courts.map((court) => court.id);
    const venueIdByCourtId = new Map(
      courts.map((court) => [court.id, court.venueId]),
    );
    const courtsCountByVenue = new Map<string, number>();
    for (const court of courts) {
      courtsCountByVenue.set(
        court.venueId,
        (courtsCountByVenue.get(court.venueId) ?? 0) + 1,
      );
    }

    const bookingsByVenue = new Map<string, number>();
    const revenueByVenue = new Map<string, number>();
    if (courtIds.length > 0) {
      const { start: monthStart, end: monthEnd } = getCurrentMonthRange();

      const bookingRows = await this.bookingsRepository
        .createQueryBuilder('booking')
        .select('booking.court_id', 'courtId')
        .addSelect('COUNT(*)', 'count')
        .where('booking.court_id IN (:...courtIds)', { courtIds })
        .andWhere('booking.created_at >= :monthStart', { monthStart })
        .andWhere('booking.created_at < :monthEnd', { monthEnd })
        .groupBy('booking.court_id')
        .getRawMany<{ courtId: string; count: string }>();
      for (const row of bookingRows) {
        const venueId = venueIdByCourtId.get(row.courtId);
        if (!venueId) continue;
        bookingsByVenue.set(
          venueId,
          (bookingsByVenue.get(venueId) ?? 0) + Number(row.count),
        );
      }

      const revenueRows = await this.paymentsRepository
        .createQueryBuilder('payment')
        .innerJoin(
          'bookings',
          'booking',
          'booking.id::text = payment.booking_id',
        )
        .select('booking.court_id', 'courtId')
        .addSelect('SUM(booking.total_price)', 'revenue')
        .where('booking.court_id IN (:...courtIds)', { courtIds })
        .andWhere('payment.status = :status', { status: PaymentStatus.PAID })
        .andWhere('payment.paid_at >= :monthStart', { monthStart })
        .andWhere('payment.paid_at < :monthEnd', { monthEnd })
        .groupBy('booking.court_id')
        .getRawMany<{ courtId: string; revenue: string }>();
      for (const row of revenueRows) {
        const venueId = venueIdByCourtId.get(row.courtId);
        if (!venueId) continue;
        revenueByVenue.set(
          venueId,
          (revenueByVenue.get(venueId) ?? 0) + Number(row.revenue),
        );
      }
    }

    const enriched: VenueWithMetrics[] = venues.map((venue) => ({
      ...venue,
      courtsCount: courtsCountByVenue.get(venue.id) ?? 0,
      bookingsThisMonth: bookingsByVenue.get(venue.id) ?? 0,
      revenueThisMonth: revenueByVenue.get(venue.id) ?? 0,
    }));

    return this.sortVenues(enriched, opts.sort ?? 'default');
  }

  private sortVenues<
    T extends { isDefault: boolean; name: string; createdAt: Date },
  >(venues: T[], sort: 'default' | 'name' | 'newest'): T[] {
    const copy = [...venues];
    if (sort === 'name') {
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    }
    if (sort === 'newest') {
      return copy.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    return copy.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  }

  async getOperatingHours(
    ownerId: string,
    venueId: string,
  ): Promise<OperatingHourView[]> {
    await this.getOwnedVenueOrThrow(ownerId, venueId);
    const rows = await this.operatingHoursRepository.find({
      where: { venueId },
      order: { dayOfWeek: 'ASC' },
    });
    if (rows.length === 0) {
      return DEFAULT_OPERATING_HOURS;
    }
    return rows.map((row) => ({
      dayOfWeek: row.dayOfWeek,
      isOpen: row.isOpen,
      openTime: toHhMm(row.openTime),
      closeTime: toHhMm(row.closeTime),
    }));
  }

  async setOperatingHours(
    ownerId: string,
    venueId: string,
    items: OperatingHourItemDto[],
  ): Promise<OperatingHourView[]> {
    await this.getOwnedVenueOrThrow(ownerId, venueId);
    if (items.length !== 7) {
      throw new BadRequestException('Phải gửi đúng 7 ngày trong tuần');
    }
    const seenDays = new Set(items.map((item) => item.dayOfWeek));
    if (seenDays.size !== 7) {
      throw new BadRequestException('dayOfWeek phải phủ đủ 0-6, không trùng');
    }
    for (const item of items) {
      if (item.isOpen) {
        if (!item.openTime || !item.closeTime) {
          throw new BadRequestException(
            `Ngày ${item.dayOfWeek} đang mở cửa phải có giờ mở và giờ đóng`,
          );
        }
        if (item.openTime >= item.closeTime) {
          throw new BadRequestException(
            `Ngày ${item.dayOfWeek} giờ mở phải trước giờ đóng`,
          );
        }
      } else if (item.openTime || item.closeTime) {
        throw new BadRequestException(
          `Ngày ${item.dayOfWeek} đang đóng cửa không được có giờ mở/đóng`,
        );
      }
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(VenueOperatingHours, { venueId });
      const rows = items.map((item) =>
        manager.create(VenueOperatingHours, {
          venueId,
          dayOfWeek: item.dayOfWeek,
          isOpen: item.isOpen,
          openTime: item.isOpen ? item.openTime! : null,
          closeTime: item.isOpen ? item.closeTime! : null,
        }),
      );
      await manager.save(rows);
    });

    return this.getOperatingHours(ownerId, venueId);
  }
}
