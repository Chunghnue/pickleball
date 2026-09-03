import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('venue_operating_hours')
export class VenueOperatingHours {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'venue_id' })
  venueId: string;

  @Column({ name: 'day_of_week', type: 'int' })
  dayOfWeek: number;

  @Column({ name: 'is_open', default: true })
  isOpen: boolean;

  @Column({ name: 'open_time', type: 'time', nullable: true })
  openTime: string | null;

  @Column({ name: 'close_time', type: 'time', nullable: true })
  closeTime: string | null;
}
