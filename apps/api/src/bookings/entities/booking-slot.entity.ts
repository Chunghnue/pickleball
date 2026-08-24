import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('booking_slots')
@Index(['courtId', 'date', 'slotStart'], { unique: true })
export class BookingSlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'booking_id' })
  bookingId: string;

  @Column({ name: 'court_id' })
  courtId: string;

  @Column({
    type: 'date',
    transformer: {
      to: (value: string) => value,
      from: (value: Date) => value.toISOString().slice(0, 10),
    },
  })
  date: string;

  @Column({ name: 'slot_start', type: 'time' })
  slotStart: string;
}
