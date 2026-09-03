import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Court } from '../courts/entities/court.entity';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { VenuesService } from '../courts/venues.service';
import {
  fillRevenueByDay,
  getDaysBetween,
  parseDateRangeBoundaries,
} from '../common/date-range.utils';
import {
  buildTransactionCode,
  computeAvgPerTransaction,
  computeChangePercent,
  getPreviousPeriodRange,
  toRevenueCsv,
} from './revenue-report.utils';
import { GetRevenueReportDto } from './dto/get-revenue-report.dto';

export interface RevenueReportTransaction {
  id: string;
  transactionCode: string;
  customerName: string;
  customerPhone: string;
  paidAt: string;
  amount: number;
  status: 'paid';
}

export interface RevenueReport {
  currentPeriod: { revenue: number; transactionCount: number; avgPerTransaction: number };
  previousPeriod: { revenue: number };
  changeAmount: number;
  changePercent: number | null;
  revenueByDay: { date: string; revenue: number }[];
  transactions: RevenueReportTransaction[];
}

interface PeriodAggregateRow {
  revenue: string | null;
  count: string;
}

interface TransactionRow {
  id: string;
  paidAt: Date;
  amount: string;
  customerName: string;
  customerPhone: string;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly venuesService: VenuesService,
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    @InjectRepository(Payment)
    private readonly paymentsRepository: Repository<Payment>,
  ) {}

  async getRevenueReport(ownerId: string, dto: GetRevenueReportDto): Promise<RevenueReport> {
    this.assertValidRange(dto);
    const courtIds = await this.resolveCourtIds(ownerId, dto.venueId);
    const days = getDaysBetween(dto.from, dto.to);

    if (courtIds.length === 0) {
      return this.emptyReport(days);
    }

    const { start, end } = parseDateRangeBoundaries(dto.from, dto.to);
    const previousPeriod = getPreviousPeriodRange(dto.from, dto.to);
    const { start: prevStart, end: prevEnd } = parseDateRangeBoundaries(
      previousPeriod.from,
      previousPeriod.to,
    );

    const [currentAggregate, previousAggregate, revenueByDayRows, transactionRows] =
      await Promise.all([
        this.aggregatePeriod(courtIds, start, end),
        this.aggregatePeriod(courtIds, prevStart, prevEnd),
        this.paymentsRepository
          .createQueryBuilder('payment')
          .innerJoin('bookings', 'booking', 'booking.id::text = payment.booking_id')
          .select("TO_CHAR(payment.paid_at, 'YYYY-MM-DD')", 'date')
          .addSelect('SUM(booking.total_price)', 'revenue')
          .where('booking.court_id IN (:...courtIds)', { courtIds })
          .andWhere('payment.status = :status', { status: PaymentStatus.PAID })
          .andWhere('payment.paid_at >= :start', { start })
          .andWhere('payment.paid_at < :end', { end })
          .groupBy("TO_CHAR(payment.paid_at, 'YYYY-MM-DD')")
          .getRawMany<{ date: string; revenue: string }>(),
        this.fetchTransactions(courtIds, start, end),
      ]);

    const currentRevenue = Number(currentAggregate.revenue ?? 0);
    const currentCount = Number(currentAggregate.count);
    const previousRevenue = Number(previousAggregate.revenue ?? 0);

    const transactions: RevenueReportTransaction[] = transactionRows.map((row) => ({
      id: row.id,
      transactionCode: buildTransactionCode(row.id),
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      paidAt: row.paidAt.toISOString(),
      amount: Number(row.amount),
      status: 'paid',
    }));

    return {
      currentPeriod: {
        revenue: currentRevenue,
        transactionCount: currentCount,
        avgPerTransaction: computeAvgPerTransaction(currentRevenue, currentCount),
      },
      previousPeriod: { revenue: previousRevenue },
      changeAmount: currentRevenue - previousRevenue,
      changePercent: computeChangePercent(currentRevenue, previousRevenue),
      revenueByDay: fillRevenueByDay(revenueByDayRows, days),
      transactions,
    };
  }

  async getRevenueReportCsv(ownerId: string, dto: GetRevenueReportDto): Promise<string> {
    this.assertValidRange(dto);
    const courtIds = await this.resolveCourtIds(ownerId, dto.venueId);
    if (courtIds.length === 0) {
      return toRevenueCsv([]);
    }
    const { start, end } = parseDateRangeBoundaries(dto.from, dto.to);
    const rows = await this.fetchTransactions(courtIds, start, end);
    return toRevenueCsv(
      rows.map((row) => ({
        transactionCode: buildTransactionCode(row.id),
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        paidAt: row.paidAt,
        amount: Number(row.amount),
      })),
    );
  }

  private assertValidRange(dto: GetRevenueReportDto): void {
    if (dto.from > dto.to) {
      throw new BadRequestException('from phải trước hoặc bằng to');
    }
  }

  private async resolveCourtIds(ownerId: string, venueId?: string): Promise<string[]> {
    const venueIds = venueId
      ? [(await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId)).id]
      : (await this.venuesService.findMineByOwner(ownerId)).map((v) => v.id);
    if (venueIds.length === 0) return [];
    const courts = await this.courtsRepository.find({ where: { venueId: In(venueIds) } });
    return courts.map((c) => c.id);
  }

  private async aggregatePeriod(
    courtIds: string[],
    start: Date,
    end: Date,
  ): Promise<PeriodAggregateRow> {
    const row = await this.paymentsRepository
      .createQueryBuilder('payment')
      .innerJoin('bookings', 'booking', 'booking.id::text = payment.booking_id')
      .select('COALESCE(SUM(booking.total_price), 0)', 'revenue')
      .addSelect('COUNT(*)', 'count')
      .where('booking.court_id IN (:...courtIds)', { courtIds })
      .andWhere('payment.status = :status', { status: PaymentStatus.PAID })
      .andWhere('payment.paid_at >= :start', { start })
      .andWhere('payment.paid_at < :end', { end })
      .getRawOne<PeriodAggregateRow>();
    return row ?? { revenue: '0', count: '0' };
  }

  private fetchTransactions(
    courtIds: string[],
    start: Date,
    end: Date,
  ): Promise<TransactionRow[]> {
    return this.paymentsRepository
      .createQueryBuilder('payment')
      .innerJoin('bookings', 'booking', 'booking.id::text = payment.booking_id')
      .leftJoin('users', 'customer', 'customer.id::text = booking.customer_id')
      .leftJoin('customer_contacts', 'contact', 'contact.id = booking.customer_contact_id')
      .select('payment.id', 'id')
      .addSelect('payment.paid_at', 'paidAt')
      .addSelect('booking.total_price', 'amount')
      .addSelect('COALESCE(customer.full_name, contact.full_name)', 'customerName')
      .addSelect('COALESCE(customer.phone, contact.phone)', 'customerPhone')
      .where('booking.court_id IN (:...courtIds)', { courtIds })
      .andWhere('payment.status = :status', { status: PaymentStatus.PAID })
      .andWhere('payment.paid_at >= :start', { start })
      .andWhere('payment.paid_at < :end', { end })
      .orderBy('payment.paid_at', 'DESC')
      .getRawMany<TransactionRow>();
  }

  private emptyReport(days: string[]): RevenueReport {
    return {
      currentPeriod: { revenue: 0, transactionCount: 0, avgPerTransaction: 0 },
      previousPeriod: { revenue: 0 },
      changeAmount: 0,
      changePercent: null,
      revenueByDay: days.map((date) => ({ date, revenue: 0 })),
      transactions: [],
    };
  }
}
