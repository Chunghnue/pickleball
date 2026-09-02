import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('venue_slug_history')
export class VenueSlugHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'venue_id' })
  venueId: string;

  @Column({ name: 'old_slug', nullable: true, type: 'varchar' })
  oldSlug: string | null;

  @CreateDateColumn({ name: 'changed_at' })
  changedAt: Date;
}
