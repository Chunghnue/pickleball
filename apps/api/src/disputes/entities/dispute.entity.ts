import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DisputeStatus {
  PENDING = 'pending',
  RESOLVED_REFUND = 'resolved_refund',
  REJECTED = 'rejected',
}

@Entity('disputes')
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id', unique: true })
  bookingId: string;

  @Column({ name: 'customer_id' })
  customerId: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({
    type: 'enum',
    enum: DisputeStatus,
    default: DisputeStatus.PENDING,
  })
  status: DisputeStatus;

  @Column({ name: 'admin_note', type: 'text', nullable: true })
  adminNote: string | null;

  @Column({ name: 'resolved_by', nullable: true, type: 'varchar' })
  resolvedBy: string | null;

  @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
