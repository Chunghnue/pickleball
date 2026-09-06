import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('page_views')
@Index(['venueId', 'createdAt'])
@Index(['createdAt'])
export class PageView {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'venue_id' })
  venueId: string;

  @Column({ name: 'visitor_id' })
  visitorId: string;

  @Column({ name: 'user_id', nullable: true, type: 'varchar' })
  userId: string | null;

  @Column()
  path: string;

  @Column({ nullable: true, type: 'varchar' })
  referrer: string | null;

  @Column({ nullable: true, type: 'varchar' })
  source: string | null;

  @Column({ name: 'is_mobile', default: false })
  isMobile: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
