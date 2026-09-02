import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { StaffService } from './staff.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { ListStaffDto } from './dto/list-staff.dto';

@Controller('staff')
@UseGuards(JwtAuthGuard, OwnerScopeGuard)
@OwnerScope('full')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  create(@EffectiveOwnerId() ownerId: string, @Body() dto: CreateStaffDto) {
    return this.staffService.create(ownerId, dto);
  }

  @Get()
  list(@EffectiveOwnerId() ownerId: string, @Query() query: ListStaffDto) {
    return this.staffService.list(ownerId, query);
  }
}
