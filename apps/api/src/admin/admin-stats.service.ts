import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { And, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { Venue, VenueStatus } from '../courts/entities/venue.entity';
import { Court } from '../courts/entities/court.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import {
  fillRevenueByDay,
  getCurrentMonthRange,
  getLast30Days,
  getTodayRange,
} from '../common/date-range.utils';

export interface AdminStats {
  owners: { total: number; active: number; pendingApproval: number };
  venues: { total: number; active: number; pendingApproval: number };
  courts: { total: number; active: number };
  todayBookingsCount: number;
  todayRevenue: number;
  newCustomersThisMonth: number;
  revenueByDay: { date: string; revenue: number }[];
}

@Injectable()
export class AdminStatsService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(Venue)
    private readonly venuesRepository: Repository<Venue>,
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
  ) {}

  async getStats(): Promise<AdminStats> {
    const now = new Date();
    const { start: todayStart, end: todayEnd } = getTodayRange(now);
    const { start: monthStart, end: monthEnd } = getCurrentMonthRange(now);
    const last30Days = getLast30Days(now);
    const rangeStart = new Date(todayStart);
    rangeStart.setDate(rangeStart.getDate() - 29);

    const [
      ownersTotal,
      ownersActive,
      ownersPending,
      venuesTotal,
      venuesActive,
      venuesPending,
      courtsTotal,
      courtsActive,
      todayBookingsCount,
      revenueRows,
      newCustomerRows,
    ] = await Promise.all([
      this.usersRepository.count({ where: { role: UserRole.OWNER } }),
      this.usersRepository.count({
        where: { role: UserRole.OWNER, status: UserStatus.ACTIVE },
      }),
      this.usersRepository.count({
        where: { role: UserRole.OWNER, status: UserStatus.PENDING_APPROVAL },
      }),
      this.venuesRepository.count(),
      this.venuesRepository.count({ where: { status: VenueStatus.ACTIVE } }),
      this.venuesRepository.count({
        where: { status: VenueStatus.PENDING_APPROVAL },
      }),
      this.courtsRepository.count(),
      this.courtsRepository.count({ where: { isActive: true } }),
      this.bookingsRepository.count({
        where: { createdAt: And(MoreThanOrEqual(todayStart), LessThan(todayEnd)) },
      }),
      this.paymentsRepository
        .createQueryBuilder('payment')
        .innerJoin(
          'bookings',
          'booking',
          'booking.id::text = payment.booking_id',
        )
        .select("TO_CHAR(payment.paid_at, 'YYYY-MM-DD')", 'date')
        .addSelect('SUM(booking.total_price)', 'revenue')
        .where('payment.status = :status', { status: PaymentStatus.PAID })
        .andWhere('payment.paid_at >= :from', { from: rangeStart })
        .andWhere('payment.paid_at < :to', { to: todayEnd })
        .groupBy("TO_CHAR(payment.paid_at, 'YYYY-MM-DD')")
        .getRawMany<{ date: string; revenue: string }>(),
      this.bookingsRepository
        .createQueryBuilder('booking')
        .select('booking.customer_id', 'customerId')
        .addSelect('MIN(booking.created_at)', 'firstBookingAt')
        .groupBy('booking.customer_id')
        .having('MIN(booking.created_at) >= :start', { start: monthStart })
        .andHaving('MIN(booking.created_at) < :end', { end: monthEnd })
        .getRawMany(),
    ]);

    const revenueByDay = fillRevenueByDay(revenueRows, last30Days);
    const todayRevenue = revenueByDay[revenueByDay.length - 1].revenue;

    return {
      owners: { total: ownersTotal, active: ownersActive, pendingApproval: ownersPending },
      venues: { total: venuesTotal, active: venuesActive, pendingApproval: venuesPending },
      courts: { total: courtsTotal, active: courtsActive },
      todayBookingsCount,
      todayRevenue,
      newCustomersThisMonth: newCustomerRows.length,
      revenueByDay,
    };
  }
}
