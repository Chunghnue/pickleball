import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { VenuesService } from './venues.service';
import { CourtsService } from './courts.service';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { AddVenueImageDto } from './dto/add-venue-image.dto';
import { ListVenuesDto } from './dto/list-venues.dto';
import { OperatingHourItemDto } from './dto/operating-hour-item.dto';
import { venueLogoUploadOptions } from './venue-logo-upload.config';

@Controller('venues')
export class VenuesController {
  constructor(
    private readonly venuesService: VenuesService,
    private readonly courtsService: CourtsService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  create(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Body() dto: CreateVenueDto,
  ) {
    return this.venuesService.create(effectiveOwnerId, dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  async findMine(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Query() query: ListVenuesDto,
  ) {
    const venues = await this.venuesService.findMineWithMetrics(
      effectiveOwnerId,
      query,
    );
    return Promise.all(
      venues.map(async (venue) => ({
        ...venue,
        images: await this.venuesService.findImagesByVenue(venue.id),
      })),
    );
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

  @Get('mine/:id/operating-hours')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  getOperatingHours(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
  ) {
    return this.venuesService.getOperatingHours(effectiveOwnerId, id);
  }

  @Put('mine/:id/operating-hours')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  setOperatingHours(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
    @Body(new ParseArrayPipe({ items: OperatingHourItemDto }))
    items: OperatingHourItemDto[],
  ) {
    return this.venuesService.setOperatingHours(effectiveOwnerId, id, items);
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

  @Delete('mine/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  remove(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
  ) {
    return this.venuesService.remove(effectiveOwnerId, id);
  }

  @Post('mine/:id/logo')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  @UseInterceptors(FileInterceptor('file', venueLogoUploadOptions))
  uploadLogo(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file ảnh');
    }
    return this.venuesService.uploadLogo(effectiveOwnerId, id, file);
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
  search(
    @Query('query') query?: string,
    @Query('date') date?: string,
    @Query('time') time?: string,
    @Query('city') city?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.venuesService.searchPublic(
      query,
      date,
      time,
      city,
      sort,
      page,
      pageSize,
    );
  }

  @Get('cities')
  listCities() {
    return this.venuesService.listActiveCities();
  }

  @Get('by-slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const venue = await this.venuesService.findPublicBySlug(slug);
    const courts = await this.courtsService.findActiveByVenue(venue.id);
    const images = await this.venuesService.findImagesByVenue(venue.id);
    return { ...venue, courts, images };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const venue = await this.venuesService.findPublicById(id);
    const courts = await this.courtsService.findActiveByVenue(id);
    const images = await this.venuesService.findImagesByVenue(id);
    return { ...venue, courts, images };
  }
}
