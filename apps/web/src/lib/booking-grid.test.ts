import { describe, expect, it } from "vitest";
import {
  buildHourAxis,
  computeCellState,
  computeMaxConsecutiveHours,
  type GridBooking,
  type GridCourt,
} from "./booking-grid";

const COURT_A: GridCourt = { id: "court-a", status: "active", openTime: "08:00", closeTime: "11:00" };
const COURT_B: GridCourt = { id: "court-b", status: "active", openTime: "09:00", closeTime: "12:00" };
const MAINTENANCE_COURT: GridCourt = { id: "court-m", status: "maintenance", openTime: "08:00", closeTime: "20:00" };

describe("buildHourAxis", () => {
  it("unions the open/close range across active courts", () => {
    expect(buildHourAxis([COURT_A, COURT_B])).toEqual(["08:00", "09:00", "10:00", "11:00"]);
  });

  it("ignores non-active courts", () => {
    expect(buildHourAxis([MAINTENANCE_COURT])).toEqual([]);
  });

  it("returns an empty array when there are no courts", () => {
    expect(buildHourAxis([])).toEqual([]);
  });
});

describe("computeCellState", () => {
  const booking = (overrides: Partial<GridBooking>): GridBooking => ({
    id: "b1",
    courtId: "court-a",
    startTime: "08:00",
    endTime: "09:00",
    status: "confirmed",
    recurringScheduleId: null,
    ...overrides,
  });

  it("returns unavailable for a non-active court regardless of bookings", () => {
    expect(computeCellState(MAINTENANCE_COURT, "08:00", [], null)).toEqual({
      state: "unavailable",
      bookingIds: [],
    });
  });

  it("returns empty when no booking overlaps the hour", () => {
    expect(computeCellState(COURT_A, "10:00", [booking({})], null)).toEqual({
      state: "empty",
      bookingIds: [],
    });
  });

  it("returns booked when a confirmed booking overlaps and now is not provided", () => {
    expect(computeCellState(COURT_A, "08:00", [booking({})], null)).toEqual({
      state: "booked",
      bookingIds: ["b1"],
    });
  });

  it("ignores cancelled bookings", () => {
    expect(
      computeCellState(COURT_A, "08:00", [booking({ status: "cancelled" })], null),
    ).toEqual({ state: "empty", bookingIds: [] });
  });

  it("returns playing when now falls within the overlapping booking's window", () => {
    const now = new Date(2026, 7, 25, 8, 30);
    expect(computeCellState(COURT_A, "08:00", [booking({})], now)).toEqual({
      state: "playing",
      bookingIds: ["b1"],
    });
  });

  it("does not return playing when now is outside the booking's window", () => {
    const now = new Date(2026, 7, 25, 14, 0);
    expect(computeCellState(COURT_A, "08:00", [booking({})], now)).toEqual({
      state: "booked",
      bookingIds: ["b1"],
    });
  });

  it("returns recurring when the overlapping booking has a recurringScheduleId, even if it is currently playing", () => {
    const now = new Date(2026, 7, 25, 8, 30);
    expect(
      computeCellState(COURT_A, "08:00", [booking({ recurringScheduleId: "schedule-1" })], now),
    ).toEqual({ state: "recurring", bookingIds: ["b1"] });
  });

  it("reports every overlapping booking id when two half-hour bookings share the hour", () => {
    const bookings = [
      booking({ id: "b1", startTime: "08:00", endTime: "08:30" }),
      booking({ id: "b2", startTime: "08:30", endTime: "09:00" }),
    ];
    const result = computeCellState(COURT_A, "08:00", bookings, null);
    expect(result.state).toBe("booked");
    expect(result.bookingIds).toEqual(["b1", "b2"]);
  });
});

describe("computeMaxConsecutiveHours", () => {
  it("counts consecutive empty hours from the start hour until a booked hour or closing time", () => {
    const bookings = [
      {
        id: "b1",
        courtId: "court-a",
        startTime: "10:00",
        endTime: "11:00",
        status: "confirmed" as const,
        recurringScheduleId: null,
      },
    ];
    expect(computeMaxConsecutiveHours(COURT_A, "08:00", bookings)).toBe(2);
  });

  it("returns 0 when the start hour itself is booked", () => {
    const bookings = [
      {
        id: "b1",
        courtId: "court-a",
        startTime: "08:00",
        endTime: "09:00",
        status: "confirmed" as const,
        recurringScheduleId: null,
      },
    ];
    expect(computeMaxConsecutiveHours(COURT_A, "08:00", bookings)).toBe(0);
  });
});
