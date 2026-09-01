import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PricingRule } from './entities/pricing-rule.entity';
import { Court } from '../courts/entities/court.entity';
import { Venue } from '../courts/entities/venue.entity';

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
}
