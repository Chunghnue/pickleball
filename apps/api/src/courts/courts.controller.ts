import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CourtsService } from './courts.service';
import { CreateCourtDto } from './dto/create-court.dto';
import { UpdateCourtDto } from './dto/update-court.dto';
import { courtImageUploadOptions } from './court-image-upload.config';

@Controller()
export class CourtsController {
  constructor(private readonly courtsService: CourtsService) {}

  @Post('venues/mine/:venueId/courts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Body() dto: CreateCourtDto,
  ) {
    return this.courtsService.create(user.userId, venueId, dto);
  }

  @Get('venues/mine/:venueId/courts')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
  ) {
    return this.courtsService.findByVenueForOwner(user.userId, venueId);
  }

  @Patch('venues/mine/:venueId/courts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCourtDto,
  ) {
    return this.courtsService.update(user.userId, venueId, id, dto);
  }

  @Delete('venues/mine/:venueId/courts/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.courtsService.remove(user.userId, venueId, id);
  }

  @Post('venues/mine/:venueId/courts/:courtId/images')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @UseInterceptors(FileInterceptor('file', courtImageUploadOptions))
  addImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file ảnh');
    }
    return this.courtsService.addImage(user.userId, venueId, courtId, file);
  }

  @Delete('venues/mine/:venueId/courts/:courtId/images/:imageId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  removeImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.courtsService.removeImage(user.userId, venueId, courtId, imageId);
  }

  @Get('courts/:id/slots')
  getSlots(@Param('id') id: string, @Query('date') date: string) {
    return this.courtsService.getSlotsForDate(id, date);
  }
}
