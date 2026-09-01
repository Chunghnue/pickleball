import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CustomersService } from './customers.service';
import { ListCustomersDto } from './dto/list-customers.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('summary')
  getSummary(@CurrentUser() user: AuthenticatedUser, @Query('venueId') venueId?: string) {
    return this.customersService.getSummary(user.userId, venueId);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListCustomersDto) {
    return this.customersService.listCustomers(user.userId, query);
  }
}
