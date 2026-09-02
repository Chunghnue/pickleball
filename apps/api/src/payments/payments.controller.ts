import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { PaymentsService } from './payments.service';
import { MarkPaymentDto } from './dto/mark-payment.dto';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('venues/mine/:venueId/bookings/:id/payment/mark-paid')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('operational')
  markPaid(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
    @Body() dto: MarkPaymentDto,
  ) {
    return this.paymentsService.markPaid(effectiveOwnerId, venueId, id, dto.note);
  }

  @Post('venues/mine/:venueId/bookings/:id/payment/mark-refunded')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('operational')
  markRefunded(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
    @Body() dto: MarkPaymentDto,
  ) {
    return this.paymentsService.markRefunded(
      effectiveOwnerId,
      venueId,
      id,
      dto.note,
    );
  }
}
