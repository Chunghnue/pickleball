import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { ReportsService } from './reports.service';
import { GetRevenueReportDto } from './dto/get-revenue-report.dto';
import { PageViewsService } from '../page-views/page-views.service';
import { GetPageViewsReportDto } from '../page-views/dto/get-page-views-report.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, OwnerScopeGuard)
@OwnerScope('operational')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly pageViewsService: PageViewsService,
  ) {}

  @Get('revenue')
  getRevenue(
    @EffectiveOwnerId() ownerId: string,
    @Query() dto: GetRevenueReportDto,
  ) {
    return this.reportsService.getRevenueReport(ownerId, dto);
  }

  @Get('revenue/export')
  async exportRevenue(
    @EffectiveOwnerId() ownerId: string,
    @Query() dto: GetRevenueReportDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.reportsService.getRevenueReportCsv(ownerId, dto);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="doanh-thu-${dto.from}-den-${dto.to}.csv"`,
    });
    res.send(csv);
  }

  @Get('page-views')
  getPageViews(
    @EffectiveOwnerId() ownerId: string,
    @Query() dto: GetPageViewsReportDto,
  ) {
    return this.pageViewsService.getPageViewsReport(ownerId, dto);
  }

  @Get('page-views/export')
  async exportPageViews(
    @EffectiveOwnerId() ownerId: string,
    @Query() dto: GetPageViewsReportDto,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.pageViewsService.getPageViewsReportCsv(ownerId, dto);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="luot-xem-trang-${dto.from}-den-${dto.to}.csv"`,
    });
    res.send(csv);
  }
}
