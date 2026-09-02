import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { CustomerContactsService } from './customer-contacts.service';
import { NewCustomerDto } from './dto/customer-selector.dto';

@Controller('customer-contacts')
@UseGuards(JwtAuthGuard, OwnerScopeGuard)
@OwnerScope('operational')
export class CustomerContactsController {
  constructor(private readonly customerContactsService: CustomerContactsService) {}

  @Post()
  create(@EffectiveOwnerId() effectiveOwnerId: string, @Body() dto: NewCustomerDto) {
    return this.customerContactsService.create(effectiveOwnerId, dto);
  }
}
