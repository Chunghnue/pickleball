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
import { DisputesService } from '../disputes/disputes.service';
import { ResolveDisputeDto } from '../disputes/dto/resolve-dispute.dto';

@Controller('admin/disputes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminDisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Get()
  findAll(@Query('status') status?: string) {
    return this.disputesService.findAllForAdmin(
      status === 'all' ? 'all' : 'pending',
    );
  }

  @Post(':id/resolve')
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.disputesService.resolve(id, user.userId, dto.action, dto.note);
  }
}
