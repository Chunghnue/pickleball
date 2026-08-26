import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { VenuesService } from '../courts/venues.service';
import { RejectDto } from './dto/reject.dto';

@Controller('admin/venues')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminVenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @Get('pending')
  findPending() {
    return this.venuesService.findPendingVenues();
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.venuesService.approveVenue(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectDto) {
    return this.venuesService.rejectVenue(id, dto?.reason);
  }
}
