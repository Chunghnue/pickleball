import { timeToMinutes } from './time.util';

export interface Slot {
  start: string;
  end: string;
  price: number;
}

export interface GenerateSlotsInput {
  openTime: string;
  closeTime: string;
  slotDurationMinutes: number;
  pricePerHour: number;
}

function toTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function generateSlots(input: GenerateSlotsInput): Slot[] {
  const openMinutes = timeToMinutes(input.openTime);
  const closeMinutes = timeToMinutes(input.closeTime);
  const pricePerSlot = input.pricePerHour * (input.slotDurationMinutes / 60);

  const slots: Slot[] = [];
  for (
    let start = openMinutes;
    start + input.slotDurationMinutes <= closeMinutes;
    start += input.slotDurationMinutes
  ) {
    slots.push({
      start: toTimeString(start),
      end: toTimeString(start + input.slotDurationMinutes),
      price: Math.round(pricePerSlot * 100) / 100,
    });
  }
  return slots;
}
