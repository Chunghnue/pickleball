"use client";

import { MapPin } from "lucide-react";
import { buildHourAxis, computeCellState, type CellState } from "@/lib/booking-grid";
import type { Court } from "../types";
import type { OwnerBooking } from "./types";

function isCurrentHour(hour: string, now: Date | null): boolean {
  if (!now) return false;
  const [h] = hour.split(":").map(Number);
  return now.getHours() === h;
}

interface BookingGridProps {
  courts: Court[];
  bookings: OwnerBooking[];
  now: Date | null;
  onCellClick: (court: Court, hour: string, state: CellState, bookingIds: string[]) => void;
}

const STATE_CLASS: Record<CellState, string> = {
  empty: "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-950 dark:text-green-300",
  booked: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  playing: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  recurring: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  unavailable: "bg-muted text-muted-foreground cursor-not-allowed",
};

export function BookingGrid({ courts, bookings, now, onCellClick }: BookingGridProps) {
  const hours = buildHourAxis(
    courts.map((c) => ({ id: c.id, status: c.status, openTime: c.openTime, closeTime: c.closeTime })),
  );
  const gridBookings = bookings.map((b) => ({
    id: b.id,
    courtId: b.courtId,
    startTime: b.startTime,
    endTime: b.endTime,
    status: b.status,
    recurringScheduleId: b.recurringScheduleId,
  }));

  if (hours.length === 0) {
    return <p className="text-sm text-muted-foreground">Chi nhánh chưa có sân đang hoạt động.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/40">
            <th className="w-16 border-b p-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Giờ
            </th>
            {courts.map((court) => (
              <th key={court.id} className="border-b p-2 text-left font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-rose-500" />
                  {court.name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map((hour) => (
            <tr key={hour}>
              <td
                className={`border-b p-2 ${
                  isCurrentHour(hour, now)
                    ? "font-semibold text-blue-600"
                    : "text-muted-foreground"
                }`}
              >
                <span className="flex items-center gap-1">
                  {hour}
                  {isCurrentHour(hour, now) && <span className="size-1.5 rounded-full bg-blue-500" />}
                </span>
              </td>
              {courts.map((court) => {
                const gridCourt = {
                  id: court.id,
                  status: court.status,
                  openTime: court.openTime,
                  closeTime: court.closeTime,
                };
                const { state, bookingIds } = computeCellState(gridCourt, hour, gridBookings, now);
                const badge = bookingIds.length > 1 ? ` ${bookingIds.length}` : "";
                return (
                  <td key={court.id} className="border-b p-1">
                    <button
                      type="button"
                      disabled={state === "unavailable"}
                      onClick={() => onCellClick(court, hour, state, bookingIds)}
                      className={`flex h-10 w-full items-center justify-center rounded-md text-xs font-medium ${STATE_CLASS[state]}`}
                    >
                      {state === "empty" ? "+" : state === "unavailable" ? "" : `🔒${badge}`}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
