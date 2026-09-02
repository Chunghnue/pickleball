import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { CustomersService } from './customers.service';
import { ListCustomersDto } from './dto/list-customers.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard, OwnerScopeGuard)
@OwnerScope('operational')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('summary')
  getSummary(@EffectiveOwnerId() effectiveOwnerId: string, @Query('venueId') venueId?: string) {
    return this.customersService.getSummary(effectiveOwnerId, venueId);
  }

  @Get()
  list(@EffectiveOwnerId() effectiveOwnerId: string, @Query() query: ListCustomersDto) {
    return this.customersService.listCustomers(effectiveOwnerId, query);
  }

  @Get(':kind/:id')
  detail(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.customersService.getCustomerDetail(effectiveOwnerId, kind, id);
  }
}
