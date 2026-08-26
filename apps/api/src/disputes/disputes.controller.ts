import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { DisputesService } from './disputes.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post('bookings/:id/disputes')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateDisputeDto,
  ) {
    return this.disputesService.createDispute(user.userId, id, dto.reason);
  }

  @Get('disputes/mine')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.disputesService.findMineByCustomer(user.userId);
  }
}
