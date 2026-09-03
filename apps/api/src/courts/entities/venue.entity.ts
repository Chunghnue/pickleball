import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum VenueStatus {
  PENDING_APPROVAL = 'pending_approval',
  ACTIVE = 'active',
  REJECTED = 'rejected',
}

@Entity('venues')
export class Venue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @Column()
  name: string;

  @Column()
  address: string;

  @Column()
  city: string;

  @Column({ nullable: true, type: 'varchar' })
  description: string | null;

  @Column({
    type: 'enum',
    enum: VenueStatus,
    default: VenueStatus.PENDING_APPROVAL,
  })
  status: VenueStatus;

  @Column({ name: 'cancellation_cutoff_hours', type: 'int', default: 2 })
  cancellationCutoffHours: number;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ nullable: true, type: 'varchar' })
  phone: string | null;

  @Column({ nullable: true, type: 'varchar' })
  slug: string | null;

  @Column({ nullable: true, type: 'varchar' })
  district: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  @Column({ nullable: true, type: 'varchar' })
  email: string | null;

  @Column({ name: 'is_hidden', default: false })
  isHidden: boolean;

  @Column({ name: 'logo_url', nullable: true, type: 'varchar' })
  logoUrl: string | null;

  @Column({ nullable: true, type: 'varchar' })
  website: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
