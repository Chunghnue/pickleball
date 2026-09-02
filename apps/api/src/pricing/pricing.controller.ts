import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { PricingService } from './pricing.service';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';

@Controller()
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Post('venues/mine/:venueId/courts/:courtId/pricing-rules')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  create(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Body() dto: CreatePricingRuleDto,
  ) {
    return this.pricingService.create(effectiveOwnerId, venueId, courtId, dto);
  }

  @Get('venues/mine/:venueId/pricing-summary')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  getSummary(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Query('courtId') courtId?: string,
  ) {
    return this.pricingService.getSummary(effectiveOwnerId, venueId, courtId);
  }

  @Get('venues/mine/:venueId/courts/:courtId/pricing-rules')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  findByCourt(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
  ) {
    return this.pricingService.findByCourt(effectiveOwnerId, venueId, courtId);
  }

  @Patch('venues/mine/:venueId/courts/:courtId/pricing-rules/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  update(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePricingRuleDto,
  ) {
    return this.pricingService.update(effectiveOwnerId, venueId, courtId, id, dto);
  }

  @Delete('venues/mine/:venueId/courts/:courtId/pricing-rules/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  remove(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Param('id') id: string,
  ) {
    return this.pricingService.remove(effectiveOwnerId, venueId, courtId, id);
  }

  @Post('venues/mine/:venueId/courts/:courtId/pricing-rules/copy-from/:sourceCourtId')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  copyFrom(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Param('sourceCourtId') sourceCourtId: string,
  ) {
    return this.pricingService.copyFrom(effectiveOwnerId, venueId, courtId, sourceCourtId);
  }

  @Post('venues/mine/:venueId/pricing-rules/copy-from-venue/:sourceVenueId')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  copyFromVenue(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('sourceVenueId') sourceVenueId: string,
  ) {
    return this.pricingService.copyFromVenue(effectiveOwnerId, venueId, sourceVenueId);
  }
}
