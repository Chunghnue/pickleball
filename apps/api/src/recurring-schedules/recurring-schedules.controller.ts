import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { RecurringSchedulesService } from './recurring-schedules.service';
import { CreateRecurringScheduleDto } from './dto/create-recurring-schedule.dto';
import { UpdateRecurringScheduleDto } from './dto/update-recurring-schedule.dto';

@Controller()
export class RecurringSchedulesController {
  constructor(private readonly recurringSchedulesService: RecurringSchedulesService) {}

  @Post('venues/mine/:venueId/recurring-schedules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Body() dto: CreateRecurringScheduleDto,
  ) {
    return this.recurringSchedulesService.create(user.userId, venueId, dto);
  }

  @Get('venues/mine/:venueId/recurring-schedules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
  ) {
    return this.recurringSchedulesService.findByVenueForOwner(user.userId, venueId);
  }

  @Get('venues/mine/:venueId/recurring-schedules/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.recurringSchedulesService.findByIdForOwner(user.userId, venueId, id);
  }

  @Post('venues/mine/:venueId/recurring-schedules/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.recurringSchedulesService.cancel(user.userId, venueId, id);
  }

  @Post('venues/mine/:venueId/recurring-schedules/:id/pause')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  pause(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.recurringSchedulesService.pause(user.userId, venueId, id);
  }

  @Post('venues/mine/:venueId/recurring-schedules/:id/resume')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.recurringSchedulesService.resume(user.userId, venueId, id);
  }

  @Patch('venues/mine/:venueId/recurring-schedules/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRecurringScheduleDto,
  ) {
    return this.recurringSchedulesService.update(user.userId, venueId, id, dto);
  }
}
