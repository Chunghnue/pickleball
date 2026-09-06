import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PageView } from './entities/page-view.entity';
import { Court } from '../courts/entities/court.entity';
import { VenuesService } from '../courts/venues.service';
import { TrackPageViewDto } from './dto/track-page-view.dto';
import { GetPageViewsReportDto } from './dto/get-page-views-report.dto';
import { classifySource, detectIsMobile } from './page-view.utils';
import {
  fillViewsByDay,
  computePercent,
  computeConversionRate,
  toPageViewsCsv,
} from './page-view-report.utils';
import {
  getDaysBetween,
  parseDateRangeBoundaries,
} from '../common/date-range.utils';
import { getPreviousPeriodRange } from '../reports/revenue-report.utils';

export interface PageViewsReport {
  currentPeriod: {
    totalViews: number;
    uniqueVisitors: number;
    loggedInViews: number;
    mobilePercent: number;
  };
  viewsByDay: { date: string; views: number; previousViews: number }[];
  heatmap: { dayOfWeek: number; hour: number; views: number }[];
  conversion: {
    venueId: string;
    venueName: string;
    views: number;
    bookings: number;
    conversionRate: number | null;
  }[];
  topSources: { source: string; views: number }[];
  topVenues: { venueId: string; venueName: string; views: number }[];
}

interface SummaryRow {
  total: string;
  uniqueVisitors: string;
  loggedIn: string;
  mobileCount: string;
}

const HEATMAP_HOURS = 24;
const HEATMAP_DAYS = 7;
const TOP_SOURCES_LIMIT = 10;
const TOP_VENUES_LIMIT = 10;

@Injectable()
export class PageViewsService {
  constructor(
    @InjectRepository(PageView)
    private readonly pageViewsRepository: Repository<PageView>,
    @InjectRepository(Court)
    private readonly courtsRepository: Repository<Court>,
    private readonly venuesService: VenuesService,
  ) {}

  async recordView(
    dto: TrackPageViewDto,
    context: { userId: string | null; userAgent: string | undefined },
  ): Promise<void> {
    const pageView = this.pageViewsRepository.create({
      venueId: dto.venueId,
      visitorId: dto.visitorId,
      path: dto.path,
      referrer: dto.referrer ?? null,
      userId: context.userId,
      source: classifySource(dto.referrer),
      isMobile: detectIsMobile(context.userAgent),
    });
    await this.pageViewsRepository.save(pageView);
  }

