"use client";

import { useCallback, useEffect, useState } from "react";
import { useBranch, ALL_BRANCHES_ID } from "@/lib/branch-context";
import { WeekDayNav } from "./week-day-nav";
import type { Court } from "../types";
import type { OwnerBooking } from "./types";

interface VenueOption {
  id: string;
  name: string;
}

const POLL_INTERVAL_MS = 60_000;

function todayString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = (now.getMonth() + 1).toString().padStart(2, "0");
  const d = now.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function OwnerBookingsPage() {
  const { selectedVenueId } = useBranch();
  const [venues, setVenues] = useState<VenueOption[] | null>(null);
  const [venueId, setVenueId] = useState<string>("");
  const [courts, setCourts] = useState<Court[]>([]);
  const [bookings, setBookings] = useState<OwnerBooking[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayString());

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

  const loadBookings = useCallback(() => {
    if (!venueId) return;
    fetch(`/api/venues/mine/${venueId}/bookings?date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => setBookings(Array.isArray(data) ? data : []));
  }, [venueId, selectedDate]);

  useEffect(() => {
    loadCourts();
  }, [loadCourts]);

  useEffect(() => {
    loadBookings();
    const interval = setInterval(loadBookings, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadBookings]);

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Đặt lịch</h1>
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
      </div>

      <WeekDayNav selectedDate={selectedDate} onSelectDate={setSelectedDate} />

      <p className="text-sm text-muted-foreground">
        {courts.length} sân · {bookings.length} lịch đặt ngày {selectedDate}
      </p>
    </main>
  );
}
