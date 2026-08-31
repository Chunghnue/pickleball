export type CellState = "empty" | "booked" | "playing" | "recurring" | "unavailable";

export interface GridCourt {
  id: string;
  status: "active" | "maintenance" | "closed";
  openTime: string;
  closeTime: string;
}

export interface GridBooking {
  id: string;
  courtId: string;
  startTime: string;
  endTime: string;
  status: "confirmed" | "cancelled" | "completed";
  recurringScheduleId: string | null;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function buildHourAxis(courts: GridCourt[]): string[] {
  const active = courts.filter((c) => c.status === "active");
  if (active.length === 0) return [];
  const openMinutes = Math.min(...active.map((c) => toMinutes(c.openTime)));
  const closeMinutes = Math.max(...active.map((c) => toMinutes(c.closeTime)));
  const hours: string[] = [];
  for (let m = openMinutes; m < closeMinutes; m += 60) {
    hours.push(toHHMM(m));
  }
  return hours;
}

export function computeCellState(
  court: GridCourt,
  hour: string,
  bookings: GridBooking[],
  now: Date | null,
): { state: CellState; bookingIds: string[] } {
  if (court.status !== "active") {
    return { state: "unavailable", bookingIds: [] };
  }
  const hourStart = toMinutes(hour);
  const hourEnd = hourStart + 60;
  const overlapping = bookings.filter((b) => {
    if (b.courtId !== court.id || b.status === "cancelled") return false;
    const start = toMinutes(b.startTime);
    const end = toMinutes(b.endTime);
    return start < hourEnd && end > hourStart;
  });
  if (overlapping.length === 0) {
    return { state: "empty", bookingIds: [] };
  }
  if (overlapping.some((b) => b.recurringScheduleId)) {
    return { state: "recurring", bookingIds: overlapping.map((b) => b.id) };
  }
  if (now) {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const isPlaying = overlapping.some((b) => {
      const start = toMinutes(b.startTime);
      const end = toMinutes(b.endTime);
      return nowMinutes >= start && nowMinutes < end;
    });
    if (isPlaying) {
      return { state: "playing", bookingIds: overlapping.map((b) => b.id) };
    }
  }
  return { state: "booked", bookingIds: overlapping.map((b) => b.id) };
}

export function computeMaxConsecutiveHours(
  court: GridCourt,
  startHour: string,
  bookings: GridBooking[],
): number {
  const hours = buildHourAxis([court]).filter((hour) => hour >= startHour);
  let count = 0;
  for (const hour of hours) {
    const { state } = computeCellState(court, hour, bookings, null);
    if (state !== "empty") break;
    count += 1;
  }
  return count;
}
