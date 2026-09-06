import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum PartnerSportType {
  BONG_DA = 'bong-da',
  TENNIS = 'tennis',
  CAU_LONG = 'cau-long',
  PICKLEBALL = 'pickleball',
  BONG_BAN = 'bong-ban',
  BONG_RO = 'bong-ro',
  KHAC = 'khac',
}

@Entity('partner_applications')
export class PartnerApplication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_full_name' })
  ownerFullName: string;

  @Column({ name: 'owner_phone' })
  ownerPhone: string;

  @Column({ name: 'owner_email' })
  ownerEmail: string;

  @Column({ name: 'venue_name' })
  venueName: string;

  @Column()
  address: string;

  @Column()
  province: string;

  @Column({ nullable: true, type: 'varchar' })
  ward: string | null;

  @Column({
    name: 'sport_types',
    type: 'enum',
    enum: PartnerSportType,
    array: true,
  })
  sportTypes: PartnerSportType[];

  @Column({ name: 'court_count', type: 'int' })
  courtCount: number;

  @Column({ nullable: true, type: 'varchar' })
  website: string | null;

  @Column({ nullable: true, type: 'text' })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
