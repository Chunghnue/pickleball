import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, OwnerScopeGuard)
@OwnerScope('operational')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Query('venueId') venueId?: string,
  ) {
    return this.dashboardService.getSummary(effectiveOwnerId, venueId);
  }
}
