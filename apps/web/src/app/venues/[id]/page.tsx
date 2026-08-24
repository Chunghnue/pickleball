"use client";

import { useEffect, useState } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { getSubmitErrorMessage } from "@/lib/error-message";
import {
  computeMaxConsecutiveDuration,
  type AvailabilitySlot,
} from "@/lib/slot-selection";

interface PublicCourt {
  id: string;
  name: string;
  pricePerHour: number;
  openTime: string;
  closeTime: string;
}

interface PublicVenueDetail {
  id: string;
  name: string;
  address: string;
  city: string;
  description: string | null;
  images: { id: string; url: string }[];
  courts: PublicCourt[];
}

export default function VenueDetailPage() {
  const params = useParams<{ id: string }>();
  const [venue, setVenue] = useState<PublicVenueDetail | null | "not-found">(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/venues/${params.id}`).then(async (res) => {
      if (res.status === 404) {
        setVenue("not-found");
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? "Không thể tải thông tin sân.");
        return;
      }
      setVenue(data as PublicVenueDetail);
    });
  }, [params.id]);

  if (venue === "not-found") {
    notFound();
  }

  if (error) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p className="text-destructive">{error}</p>
      </main>
    );
  }

  if (!venue) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p>Đang tải...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-bold">{venue.name}</h1>
        <p className="text-muted-foreground">
          {venue.address}, {venue.city}
        </p>
        {venue.description && <p className="mt-2">{venue.description}</p>}
      </div>

      {venue.images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {venue.images.map((image) => (
            <a
              key={image.id}
              href={image.url}
              target="_blank"
              rel="noreferrer"
              className="truncate text-sm underline"
            >
              {image.url}
            </a>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-4">
        {venue.courts.map((court) => (
          <CourtSlots key={court.id} court={court} />
        ))}
      </div>
    </main>
  );
}

function CourtSlots({ court }: { court: PublicCourt }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [durationSlots, setDurationSlots] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  async function loadSlots() {
    setError(null);
    const res = await fetch(
      `/api/bookings/availability?courtId=${court.id}&date=${date}`,
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.message ?? "Không thể tải khung giờ.");
      setSlots(null);
      return;
    }
    setSlots(data);
  }

  useEffect(() => {
    setSelectedIndex(null);
    setDurationSlots(1);
    loadSlots();
  }, [court.id, date]);

  function handleSlotClick(index: number) {
    if (!slots || slots[index].isBooked) return;
    if (selectedIndex === index) {
      setSelectedIndex(null);
      return;
    }
    setSelectedIndex(index);
    setDurationSlots(1);
  }

  async function handleConfirmBooking() {
    if (!slots || selectedIndex === null) return;
    setSubmitting(true);
    const startTime = slots[selectedIndex].start;
    const endTime = slots[selectedIndex + durationSlots - 1].end;
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courtId: court.id, date, startTime, endTime }),
    });
    setSubmitting(false);

    if (response.status === 401) {
      router.push(
        `/login?returnTo=${encodeURIComponent(`/venues/${params.id}`)}`,
      );
      return;
    }

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      loadSlots();
      setSelectedIndex(null);
      return;
    }

    toast.success("Đặt sân thành công");
    setSelectedIndex(null);
    setDurationSlots(1);
    loadSlots();
  }

  const maxDuration =
    slots && selectedIndex !== null
      ? computeMaxConsecutiveDuration(slots, selectedIndex)
      : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{court.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {court.pricePerHour.toLocaleString("vi-VN")}đ/giờ ·{" "}
          {court.openTime.slice(0, 5)}–{court.closeTime.slice(0, 5)}
        </p>
        <div className="space-y-2">
          <Label htmlFor={`date-${court.id}`}>Chọn ngày</Label>
          <Input
            id={`date-${court.id}`}
            type="date"
            min={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!error && slots && slots.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Không có khung giờ nào.
          </p>
        )}
        {!error && slots && slots.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {slots.map((slot, index) => {
              const isSelected =
                selectedIndex !== null &&
                index >= selectedIndex &&
                index < selectedIndex + durationSlots;
              return (
                <button
                  key={slot.start}
                  type="button"
                  disabled={slot.isBooked}
                  onClick={() => handleSlotClick(index)}
                  className={`rounded-md border px-2.5 py-1 text-sm ${
                    slot.isBooked
                      ? "cursor-not-allowed opacity-50"
                      : isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                  }`}
                >
                  {slot.start}–{slot.end} · {slot.price.toLocaleString("vi-VN")}đ
                </button>
              );
            })}
          </div>
        )}
        {slots && selectedIndex !== null && maxDuration > 0 && (
          <div className="flex items-center gap-2">
            <Label htmlFor={`duration-${court.id}`}>Số giờ chơi</Label>
            <select
              id={`duration-${court.id}`}
              className="rounded-md border px-2 py-1 text-sm"
              value={durationSlots}
              onChange={(event) => setDurationSlots(Number(event.target.value))}
            >
              {Array.from({ length: maxDuration }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
        {slots && selectedIndex !== null && maxDuration > 0 && (
          <div className="rounded-md border p-3 text-sm">
            <p>
              {slots[selectedIndex].start}–
              {slots[selectedIndex + durationSlots - 1].end} ·{" "}
              {slots
                .slice(selectedIndex, selectedIndex + durationSlots)
                .reduce((sum, s) => sum + s.price, 0)
                .toLocaleString("vi-VN")}
              đ
            </p>
            <Button
              size="sm"
              className="mt-2"
              disabled={submitting}
              onClick={handleConfirmBooking}
            >
              Xác nhận đặt sân
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
