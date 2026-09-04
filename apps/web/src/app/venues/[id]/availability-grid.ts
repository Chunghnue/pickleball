import type { AvailabilitySlot } from "@/lib/slot-selection";

export interface GridColumn {
  start: string;
  end: string;
}

export function buildTimeColumns(
  slotsByCourtId: Record<string, AvailabilitySlot[]>,
): GridColumn[] {
  const seen = new Map<string, GridColumn>();
  for (const slots of Object.values(slotsByCourtId)) {
    for (const slot of slots) {
      seen.set(`${slot.start}-${slot.end}`, { start: slot.start, end: slot.end });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.start.localeCompare(b.start));
}

export function findSlotIndex(
  slots: AvailabilitySlot[],
  column: GridColumn,
): number {
  return slots.findIndex(
    (slot) => slot.start === column.start && slot.end === column.end,
  );
}
