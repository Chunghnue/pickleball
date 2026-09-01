import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CustomerContactsService } from './customer-contacts.service';
import { NewCustomerDto } from './dto/customer-selector.dto';

@Controller('customer-contacts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.OWNER)
export class CustomerContactsController {
  constructor(private readonly customerContactsService: CustomerContactsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: NewCustomerDto) {
    return this.customerContactsService.create(user.userId, dto);
  }
}