  async getPageViewsReport(
    ownerId: string,
    dto: GetPageViewsReportDto,
  ): Promise<PageViewsReport> {
    this.assertValidRange(dto);
    const venues = await this.resolveVenues(ownerId, dto.venueId);
    const days = getDaysBetween(dto.from, dto.to);

    if (venues.length === 0) {
      return this.emptyReport(days);
    }

    const venueIds = venues.map((v) => v.id);
    const venueNameById = new Map(venues.map((v) => [v.id, v.name]));

    const { start, end } = parseDateRangeBoundaries(dto.from, dto.to);
    const previousPeriod = getPreviousPeriodRange(dto.from, dto.to);
    const { start: prevStart, end: prevEnd } = parseDateRangeBoundaries(
      previousPeriod.from,
      previousPeriod.to,
    );
    const prevDays = getDaysBetween(previousPeriod.from, previousPeriod.to);

    const [
      summaryRow,
      dailyRows,
      previousDailyRows,
      heatmapRows,
      sourceRows,
      viewsByVenueRows,
      bookingsByVenue,
    ] = await Promise.all([
      this.aggregateSummary(venueIds, start, end),
      this.fetchDailySeries(venueIds, start, end),
      this.fetchDailySeries(venueIds, prevStart, prevEnd),
      this.fetchHeatmap(venueIds, start, end),
      this.fetchSourceCounts(venueIds, start, end),
      this.fetchViewsByVenue(venueIds, start, end),
      this.fetchBookingsByVenue(venueIds, dto.from, dto.to),
    ]);

    const total = Number(summaryRow.total);
    const mobileCount = Number(summaryRow.mobileCount);

    const currentByDay = fillViewsByDay(dailyRows, days);
    const previousByDay = fillViewsByDay(previousDailyRows, prevDays);
    const viewsByDay = currentByDay.map((row, index) => ({
      date: row.date,
      views: row.views,
      previousViews: previousByDay[index]?.views ?? 0,
    }));

    const heatmap = this.fillHeatmap(heatmapRows);

    const viewsByVenue = new Map(
      viewsByVenueRows.map((row) => [row.venueId, Number(row.views)]),
    );

    const topVenues = [...viewsByVenue.entries()]
      .map(([venueId, views]) => ({
        venueId,
        venueName: venueNameById.get(venueId) ?? venueId,
        views,
      }))
      .sort((a, b) => b.views - a.views)
      .slice(0, TOP_VENUES_LIMIT);

    const conversion = venues
      .map((venue) => {
        const views = viewsByVenue.get(venue.id) ?? 0;
        const bookings = bookingsByVenue.get(venue.id) ?? 0;
        return {
          venueId: venue.id,
          venueName: venue.name,
          views,
          bookings,
          conversionRate: computeConversionRate(bookings, views),
        };
      })
      .sort((a, b) => b.views - a.views);

    return {
      currentPeriod: {
        totalViews: total,
        uniqueVisitors: Number(summaryRow.uniqueVisitors),
        loggedInViews: Number(summaryRow.loggedIn),
        mobilePercent: computePercent(mobileCount, total),
      },
      viewsByDay,
      heatmap,
      conversion,
      topSources: sourceRows.map((row) => ({
        source: row.source,
        views: Number(row.views),
      })),
      topVenues,
    };
  }

  async getPageViewsReportCsv(
    ownerId: string,
    dto: GetPageViewsReportDto,
  ): Promise<string> {
    const report = await this.getPageViewsReport(ownerId, dto);
    return toPageViewsCsv(report.viewsByDay);
  }

  private assertValidRange(dto: GetPageViewsReportDto): void {
    if (dto.from > dto.to) {
      throw new BadRequestException('from phải trước hoặc bằng to');
    }
  }

  private async resolveVenues(ownerId: string, venueId?: string) {
    if (venueId) {
      const venue = await this.venuesService.getOwnedVenueOrThrow(ownerId, venueId);
      return [venue];
    }
    return this.venuesService.findMineByOwner(ownerId);
  }

  private async aggregateSummary(
    venueIds: string[],
    start: Date,
    end: Date,
  ): Promise<SummaryRow> {
    const row = await this.pageViewsRepository
      .createQueryBuilder('pv')
      .select('COUNT(*)', 'total')
      .addSelect('COUNT(DISTINCT pv.visitor_id)', 'uniqueVisitors')
      .addSelect('COUNT(*) FILTER (WHERE pv.user_id IS NOT NULL)', 'loggedIn')
      .addSelect('COUNT(*) FILTER (WHERE pv.is_mobile)', 'mobileCount')
      .where('pv.venue_id IN (:...venueIds)', { venueIds })
      .andWhere('pv.created_at >= :start', { start })
      .andWhere('pv.created_at < :end', { end })
      .getRawOne<SummaryRow>();
    return row ?? { total: '0', uniqueVisitors: '0', loggedIn: '0', mobileCount: '0' };
  }

