"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Pointer, RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBranch, ALL_BRANCHES_ID } from "@/lib/branch-context";
import { buildHourAxis, computeCellState, computeMaxConsecutiveHours } from "@/lib/booking-grid";
import { formatHeaderDate } from "@/lib/format-datetime";
import { WeekDayNav } from "./week-day-nav";
import { StatusBar } from "./status-bar";
import { BookingGrid } from "./booking-grid";
import { QuickBookDialog } from "./quick-book-dialog";
import { BookingDetailDialog } from "./booking-detail-dialog";
import type { Court } from "../types";
import type { OwnerBooking } from "./types";

interface VenueOption {
  id: string;
  name: string;
}

const POLL_INTERVAL_MS = 60_000;

function formatDateValue(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parsePageDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function todayString(): string {
  return formatDateValue(new Date());
}

export default function OwnerBookingsPage() {
  const { selectedVenueId } = useBranch();
  const [venues, setVenues] = useState<VenueOption[] | null>(null);
  const [venueId, setVenueId] = useState<string>("");
  const [courts, setCourts] = useState<Court[]>([]);
  const [bookings, setBookings] = useState<OwnerBooking[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayString());
  const [quickBook, setQuickBook] = useState<{ courtId?: string; hour?: string; max?: number } | null>(
    null,
  );
  const [detail, setDetail] = useState<OwnerBooking | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetch("/api/venues/mine")
      .then((res) => res.json())
      .then((data) => setVenues(Array.isArray(data) ? data : []));
  }, []);

  useEffect(() => {
    if (selectedVenueId !== ALL_BRANCHES_ID) {
      setVenueId(selectedVenueId);
      return;
    }
    if (venues && venues.length > 0) {
      setVenueId((current) => current || venues[0].id);
    }
  }, [selectedVenueId, venues]);

  const loadCourts = useCallback(() => {
    if (!venueId) return;
    fetch(`/api/venues/mine/${venueId}/courts`)
      .then((res) => res.json())
      .then((data) => setCourts(Array.isArray(data) ? data : []));
  }, [venueId]);

  const loadBookings = useCallback(
    (showToast?: boolean) => {
      if (!venueId) return;
      setRefreshing(true);
      fetch(`/api/venues/mine/${venueId}/bookings?date=${selectedDate}`, { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => {
          setBookings(Array.isArray(data) ? data : []);
          if (showToast) toast.success("Đã cập nhật!");
        })
        .finally(() => setRefreshing(false));
    },
    [venueId, selectedDate],
  );

  useEffect(() => {
    loadCourts();
  }, [loadCourts]);

  useEffect(() => {
    loadBookings();
    const interval = setInterval(loadBookings, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadBookings]);

  function shiftDate(deltaDays: number) {
    setSelectedDate((current) => {
      const date = parsePageDate(current);
      date.setDate(date.getDate() + deltaDays);
      return formatDateValue(date);
    });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target ? ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) : false;
      if (isTyping || quickBook !== null || detail !== null) return;
      if (event.key === "ArrowLeft") {
        shiftDate(-1);
      } else if (event.key === "ArrowRight") {
        shiftDate(1);
      } else if (event.key.toLowerCase() === "t") {
        setSelectedDate(todayString());
      } else if (event.key.toLowerCase() === "n") {
        setQuickBook({});
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickBook, detail]);

  const now = selectedDate === todayString() ? new Date() : null;
  const activeCourts = courts.filter((c) => c.status === "active");

  const counts = useMemo(() => {
    const hours = buildHourAxis(
      activeCourts.map((c) => ({ id: c.id, status: c.status, openTime: c.openTime, closeTime: c.closeTime })),
    );
    const gridBookings = bookings.map((b) => ({
      id: b.id,
      courtId: b.courtId,
      startTime: b.startTime,
      endTime: b.endTime,
      status: b.status,
      recurringScheduleId: b.recurringScheduleId,
    }));
    let empty = 0;
    let booked = 0;
    let playing = 0;
    for (const court of activeCourts) {
      for (const hour of hours) {
        const { state } = computeCellState(
          { id: court.id, status: court.status, openTime: court.openTime, closeTime: court.closeTime },
          hour,
          gridBookings,
          now,
        );
        if (state === "empty") empty += 1;
        else if (state === "playing") playing += 1;
        else if (state === "booked" || state === "recurring") booked += 1;
      }
    }
    return { empty, booked, playing, total: empty + booked + playing };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCourts, bookings, now]);

  function handleCellClick(
    court: Court,
    hour: string,
    state: "empty" | "booked" | "playing" | "recurring" | "unavailable",
    bookingIds: string[],
  ) {
    if (state === "empty") {
      const gridBookings = bookings.map((b) => ({
        id: b.id,
        courtId: b.courtId,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        recurringScheduleId: b.recurringScheduleId,
      }));
      const max = computeMaxConsecutiveHours(
        { id: court.id, status: court.status, openTime: court.openTime, closeTime: court.closeTime },
        hour,
        gridBookings,
      );
      setQuickBook({ courtId: court.id, hour, max });
      return;
    }
    if (state === "unavailable") return;
    const found = bookings.find((b) => bookingIds.includes(b.id));
    if (found) setDetail(found);
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Lịch đặt sân</h1>
          <p className="text-sm text-muted-foreground">
            {formatHeaderDate(parsePageDate(selectedDate))} · {activeCourts.length} sân
          </p>
        </div>
        <div className="flex items-center gap-2">
          {venues && venues.length > 1 && (
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="h-9 rounded-lg border px-2.5 text-sm"
            >
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => loadBookings(true)}
            disabled={refreshing}
            aria-label="Làm mới"
            className="size-10 rounded-xl border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-950/40"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button
            type="button"
            onClick={() => setQuickBook({})}
            className="h-10 gap-2 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
          >
            <Zap className="size-4 fill-white" />
            Đặt nhanh
          </Button>
        </div>
      </div>

      <StatusBar
        bookedCount={counts.booked}
        emptyCount={counts.empty}
        playingCount={counts.playing}
        totalCount={counts.total}
      />

      <WeekDayNav
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        courtCount={activeCourts.length}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-1.5">
          <Pointer className="size-3.5 text-blue-600" />
          <span>
            Click ô <span className="font-medium text-green-600">trống</span> để đặt
          </span>
          <Kbd>←</Kbd>
          <Kbd>→</Kbd>
          <span>chuyển ngày</span>
          <Kbd>T</Kbd>
          <span>hôm nay</span>
          <Kbd>N</Kbd>
          <span>đặt nhanh</span>
        </div>
        <div className="flex items-center gap-1.5">
          <RefreshCw className="size-3.5" />
          <span>Tự cập nhật mỗi 60s</span>
        </div>
      </div>

      <BookingGrid courts={courts} bookings={bookings} now={now} onCellClick={handleCellClick} />

      <QuickBookDialog
        open={quickBook !== null}
        onOpenChange={(open) => !open && setQuickBook(null)}
        venueId={venueId}
        date={selectedDate}
        courts={courts}
        initialCourtId={quickBook?.courtId}
        initialHour={quickBook?.hour}
        maxDurationHours={quickBook?.max}
        onCreated={() => {
          setQuickBook(null);
          loadBookings();
        }}
      />

      <BookingDetailDialog
        open={detail !== null}
        onOpenChange={(open) => !open && setDetail(null)}
        venueId={venueId}
        booking={detail}
        court={courts.find((c) => c.id === detail?.courtId) ?? null}
        onUpdated={(updated) => {
          setDetail(updated);
          setBookings((current) => current.map((b) => (b.id === updated.id ? updated : b)));
        }}
      />
    </main>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium">
      {children}
    </kbd>
  );
}
