import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { timeColumnTransformer } from '../time-column.transformer';

export enum BookingStatus {
  CONFIRMED = 'confirmed',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
}

@Entity('bookings')
export class Booking {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'court_id' })
  courtId: string;

  @Column({ name: 'customer_id', nullable: true, type: 'varchar' })
  customerId: string | null;

  @Column({ name: 'customer_contact_id', nullable: true, type: 'uuid' })
  customerContactId: string | null;

  @Column({ name: 'recurring_schedule_id', nullable: true, type: 'uuid' })
  recurringScheduleId: string | null;

  @Column({ type: 'date' })
  date: string;

  @Column({
    name: 'start_time',
    type: 'time',
    transformer: timeColumnTransformer,
  })
  startTime: string;

  @Column({
    name: 'end_time',
    type: 'time',
    transformer: timeColumnTransformer,
  })
  endTime: string;

  @Column({
    name: 'total_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  totalPrice: number;

  @Column({
    type: 'enum',
    enum: BookingStatus,
    default: BookingStatus.CONFIRMED,
  })
  status: BookingStatus;

  @Column({ nullable: true, type: 'varchar' })
  note: string | null;

  @Column({ name: 'contact_name', nullable: true, type: 'varchar' })
  contactName: string | null;

  @Column({ name: 'contact_phone', nullable: true, type: 'varchar' })
  contactPhone: string | null;

  @Column({ name: 'contact_email', nullable: true, type: 'varchar' })
  contactEmail: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'cancelled_by', nullable: true, type: 'varchar' })
  cancelledBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