  private fetchDailySeries(
    venueIds: string[],
    start: Date,
    end: Date,
  ): Promise<{ date: string; views: string }[]> {
    return this.pageViewsRepository
      .createQueryBuilder('pv')
      .select("TO_CHAR(pv.created_at, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'views')
      .where('pv.venue_id IN (:...venueIds)', { venueIds })
      .andWhere('pv.created_at >= :start', { start })
      .andWhere('pv.created_at < :end', { end })
      .groupBy("TO_CHAR(pv.created_at, 'YYYY-MM-DD')")
      .getRawMany<{ date: string; views: string }>();
  }

  private fetchHeatmap(
    venueIds: string[],
    start: Date,
    end: Date,
  ): Promise<{ dayOfWeek: string; hour: string; views: string }[]> {
    return this.pageViewsRepository
      .createQueryBuilder('pv')
      .select('EXTRACT(DOW FROM pv.created_at)', 'dayOfWeek')
      .addSelect('EXTRACT(HOUR FROM pv.created_at)', 'hour')
      .addSelect('COUNT(*)', 'views')
      .where('pv.venue_id IN (:...venueIds)', { venueIds })
      .andWhere('pv.created_at >= :start', { start })
      .andWhere('pv.created_at < :end', { end })
      .groupBy('EXTRACT(DOW FROM pv.created_at)')
      .addGroupBy('EXTRACT(HOUR FROM pv.created_at)')
      .getRawMany<{ dayOfWeek: string; hour: string; views: string }>();
  }

  private fillHeatmap(
    rows: { dayOfWeek: string; hour: string; views: string }[],
  ): { dayOfWeek: number; hour: number; views: number }[] {
    const byKey = new Map(
      rows.map((row) => [`${Number(row.dayOfWeek)}-${Number(row.hour)}`, Number(row.views)]),
    );
    const heatmap: { dayOfWeek: number; hour: number; views: number }[] = [];
    for (let dayOfWeek = 0; dayOfWeek < HEATMAP_DAYS; dayOfWeek++) {
      for (let hour = 0; hour < HEATMAP_HOURS; hour++) {
        heatmap.push({
          dayOfWeek,
          hour,
          views: byKey.get(`${dayOfWeek}-${hour}`) ?? 0,
        });
      }
    }
    return heatmap;
  }

  private fetchSourceCounts(
    venueIds: string[],
    start: Date,
    end: Date,
  ): Promise<{ source: string; views: string }[]> {
    return this.pageViewsRepository
      .createQueryBuilder('pv')
      .select('pv.source', 'source')
      .addSelect('COUNT(*)', 'views')
      .where('pv.venue_id IN (:...venueIds)', { venueIds })
      .andWhere('pv.created_at >= :start', { start })
      .andWhere('pv.created_at < :end', { end })
      .groupBy('pv.source')
      .orderBy('views', 'DESC')
      .limit(TOP_SOURCES_LIMIT)
      .getRawMany<{ source: string; views: string }>();
  }

  private fetchViewsByVenue(
    venueIds: string[],
    start: Date,
    end: Date,
  ): Promise<{ venueId: string; views: string }[]> {
    return this.pageViewsRepository
      .createQueryBuilder('pv')
      .select('pv.venue_id', 'venueId')
      .addSelect('COUNT(*)', 'views')
      .where('pv.venue_id IN (:...venueIds)', { venueIds })
      .andWhere('pv.created_at >= :start', { start })
      .andWhere('pv.created_at < :end', { end })
      .groupBy('pv.venue_id')
      .getRawMany<{ venueId: string; views: string }>();
  }

  private async fetchBookingsByVenue(
    venueIds: string[],
    from: string,
    to: string,
  ): Promise<Map<string, number>> {
    const rows = await this.courtsRepository
      .createQueryBuilder('court')
      .innerJoin('bookings', 'booking', 'booking.court_id = court.id::text')
      .select('court.venue_id', 'venueId')
      .addSelect('COUNT(*)', 'count')
      .where('court.venue_id IN (:...venueIds)', { venueIds })
      .andWhere('booking.date >= :from', { from })
      .andWhere('booking.date <= :to', { to })
      .groupBy('court.venue_id')
      .getRawMany<{ venueId: string; count: string }>();
    return new Map(rows.map((row) => [row.venueId, Number(row.count)]));
  }

  private emptyReport(days: string[]): PageViewsReport {
    return {
      currentPeriod: {
        totalViews: 0,
        uniqueVisitors: 0,
        loggedInViews: 0,
        mobilePercent: 0,
      },
      viewsByDay: days.map((date) => ({ date, views: 0, previousViews: 0 })),
      heatmap: this.fillHeatmap([]),
      conversion: [],
      topSources: [],
      topVenues: [],
    };
  }
}
