import { describe, it, expect } from "vitest";
import { buildTimeColumns, findSlotIndex } from "./availability-grid";
import type { AvailabilitySlot } from "@/lib/slot-selection";

function slot(start: string, end: string, isBooked = false): AvailabilitySlot {
  return { start, end, price: 100000, isBooked };
}

describe("buildTimeColumns", () => {
  it("returns the union of slot ranges across courts, sorted by start time", () => {
    const columns = buildTimeColumns({
      "court-a": [slot("06:00", "07:00"), slot("07:00", "08:00")],
      "court-b": [slot("07:00", "08:00"), slot("08:00", "09:00")],
    });

    expect(columns).toEqual([
      { start: "06:00", end: "07:00" },
      { start: "07:00", end: "08:00" },
      { start: "08:00", end: "09:00" },
    ]);
  });

  it("de-duplicates identical ranges shared by multiple courts", () => {
    const columns = buildTimeColumns({
      "court-a": [slot("06:00", "07:00")],
      "court-b": [slot("06:00", "07:00")],
    });

    expect(columns).toHaveLength(1);
  });

  it("returns an empty array when there are no courts", () => {
    expect(buildTimeColumns({})).toEqual([]);
  });
});

describe("findSlotIndex", () => {
  it("finds the index of a matching start/end pair", () => {
    const slots = [slot("06:00", "07:00"), slot("07:00", "08:00")];
    expect(findSlotIndex(slots, { start: "07:00", end: "08:00" })).toBe(1);
  });

  it("returns -1 when the court has no slot for that column", () => {
    const slots = [slot("06:00", "07:00")];
    expect(findSlotIndex(slots, { start: "20:00", end: "21:00" })).toBe(-1);
  });
});
