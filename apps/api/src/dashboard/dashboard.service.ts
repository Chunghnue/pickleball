import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { And, In, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { Court } from '../courts/entities/court.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { VenuesService } from '../courts/venues.service';
import {
  fillRevenueByDay,
  getCurrentMonthRange,
  getLast30Days,
  getTodayRange,
} from '../common/date-range.utils';

export interface DashboardSummary {
  todayBookingsCount: number;
  todayRevenue: number;
  courts: { active: number; total: number };
  newCustomersThisMonth: number;
  revenueByDay: { date: string; revenue: number }[];
  revenueByCourt: { courtId: string; courtName: string; revenue: number }[];
  recentBookings: {
    id: string;
    customerName: string;
    customerPhone: string | null;
    courtName: string;
    date: string;
    startTime: string;
    endTime: string;
    totalPrice: number;
    status: string;
  }[];
}

interface RecentBookingRow {
  id: string;
  courtId: string;
  customerName: string;
  customerPhone: string | null;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: string;
  status: string;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly venuesService: VenuesService,
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
  ) {}

  async getSummary(ownerId: string, venueId?: string): Promise<DashboardSummary> {
    const venueIds = venueId
      ? [(await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId)).id]
      : (await this.venuesService.findMineByOwner(ownerId)).map((v) => v.id);

    if (venueIds.length === 0) {
      return this.emptySummary();
    }

    const courts = await this.courtsRepository.find({
      where: { venueId: In(venueIds) },
    });
    const courtIds = courts.map((court) => court.id);

    if (courtIds.length === 0) {
      return this.emptySummary();
    }

    const now = new Date();
    const { start: todayStart, end: todayEnd } = getTodayRange(now);
    const { start: monthStart, end: monthEnd } = getCurrentMonthRange(now);
    const last30Days = getLast30Days(now);
    const rangeStart = new Date(todayStart);
    rangeStart.setDate(rangeStart.getDate() - 29);

    const [todayBookingsCount, revenueRows, newCustomerRows, revenueByCourtRows, recentBookingsRows] =
      await Promise.all([
        this.bookingsRepository.count({
          where: {
            courtId: In(courtIds),
            createdAt: And(MoreThanOrEqual(todayStart), LessThan(todayEnd)),
          },
        }),
        this.paymentsRepository
          .createQueryBuilder('payment')
          .innerJoin('bookings', 'booking', 'booking.id::text = payment.booking_id')
          .select("TO_CHAR(payment.paid_at, 'YYYY-MM-DD')", 'date')
          .addSelect('SUM(booking.total_price)', 'revenue')
          .where('booking.court_id IN (:...courtIds)', { courtIds })
          .andWhere('payment.status = :status', { status: PaymentStatus.PAID })
          .andWhere('payment.paid_at >= :from', { from: rangeStart })
          .andWhere('payment.paid_at < :to', { to: todayEnd })
          .groupBy("TO_CHAR(payment.paid_at, 'YYYY-MM-DD')")
          .getRawMany<{ date: string; revenue: string }>(),
        this.bookingsRepository
          .createQueryBuilder('booking')
          .select('booking.customer_id', 'customerId')
          .addSelect('MIN(booking.created_at)', 'firstBookingAt')
          .where('booking.court_id IN (:...courtIds)', { courtIds })
          .groupBy('booking.customer_id')
          .having('MIN(booking.created_at) >= :start', { start: monthStart })
          .andHaving('MIN(booking.created_at) < :end', { end: monthEnd })
          .getRawMany(),
        this.paymentsRepository
          .createQueryBuilder('payment')
          .innerJoin('bookings', 'booking', 'booking.id::text = payment.booking_id')
          .select('booking.court_id', 'courtId')
          .addSelect('SUM(booking.total_price)', 'revenue')
          .where('booking.court_id IN (:...courtIds)', { courtIds })
          .andWhere('payment.status = :status', { status: PaymentStatus.PAID })
          .groupBy('booking.court_id')
          .getRawMany<{ courtId: string; revenue: string }>(),
        this.bookingsRepository
          .createQueryBuilder('booking')
          .innerJoin('users', 'customer', 'customer.id::text = booking.customer_id')
          .select('booking.id', 'id')
          .addSelect('booking.court_id', 'courtId')
          .addSelect('customer.full_name', 'customerName')
          .addSelect('customer.phone', 'customerPhone')
          .addSelect("TO_CHAR(booking.date, 'YYYY-MM-DD')", 'date')
          .addSelect('booking.start_time', 'startTime')
          .addSelect('booking.end_time', 'endTime')
          .addSelect('booking.total_price', 'totalPrice')
          .addSelect('booking.status', 'status')
          .where('booking.court_id IN (:...courtIds)', { courtIds })
          .orderBy('booking.created_at', 'DESC')
          .limit(10)
          .getRawMany<RecentBookingRow>(),
      ]);

    const revenueByDay = fillRevenueByDay(revenueRows, last30Days);
    const todayRevenue = revenueByDay[revenueByDay.length - 1].revenue;

    const revenueByCourtMap = new Map(
      revenueByCourtRows.map((row) => [row.courtId, Number(row.revenue)]),
    );
    const revenueByCourt = courts
      .map((court) => ({
        courtId: court.id,
        courtName: court.name,
        revenue: revenueByCourtMap.get(court.id) ?? 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const courtNameById = new Map(courts.map((court) => [court.id, court.name]));
    const recentBookings = recentBookingsRows.map((row) => ({
      id: row.id,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      courtName: courtNameById.get(row.courtId) ?? '',
      date: row.date,
      startTime: row.startTime.slice(0, 5),
      endTime: row.endTime.slice(0, 5),
      totalPrice: Number(row.totalPrice),
      status: row.status,
    }));

    return {
      todayBookingsCount,
      todayRevenue,
      courts: {
        active: courts.filter((court) => court.isActive).length,
        total: courts.length,
      },
      newCustomersThisMonth: newCustomerRows.length,
      revenueByDay,
      revenueByCourt,
      recentBookings,
    };
  }

  private emptySummary(): DashboardSummary {
    return {
      todayBookingsCount: 0,
      todayRevenue: 0,
      courts: { active: 0, total: 0 },
      newCustomersThisMonth: 0,
      revenueByDay: getLast30Days().map((date) => ({ date, revenue: 0 })),
      revenueByCourt: [],
      recentBookings: [],
    };
  }
}
