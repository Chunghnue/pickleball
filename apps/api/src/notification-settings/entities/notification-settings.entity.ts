import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('notification_settings')
export class NotificationSettings {
  @PrimaryColumn({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ name: 'new_booking', default: true })
  newBooking: boolean;

  @Column({ name: 'cancellation', default: true })
  cancellation: boolean;

  @Column({ name: 'payment', default: true })
  payment: boolean;

  @Column({ name: 'daily_report', default: true })
  dailyReport: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
