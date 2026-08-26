import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { AdminApprovalsService } from './admin-approvals.service';

@Controller('admin/approvals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminApprovalsController {
  constructor(private readonly adminApprovalsService: AdminApprovalsService) {}

  @Get()
  findAll() {
    return this.adminApprovalsService.findAll();
  }
}
