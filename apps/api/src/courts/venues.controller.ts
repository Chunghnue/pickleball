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
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVenueDto) {
    return this.venuesService.create(user.userId, dto);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.venuesService.findMineByOwner(user.userId);
  }

  @Get('mine/courts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  findAllMineCourts(@CurrentUser() user: AuthenticatedUser) {
    return this.courtsService.findAllForOwner(user.userId);
  }

  @Get('mine/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async findMineById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const venue = await this.venuesService.findMineById(user.userId, id);
    const images = await this.venuesService.findImagesByVenue(id);
    return { ...venue, images };
  }

  @Patch('mine/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVenueDto,
  ) {
    return this.venuesService.update(user.userId, id, dto);
  }

  @Post('mine/:id/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  addImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddVenueImageDto,
  ) {
    return this.venuesService.addImage(user.userId, id, dto);
  }

  @Delete('mine/:id/images/:imageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  removeImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    return this.venuesService.removeImage(user.userId, id, imageId);
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
