import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { timeColumnTransformer } from '../../bookings/time-column.transformer';

export enum RecurringScheduleStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
}

@Entity('recurring_schedules')
export class RecurringSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'court_id' })
  courtId: string;

  @Column({ name: 'customer_id', nullable: true, type: 'varchar' })
  customerId: string | null;

  @Column({ name: 'customer_contact_id', nullable: true, type: 'varchar' })
  customerContactId: string | null;

  @Column({ name: 'day_of_week', type: 'int' })
  dayOfWeek: number;

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
    name: 'price_per_session',
    type: 'numeric',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  pricePerSession: number;

  @Column({
    name: 'discount_percent',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) => (value === null ? null : parseFloat(value)),
    },
  })
  discountPercent: number | null;

  @Column({ name: 'valid_from', type: 'date' })
  validFrom: string;

  @Column({ name: 'valid_to', type: 'date' })
  validTo: string;

  @Column({ nullable: true, type: 'varchar' })
  note: string | null;

  @Column({ name: 'auto_renew', type: 'boolean', default: false })
  autoRenew: boolean;

  @Column({
    type: 'enum',
    enum: RecurringScheduleStatus,
    default: RecurringScheduleStatus.ACTIVE,
  })
  status: RecurringScheduleStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
