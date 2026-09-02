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
import { OwnerScopeGuard } from '../auth/guards/owner-scope.guard';
import { OwnerScope } from '../auth/decorators/owner-scope.decorator';
import { EffectiveOwnerId } from '../auth/decorators/effective-owner-id.decorator';
import { CourtsService } from './courts.service';
import { CreateCourtDto } from './dto/create-court.dto';
import { UpdateCourtDto } from './dto/update-court.dto';
import { courtImageUploadOptions } from './court-image-upload.config';

@Controller()
export class CourtsController {
  constructor(private readonly courtsService: CourtsService) {}

  @Post('venues/mine/:venueId/courts')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  create(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Body() dto: CreateCourtDto,
  ) {
    return this.courtsService.create(effectiveOwnerId, venueId, dto);
  }

  @Get('venues/mine/:venueId/courts')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  findMine(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
  ) {
    return this.courtsService.findByVenueForOwner(effectiveOwnerId, venueId);
  }

  @Patch('venues/mine/:venueId/courts/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  update(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCourtDto,
  ) {
    return this.courtsService.update(effectiveOwnerId, venueId, id, dto);
  }

  @Delete('venues/mine/:venueId/courts/:id')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  remove(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('id') id: string,
  ) {
    return this.courtsService.remove(effectiveOwnerId, venueId, id);
  }

  @Post('venues/mine/:venueId/courts/:courtId/images')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  @UseInterceptors(FileInterceptor('file', courtImageUploadOptions))
  addImage(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Vui lòng chọn file ảnh');
    }
    return this.courtsService.addImage(effectiveOwnerId, venueId, courtId, file);
  }

  @Delete('venues/mine/:venueId/courts/:courtId/images/:imageId')
  @UseGuards(JwtAuthGuard, OwnerScopeGuard)
  @OwnerScope('full')
  removeImage(
    @EffectiveOwnerId() effectiveOwnerId: string,
    @Param('venueId') venueId: string,
    @Param('courtId') courtId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.courtsService.removeImage(effectiveOwnerId, venueId, courtId, imageId);
  }

  @Get('courts/:id/slots')
  getSlots(@Param('id') id: string, @Query('date') date: string) {
    return this.courtsService.getSlotsForDate(id, date);
  }
}
