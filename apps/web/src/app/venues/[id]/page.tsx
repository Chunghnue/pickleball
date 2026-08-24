"use client";

import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  useEffect(() => {
    fetch(`/api/venues/${params.id}`).then(async (res) => {
      if (res.status === 404) {
        setVenue("not-found");
        return;
      }
      setVenue((await res.json()) as PublicVenueDetail);
    });
  }, [params.id]);

  if (venue === "not-found") {
    notFound();
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
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [slots, setSlots] = useState<
    { start: string; end: string; price: number }[] | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    fetch(`/api/courts/${court.id}/slots?date=${date}`).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? "Không thể tải khung giờ.");
        setSlots(null);
        return;
      }
      setSlots(data);
    });
  }, [court.id, date]);

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
            {slots.map((slot) => (
              <span
                key={slot.start}
                className="rounded-md border px-2.5 py-1 text-sm"
              >
                {slot.start}–{slot.end} · {slot.price.toLocaleString("vi-VN")}đ
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
