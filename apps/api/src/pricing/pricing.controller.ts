import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { PricingService } from './pricing.service';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';

@Controller()
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post('venues/mine/:venueId/courts/:courtId/pricing-rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Body() dto: CreatePricingRuleDto,
  ) {
    return this.pricingService.create(user.userId, venueId, courtId, dto);
  }

  @Get('venues/mine/:venueId/courts/:courtId/pricing-rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  findByCourt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
  ) {
    return this.pricingService.findByCourt(user.userId, venueId, courtId);
  }

  @Patch('venues/mine/:venueId/courts/:courtId/pricing-rules/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePricingRuleDto,
  ) {
    return this.pricingService.update(user.userId, venueId, courtId, id, dto);
  }

  @Delete('venues/mine/:venueId/courts/:courtId/pricing-rules/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Param('id') id: string,
  ) {
    return this.pricingService.remove(user.userId, venueId, courtId, id);
  }

  @Post('venues/mine/:venueId/courts/:courtId/pricing-rules/copy-from/:sourceCourtId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  copyFrom(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Param('sourceCourtId') sourceCourtId: string,
  ) {
    return this.pricingService.copyFrom(user.userId, venueId, courtId, sourceCourtId);
  }
}
