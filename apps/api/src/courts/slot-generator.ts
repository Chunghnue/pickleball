import { timeToMinutes } from './time.util';

export interface Slot {
  start: string;
  end: string;
  price: number;
}

export interface SlotTime {
  start: string;
  end: string;
}

export interface GenerateSlotTimesInput {
  openTime: string;
  closeTime: string;
  slotDurationMinutes: number;
}

function toTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function generateSlotTimes(input: GenerateSlotTimesInput): SlotTime[] {
  const openMinutes = timeToMinutes(input.openTime);
  const closeMinutes = timeToMinutes(input.closeTime);

  const slots: SlotTime[] = [];
  for (
    let start = openMinutes;
    start + input.slotDurationMinutes <= closeMinutes;
    start += input.slotDurationMinutes
  ) {
    slots.push({
      start: toTimeString(start),
      end: toTimeString(start + input.slotDurationMinutes),
    });
  }
  return slots;
}
