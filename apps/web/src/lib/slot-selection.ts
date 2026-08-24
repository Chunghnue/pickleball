export interface AvailabilitySlot {
  start: string;
  end: string;
  price: number;
  isBooked: boolean;
}

export function computeMaxConsecutiveDuration(
  slots: AvailabilitySlot[],
  selectedIndex: number,
): number {
  let count = 0;
  for (let i = selectedIndex; i < slots.length; i++) {
    if (slots[i].isBooked) break;
    count += 1;
  }
  return count;
}
