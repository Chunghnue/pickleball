import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { RecurringSchedulesService } from './recurring-schedules.service';
import { CreateRecurringScheduleDto } from './dto/create-recurring-schedule.dto';
import { UpdateRecurringScheduleDto } from './dto/update-recurring-schedule.dto';

@Controller()
export class RecurringSchedulesController {
  constructor(private readonly recurringSchedulesService: RecurringSchedulesService) {}

  @Post('venues/mine/:venueId/recurring-schedules')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  create(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Body() dto: CreateRecurringScheduleDto,
  ) {
    return this.recurringSchedulesService.create(effectiveOwnerId, venueId, dto);
  }

  @Get('venues/mine/:venueId/recurring-schedules')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  findAll(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
  ) {
    return this.recurringSchedulesService.findByVenueForOwner(effectiveOwnerId, venueId);
  }

  @Get('venues/mine/:venueId/recurring-schedules/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  findOne(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.recurringSchedulesService.findByIdForOwner(effectiveOwnerId, venueId, id);
  }

  @Post('venues/mine/:venueId/recurring-schedules/:id/cancel')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  cancel(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.recurringSchedulesService.cancel(effectiveOwnerId, venueId, id);
  }

  @Post('venues/mine/:venueId/recurring-schedules/:id/pause')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  pause(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.recurringSchedulesService.pause(effectiveOwnerId, venueId, id);
  }

  @Post('venues/mine/:venueId/recurring-schedules/:id/resume')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  resume(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.recurringSchedulesService.resume(effectiveOwnerId, venueId, id);
  }

  @Patch('venues/mine/:venueId/recurring-schedules/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  update(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRecurringScheduleDto,
  ) {
    return this.recurringSchedulesService.update(effectiveOwnerId, venueId, id, dto);
  }
}
