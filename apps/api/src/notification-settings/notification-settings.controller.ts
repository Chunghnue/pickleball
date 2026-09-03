import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { NotificationSettingsService } from './notification-settings.service';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';

@Controller('notification-settings')
export class NotificationSettingsController {
  constructor(private readonly notificationSettingsService: NotificationSettingsService) {}

  @Get('mine')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  getMine(@EffectiveOwnerId() effectiveOwnerId: string) {
    return this.notificationSettingsService.getForOwner(effectiveOwnerId);
  }

  @Patch('mine')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  updateMine(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.notificationSettingsService.update(effectiveOwnerId, dto);
  }
}
