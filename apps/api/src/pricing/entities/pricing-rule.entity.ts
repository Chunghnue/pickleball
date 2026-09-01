import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { timeColumnTransformer } from '../../bookings/time-column.transformer';

const daysOfWeekTransformer = {
  to: (value: number[]) => value.join(','),
  from: (value: string) => value.split(',').map(Number),
};

const moneyTransformer = {
  to: (value: number) => value,
  from: (value: string) => parseFloat(value),
};

const nullableMoneyTransformer = {
  to: (value: number | null) => value,
  from: (value: string | null) => (value === null ? null : parseFloat(value)),
};

@Entity('pricing_rules')
export class PricingRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'court_id' })
  courtId: string;

  @Column()
  name: string;

  @Column({
    name: 'days_of_week',
    type: 'varchar',
    transformer: daysOfWeekTransformer,
  })
  daysOfWeek: number[];

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

  @Column({ type: 'numeric', precision: 10, scale: 2, transformer: moneyTransformer })
  price: number;

  @Column({ type: 'int', default: 0 })
  priority: number;

  @Column({ name: 'advance_booking_hours', type: 'int', nullable: true })
  advanceBookingHours: number | null;

  @Column({
    name: 'advance_price',
    type: 'numeric',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: nullableMoneyTransformer,
  })
  advancePrice: number | null;

  @Column({ name: 'valid_from', type: 'date', nullable: true })
  validFrom: string | null;

  @Column({ name: 'valid_to', type: 'date', nullable: true })
  validTo: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
