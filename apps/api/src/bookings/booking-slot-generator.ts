import { timeToMinutes } from '../courts/time.util';

export interface CourtGrid {
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

export function generateBookingSlotStarts(
  startTime: string,
  endTime: string,
  grid: CourtGrid,
): string[] | null {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  const open = timeToMinutes(grid.openTime);
  const close = timeToMinutes(grid.closeTime);
  const duration = grid.slotDurationMinutes;

  if (start >= end) return null;
  if (start < open || end > close) return null;
  if ((start - open) % duration !== 0) return null;
  if ((end - start) % duration !== 0) return null;

  const starts: string[] = [];
  for (let t = start; t < end; t += duration) {
    starts.push(toTimeString(t));
  }
  return starts;
}
