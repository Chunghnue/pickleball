import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { PaymentsService } from './payments.service';
import { MarkPaymentDto } from './dto/mark-payment.dto';

@Controller()
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('venues/mine/:venueId/bookings/:id/payment/mark-paid')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  markPaid(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
    @Body() dto: MarkPaymentDto,
  ) {
    return this.paymentsService.markPaid(user.userId, venueId, id, dto.note);
  }

  @Post('venues/mine/:venueId/bookings/:id/payment/mark-refunded')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  markRefunded(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
    @Body() dto: MarkPaymentDto,
  ) {
    return this.paymentsService.markRefunded(
      user.userId,
      venueId,
      id,
      dto.note,
    );
  }
}
