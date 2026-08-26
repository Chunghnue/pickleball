import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { VenuesService } from '../courts/venues.service';
import { UserStatus } from '../users/entities/user.entity';

export interface PendingOwnerRow {
  type: 'owner';
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  submittedAt: Date;
}

export interface PendingVenueRow {
  type: 'venue';
  id: string;
  name: string;
  address: string;
  city: string;
  submittedAt: Date;
  owner: {
    id: string;
    fullName: string;
    status: UserStatus;
  };
}

export type PendingApprovalRow = PendingOwnerRow | PendingVenueRow;

@Injectable()
export class AdminApprovalsService {
  constructor(
    private readonly usersService: UsersService,
    private readonly venuesService: VenuesService,
  ) {}

  async findAll(): Promise<PendingApprovalRow[]> {
    const [pendingOwners, pendingVenues] = await Promise.all([
      this.usersService.findPendingOwners(),
      this.venuesService.findPendingVenues(),
    ]);

    const owners = await this.usersService.findByIds(
      pendingVenues.map((venue) => venue.ownerId),
    );
    const ownersById = new Map(owners.map((owner) => [owner.id, owner]));

    const ownerRows: PendingOwnerRow[] = pendingOwners.map((owner) => ({
      type: 'owner',
      id: owner.id,
      fullName: owner.fullName,
      email: owner.email,
      phone: owner.phone,
      submittedAt: owner.createdAt,
    }));

    const venueRows: PendingVenueRow[] = pendingVenues.map((venue) => {
      // owner is guaranteed to exist (FK constraint on venues.owner_id)
      const owner = ownersById.get(venue.ownerId)!;
      return {
        type: 'venue',
        id: venue.id,
        name: venue.name,
        address: venue.address,
        city: venue.city,
        submittedAt: venue.createdAt,
        owner: {
          id: owner.id,
          fullName: owner.fullName,
          status: owner.status,
        },
      };
    });

    return [...ownerRows, ...venueRows].sort(
      (a, b) => b.submittedAt.getTime() - a.submittedAt.getTime(),
    );
  }
}
