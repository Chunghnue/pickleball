import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { PageViewsService } from './page-views.service';
import { TrackPageViewDto } from './dto/track-page-view.dto';

const TRACK_THROTTLE = { default: { limit: 60, ttl: 60000 } };

@Controller('page-views')
export class PageViewsController {
  constructor(private readonly pageViewsService: PageViewsService) {}

  @Throttle(TRACK_THROTTLE)
  @UseGuards(OptionalJwtAuthGuard)
  @Post('track')
  @HttpCode(204)
  async track(
    @CurrentUser() user: AuthenticatedUser | null,
    @Body() dto: TrackPageViewDto,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<void> {
    await this.pageViewsService.recordView(dto, {
      userId: user?.userId ?? null,
      userAgent,
    });
  }
}
