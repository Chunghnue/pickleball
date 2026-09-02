import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { VenuesService } from './venues.service';
import { CourtsService } from './courts.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { AddVenueImageDto } from './dto/add-venue-image.dto';

@Controller('venues')
export class VenuesController {
  constructor(
    private readonly venuesService: VenuesService,
    private readonly courtsService: CourtsService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  create(@EffectiveOwnerId() effectiveOwnerId: string, @Body() dto: CreateVenueDto) {
    return this.venuesService.create(effectiveOwnerId, dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  findMine(@EffectiveOwnerId() effectiveOwnerId: string) {
    return this.venuesService.findMineByOwner(effectiveOwnerId);
  }

  @Get('mine/courts')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  findAllMineCourts(@EffectiveOwnerId() effectiveOwnerId: string) {
    return this.courtsService.findAllForOwner(effectiveOwnerId);
  }

  @Get('mine/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  async findMineById(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
  ) {
    const venue = await this.venuesService.findMineById(effectiveOwnerId, id);
    const images = await this.venuesService.findImagesByVenue(id);
    return { ...venue, images };
  }

  @Patch('mine/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  update(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
    @Body() dto: UpdateVenueDto,
  ) {
    return this.venuesService.update(effectiveOwnerId, id, dto);
  }

  @Post('mine/:id/set-default')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  setDefault(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
  ) {
    return this.venuesService.setDefault(effectiveOwnerId, id);
  }

  @Post('mine/:id/images')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  addImage(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
    @Body() dto: AddVenueImageDto,
  ) {
    return this.venuesService.addImage(effectiveOwnerId, id, dto);
  }

  @Delete('mine/:id/images/:imageId')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  removeImage(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.venuesService.removeImage(effectiveOwnerId, id, imageId);
  }

  @Get()
  search(@Query('query') query?: string) {
    return this.venuesService.searchPublic(query);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const venue = await this.venuesService.findPublicById(id);
    const courts = await this.courtsService.findActiveByVenue(id);
    const images = await this.venuesService.findImagesByVenue(id);
    return { ...venue, courts, images };
  }
}
