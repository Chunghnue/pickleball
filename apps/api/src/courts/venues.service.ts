import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Venue, VenueStatus } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { AddVenueImageDto } from './dto/add-venue-image.dto';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class VenuesService {
  constructor(
    @InjectRepository(Venue)
    private readonly venuesRepository: Repository<Venue>,
    @InjectRepository(VenueImage)
    private readonly venueImagesRepository: Repository<VenueImage>,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(ownerId: string, dto: CreateVenueDto): Promise<Venue> {
    const existingCount = await this.venuesRepository.count({ where: { ownerId } });
    const venue = this.venuesRepository.create({
      ownerId,
      name: dto.name,
      address: dto.address,
      city: dto.city,
      description: dto.description ?? null,
      status: VenueStatus.PENDING_APPROVAL,
      isDefault: existingCount === 0,
    });
    return this.venuesRepository.save(venue);
  }

  findMineByOwner(ownerId: string): Promise<Venue[]> {
    return this.venuesRepository.find({ where: { ownerId } });
  }

  findMineById(ownerId: string, id: string): Promise<Venue> {
    return this.getOwnedVenueOrThrow(ownerId, id);
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateVenueDto,
  ): Promise<Venue> {
    const venue = await this.getOwnedVenueOrThrow(ownerId, id);
    if (dto.name !== undefined) venue.name = dto.name;
    if (dto.address !== undefined) venue.address = dto.address;
    if (dto.city !== undefined) venue.city = dto.city;
    if (dto.description !== undefined) venue.description = dto.description;
    if (dto.cancellationCutoffHours !== undefined) {
      venue.cancellationCutoffHours = dto.cancellationCutoffHours;
    }
    if (dto.phone !== undefined) venue.phone = dto.phone;
    return this.venuesRepository.save(venue);
  }

  async addImage(
    ownerId: string,
    venueId: string,
    dto: AddVenueImageDto,
  ): Promise<VenueImage> {
    await this.getOwnedVenueOrThrow(ownerId, venueId);
    const image = this.venueImagesRepository.create({
      venueId,
      url: dto.url,
    });
    return this.venueImagesRepository.save(image);
  }

  async removeImage(
    ownerId: string,
    venueId: string,
    imageId: string,
  ): Promise<void> {
    await this.getOwnedVenueOrThrow(ownerId, venueId);
    const image = await this.venueImagesRepository.findOne({
      where: { id: imageId, venueId },
    });
    if (!image) {
      throw new NotFoundException(`Ảnh ${imageId} không tồn tại`);
    }
    await this.venueImagesRepository.remove(image);
  }

  findImagesByVenue(venueId: string): Promise<VenueImage[]> {
    return this.venueImagesRepository.find({ where: { venueId } });
  }

  async getOwnedVenueOrThrow(
    ownerId: string,
    venueId: string,
  ): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({
      where: { id: venueId },
    });
    if (!venue) {
      throw new NotFoundException(`Venue ${venueId} không tồn tại`);
    }
    if (venue.ownerId !== ownerId) {
      throw new ForbiddenException('Bạn không có quyền truy cập venue này');
    }
    return venue;
  }

  async findByIdOrThrow(id: string): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({ where: { id } });
    if (!venue) {
      throw new NotFoundException(`Venue ${id} không tồn tại`);
    }
    return venue;
  }

  findPendingVenues(): Promise<Venue[]> {
    return this.venuesRepository.find({
      where: { status: VenueStatus.PENDING_APPROVAL },
    });
  }

  approveVenue(id: string): Promise<Venue> {
    return this.transitionStatus(id, VenueStatus.ACTIVE);
  }

  rejectVenue(id: string, reason?: string): Promise<Venue> {
    return this.transitionStatus(id, VenueStatus.REJECTED, reason);
  }

  private async transitionStatus(
    id: string,
    nextStatus: VenueStatus,
    reason?: string,
  ): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({ where: { id } });
    if (!venue) {
      throw new NotFoundException(`Venue ${id} không tồn tại`);
    }
    if (venue.status !== VenueStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Chỉ có thể duyệt/từ chối venue đang chờ duyệt',
      );
    }
    venue.status = nextStatus;
    const saved = await this.venuesRepository.save(venue);
    const owner = await this.usersService.findById(saved.ownerId);
    // venue owners always register with email (RegisterDto requires it) —
    // only staff accounts (never venue owners) can have a null email.
    if (owner) {
      if (nextStatus === VenueStatus.ACTIVE) {
        await this.notificationsService.notifyVenueApproved({
          to: owner.email!,
          ownerName: owner.fullName,
          venueName: saved.name,
        });
      } else {
        await this.notificationsService.notifyVenueRejected({
          to: owner.email!,
          ownerName: owner.fullName,
          venueName: saved.name,
          reason,
        });
      }
    }
    return saved;
  }

  searchPublic(query?: string): Promise<Venue[]> {
    if (!query) {
      return this.venuesRepository.find({
        where: { status: VenueStatus.ACTIVE },
      });
    }
    return this.venuesRepository.find({
      where: [
        { status: VenueStatus.ACTIVE, name: ILike(`%${query}%`) },
        { status: VenueStatus.ACTIVE, address: ILike(`%${query}%`) },
        { status: VenueStatus.ACTIVE, city: ILike(`%${query}%`) },
      ],
    });
  }

  async findPublicById(id: string): Promise<Venue> {
    const venue = await this.venuesRepository.findOne({
      where: { id, status: VenueStatus.ACTIVE },
    });
    if (!venue) {
      throw new NotFoundException(`Venue ${id} không tồn tại`);
    }
    return venue;
  }
}
