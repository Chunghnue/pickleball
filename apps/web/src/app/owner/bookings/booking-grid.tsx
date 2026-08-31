"use client";

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
  empty:
    "border border-dashed border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950 dark:text-green-300",
  booked:
    "border border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300",
  playing:
    "border border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300",
  recurring:
    "border border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-300",
  unavailable: "border border-transparent bg-muted text-muted-foreground cursor-not-allowed",
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
          <tr>
            <th className="w-16 border-b p-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Giờ
            </th>
            <th colSpan={courts.length} className="border-b p-2 text-left">
              <div className="flex flex-wrap gap-6">
                {courts.map((court) => (
                  <span
                    key={court.id}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold"
                  >
                    <span className="size-2 shrink-0 rounded-full bg-pink-500" />
                    {court.name}
                  </span>
                ))}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {hours.map((hour) => (
            <tr key={hour}>
              <td
                className={`w-16 border-b p-2 ${
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
                const occupantLabel =
                  bookingIds.length === 1
                    ? (bookings.find((b) => b.id === bookingIds[0])?.customerName ?? "")
                    : bookingIds.length > 1
                      ? String(bookingIds.length)
                      : "";
                return (
                  <td key={court.id} className="border-b p-1">
                    <button
                      type="button"
                      disabled={state === "unavailable"}
                      onClick={() => onCellClick(court, hour, state, bookingIds)}
                      className={`flex h-12 w-full items-center justify-center gap-1 rounded-md px-2 text-xs font-medium ${STATE_CLASS[state]}`}
                    >
                      {state === "empty" ? (
                        "+"
                      ) : state === "unavailable" ? (
                        ""
                      ) : (
                        <>
                          🔒 <span className="truncate">{occupantLabel}</span>
                        </>
                      )}
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
