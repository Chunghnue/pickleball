import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { timeColumnTransformer } from '../time-column.transformer';

@Entity('booking_slots')
@Index(['courtId', 'date', 'slotStart'], { unique: true })
export class BookingSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id' })
  bookingId: string;

  @Column({ name: 'court_id' })
  courtId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({
    name: 'slot_start',
    type: 'time',
    transformer: timeColumnTransformer,
  })
  slotStart: string;
}
