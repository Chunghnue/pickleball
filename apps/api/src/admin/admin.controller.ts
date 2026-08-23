import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';

@Controller('admin/owners')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly usersService: UsersService) {}

  @Get('pending')
  findPending() {
    return this.usersService.findPendingOwners();
  }

  @Post(':id/approve')
  approve(@Param('id') id: string) {
    return this.usersService.approveOwner(id);
  }

  @Post(':id/reject')
  reject(@Param('id') id: string) {
    return this.usersService.rejectOwner(id);
  }
}
