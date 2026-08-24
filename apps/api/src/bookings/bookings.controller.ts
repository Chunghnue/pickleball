import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller()
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post('bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.create(user.userId, dto);
  }

  @Get('bookings/mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.findMineByCustomer(user.userId);
  }

  @Get('bookings/mine/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  findMineById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.bookingsService.findMineById(user.userId, id);
  }

  @Post('bookings/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.CUSTOMER)
  cancelMine(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.bookingsService.cancelByCustomer(user.userId, id);
  }

  @Get('venues/mine/:venueId/bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  findForVenue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Query('date') date?: string,
    @Query('courtId') courtId?: string,
  ) {
    return this.bookingsService.findByVenueForOwner(user.userId, venueId, {
      date,
      courtId,
    });
  }

  @Post('venues/mine/:venueId/bookings/:id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  cancelForVenue(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.bookingsService.cancelByOwner(user.userId, venueId, id);
  }

  @Get('bookings/availability')
  getAvailability(
    @Query('courtId') courtId: string,
    @Query('date') date: string,
  ) {
    return this.bookingsService.getAvailability(courtId, date);
  }
}
