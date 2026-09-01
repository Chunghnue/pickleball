import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingRule } from './entities/pricing-rule.entity';
import { Court } from '../courts/entities/court.entity';
import { Venue } from '../courts/entities/venue.entity';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { timeToMinutes } from '../courts/time.util';

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(PricingRule)
    private readonly pricingRulesRepository: Repository<PricingRule>,
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    @InjectRepository(Venue)
    private readonly venuesRepository: Repository<Venue>,
  ) {}

  async resolvePrice(courtId: string, date: string, slotStart: string): Promise<number> {
    const dayOfWeek = this.getDayOfWeek(date);
    const rules = await this.pricingRulesRepository.find({ where: { courtId } });
    const matching = rules.filter(
      (rule) =>
        rule.daysOfWeek.includes(dayOfWeek) &&
        rule.startTime <= slotStart &&
        slotStart < rule.endTime &&
        (rule.validFrom === null || rule.validFrom <= date) &&
        (rule.validTo === null || rule.validTo >= date),
    );

    if (matching.length === 0) {
      const court = await this.courtsRepository.findOne({ where: { id: courtId } });
      if (!court) {
        throw new NotFoundException(`Court ${courtId} không tồn tại`);
      }
      return court.pricePerHour;
    }

    matching.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
    const selected = matching[0];

    if (selected.advanceBookingHours !== null) {
      const slotStartMs = new Date(`${date}T${slotStart}:00Z`).getTime();
      const hoursUntilSlot = (slotStartMs - Date.now()) / (60 * 60 * 1000);
      if (hoursUntilSlot >= selected.advanceBookingHours && selected.advancePrice !== null) {
        return selected.advancePrice;
      }
    }

    return selected.price;
  }

  private getDayOfWeek(date: string): number {
    const jsDay = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
    return (jsDay + 6) % 7; // 0=Mon..6=Sun, matches days_of_week convention
  }

  async create(
    ownerId: string,
    venueId: string,
    courtId: string,
    dto: CreatePricingRuleDto,
  ): Promise<PricingRule> {
    await this.getOwnedCourtOrThrow(ownerId, venueId, courtId);
    this.assertValid(dto.startTime, dto.endTime, dto.validFrom ?? null, dto.validTo ?? null);

    const created = this.pricingRulesRepository.create({
      courtId,
      name: dto.name,
      daysOfWeek: dto.daysOfWeek,
      startTime: dto.startTime,
      endTime: dto.endTime,
      price: dto.price,
      priority: dto.priority ?? 0,
      advanceBookingHours: dto.advanceBookingHours ?? null,
      advancePrice: dto.advancePrice ?? null,
      validFrom: dto.validFrom ?? null,
      validTo: dto.validTo ?? null,
    });
    return this.pricingRulesRepository.save(created);
  }

  async findByCourt(ownerId: string, venueId: string, courtId: string): Promise<PricingRule[]> {
    await this.getOwnedCourtOrThrow(ownerId, venueId, courtId);
    return this.pricingRulesRepository.find({
      where: { courtId },
      order: { priority: 'DESC', createdAt: 'DESC' },
    });
  }

  async update(
    ownerId: string,
    venueId: string,
    courtId: string,
    id: string,
    dto: UpdatePricingRuleDto,
  ): Promise<PricingRule> {
    await this.getOwnedCourtOrThrow(ownerId, venueId, courtId);
    const rule = await this.pricingRulesRepository.findOne({ where: { id, courtId } });
    if (!rule) {
      throw new NotFoundException(`Pricing rule ${id} không tồn tại`);
    }

    const nextStartTime = dto.startTime ?? rule.startTime;
    const nextEndTime = dto.endTime ?? rule.endTime;
    const nextValidFrom = dto.validFrom !== undefined ? dto.validFrom : rule.validFrom;
    const nextValidTo = dto.validTo !== undefined ? dto.validTo : rule.validTo;
    this.assertValid(nextStartTime, nextEndTime, nextValidFrom, nextValidTo);

    if (dto.name !== undefined) rule.name = dto.name;
    if (dto.daysOfWeek !== undefined) rule.daysOfWeek = dto.daysOfWeek;
    rule.startTime = nextStartTime;
    rule.endTime = nextEndTime;
    if (dto.price !== undefined) rule.price = dto.price;
    if (dto.priority !== undefined) rule.priority = dto.priority;
    if (dto.advanceBookingHours !== undefined) rule.advanceBookingHours = dto.advanceBookingHours;
    if (dto.advancePrice !== undefined) rule.advancePrice = dto.advancePrice;
    rule.validFrom = nextValidFrom;
    rule.validTo = nextValidTo;

    return this.pricingRulesRepository.save(rule);
  }

  async remove(ownerId: string, venueId: string, courtId: string, id: string): Promise<void> {
    await this.getOwnedCourtOrThrow(ownerId, venueId, courtId);
    const rule = await this.pricingRulesRepository.findOne({ where: { id, courtId } });
    if (!rule) {
      throw new NotFoundException(`Pricing rule ${id} không tồn tại`);
    }
    await this.pricingRulesRepository.remove(rule);
  }

  private async getOwnedCourtOrThrow(
    ownerId: string,
    venueId: string,
    courtId: string,
  ): Promise<Court> {
    const venue = await this.venuesRepository.findOne({ where: { id: venueId } });
    if (!venue) {
      throw new NotFoundException(`Venue ${venueId} không tồn tại`);
    }
    if (venue.ownerId !== ownerId) {
      throw new ForbiddenException('Bạn không có quyền truy cập venue này');
    }
    const court = await this.courtsRepository.findOne({ where: { id: courtId, venueId } });
    if (!court) {
      throw new NotFoundException(`Court ${courtId} không tồn tại`);
    }
    return court;
  }

  private assertValid(
    startTime: string,
    endTime: string,
    validFrom: string | null,
    validTo: string | null,
  ): void {
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      throw new BadRequestException('startTime phải trước endTime');
    }
    if (validFrom !== null && validTo !== null && validFrom > validTo) {
      throw new BadRequestException('validFrom phải trước hoặc bằng validTo');
    }
  }
}
