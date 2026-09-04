"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, MapPin, Navigation, Phone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { getSubmitErrorMessage } from "@/lib/error-message";
import {
  computeMaxConsecutiveDuration,
  type AvailabilitySlot,
} from "@/lib/slot-selection";
import { buildTimeColumns, findSlotIndex, type GridColumn } from "./availability-grid";
import { DAY_LABELS, orderForDisplay } from "@/app/owner/settings/operating-hours-format";

const VenueLocationMap = dynamic(() => import("./venue-location-map"), {
  ssr: false,
});

interface OperatingHourItem {
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}

interface PublicCourt {
  id: string;
  name: string;
  pricePerHour: number;
  openTime: string;
  closeTime: string;
  capacity: number | null;
}

interface PublicVenueDetail {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string | null;
  phone: string;
  description: string | null;
  cancellationCutoffHours: number;
  logoUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  images: { id: string; url: string }[];
  courts: PublicCourt[];
  operatingHours: OperatingHourItem[];
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
      <>
        <PublicHeader />
        <main className="flex flex-1 items-center justify-center p-8">
          <p className="text-destructive">{error}</p>
        </main>
        <PublicFooter />
      </>
    );
  }

  if (!venue) {
    return (
      <>
        <PublicHeader />
        <main className="flex flex-1 items-center justify-center p-8">
          <p>Đang tải...</p>
        </main>
        <PublicFooter />
      </>
    );
  }

  return (
    <>
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-8 p-4 sm:p-8">
        <VenueHeader venue={venue} />
        <VenueGallery images={venue.images} />
        <AvailabilityGrid venue={venue} />
        <VenueMapSection venue={venue} />
        <ContactSection venue={venue} />
      </main>
      <PublicFooter />
    </>
  );
}

function todaysHours(operatingHours: OperatingHourItem[]): OperatingHourItem | undefined {
  return operatingHours.find((h) => h.dayOfWeek === new Date().getDay());
}

function isOpenNow(today: OperatingHourItem | undefined): boolean {
  if (!today || !today.isOpen || !today.openTime || !today.closeTime) return false;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const [openH, openM] = today.openTime.split(":").map(Number);
  const [closeH, closeM] = today.closeTime.split(":").map(Number);
  return nowMinutes >= openH * 60 + openM && nowMinutes < closeH * 60 + closeM;
}

function VenueHeader({ venue }: { venue: PublicVenueDetail }) {
  const today = todaysHours(venue.operatingHours);
  const openNow = isOpenNow(today);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{venue.name}</h1>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            openNow
              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {openNow ? "Đang mở cửa" : "Đã đóng cửa"}
        </span>
      </div>
      <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
        <MapPin className="size-4 shrink-0" />
        {venue.address}
        {venue.district ? `, ${venue.district}` : ""}, {venue.city}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Clock className="size-4 shrink-0" />
        {today?.isOpen && today.openTime && today.closeTime
          ? `${today.openTime}–${today.closeTime} hôm nay`
          : "Đóng cửa hôm nay"}
        {" · "}
        {venue.courts.length} sân
      </p>
      {venue.description && <p className="mt-3">{venue.description}</p>}
    </div>
  );
}

function VenueGallery({ images }: { images: { id: string; url: string }[] }) {
  if (images.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {images.map((image) => (
        <a
          key={image.id}
          href={image.url}
          target="_blank"
          rel="noreferrer"
          className="aspect-square overflow-hidden rounded-lg bg-muted"
        >
          <img src={image.url} alt="" className="size-full object-cover" />
        </a>
      ))}
    </div>
  );
}

interface SelectedCell {
  courtId: string;
  index: number;
}

function AvailabilityGrid({ venue }: { venue: PublicVenueDetail }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [slotsByCourtId, setSlotsByCourtId] = useState<Record<
    string,
    AvailabilitySlot[]
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedCell | null>(null);
  const [durationSlots, setDurationSlots] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  async function loadSlots() {
    setError(null);
    const results = await Promise.all(
      venue.courts.map(async (court) => {
        const res = await fetch(
          `/api/bookings/availability?courtId=${court.id}&date=${date}`,
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.message ?? "Không thể tải khung giờ.");
        }
        return [court.id, data as AvailabilitySlot[]] as const;
      }),
    ).catch((err: Error) => {
      setError(err.message);
      return null;
    });
    if (results) {
      setSlotsByCourtId(Object.fromEntries(results));
    } else {
      setSlotsByCourtId(null);
    }
  }

  useEffect(() => {
    setSelected(null);
    setDurationSlots(1);
    loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, venue.id]);

  const columns = useMemo(
    () => (slotsByCourtId ? buildTimeColumns(slotsByCourtId) : []),
    [slotsByCourtId],
  );

  function handleCellClick(courtId: string, column: GridColumn) {
    if (!slotsByCourtId) return;
    const index = findSlotIndex(slotsByCourtId[courtId], column);
    if (index === -1 || slotsByCourtId[courtId][index].isBooked) return;
    if (selected?.courtId === courtId && selected.index === index) {
      setSelected(null);
      return;
    }
    setSelected({ courtId, index });
    setDurationSlots(1);
  }

  async function handleConfirmBooking() {
    if (!slotsByCourtId || !selected) return;
    const slots = slotsByCourtId[selected.courtId];
    setSubmitting(true);
    const startTime = slots[selected.index].start;
    const endTime = slots[selected.index + durationSlots - 1].end;
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courtId: selected.courtId,
        date,
        startTime,
        endTime,
      }),
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
      setSelected(null);
      return;
    }

    toast.success("Đặt sân thành công");
    setSelected(null);
    setDurationSlots(1);
    loadSlots();
  }

  const selectedSlots = selected ? slotsByCourtId?.[selected.courtId] : null;
  const maxDuration =
    selectedSlots && selected
      ? computeMaxConsecutiveDuration(selectedSlots, selected.index)
      : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Label htmlFor="venue-date">Chọn ngày</Label>
        <Input
          id="venue-date"
          type="date"
          min={today}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="w-auto"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!error && slotsByCourtId && columns.length === 0 && (
        <p className="text-sm text-muted-foreground">Không có khung giờ nào.</p>
      )}

      {!error && slotsByCourtId && columns.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="sticky left-0 bg-muted/50 p-2 text-left font-medium">
                  Sân
                </th>
                {columns.map((column) => (
                  <th
                    key={`${column.start}-${column.end}`}
                    className="whitespace-nowrap p-2 text-left font-medium"
                  >
                    {column.start}–{column.end}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {venue.courts.map((court) => {
                const slots = slotsByCourtId[court.id] ?? [];
                return (
                  <tr key={court.id} className="border-b last:border-b-0">
                    <td className="sticky left-0 whitespace-nowrap bg-background p-2 font-medium">
                      {court.name}
                      {court.capacity != null && (
                        <span className="ml-1 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                          <Users className="size-3" />
                          {court.capacity} người
                        </span>
                      )}
                    </td>
                    {columns.map((column) => {
                      const index = findSlotIndex(slots, column);
                      if (index === -1) {
                        return (
                          <td
                            key={`${column.start}-${column.end}`}
                            className="p-1"
                          />
                        );
                      }
                      const slot = slots[index];
                      const isSelected =
                        selected?.courtId === court.id &&
                        index >= selected.index &&
                        index < selected.index + durationSlots;
                      return (
                        <td key={`${column.start}-${column.end}`} className="p-1">
                          <button
                            type="button"
                            disabled={slot.isBooked}
                            onClick={() => handleCellClick(court.id, column)}
                            className={`w-full rounded-md border px-2 py-1 text-xs whitespace-nowrap ${
                              slot.isBooked
                                ? "cursor-not-allowed opacity-50"
                                : isSelected
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "hover:bg-accent"
                            }`}
                          >
                            {slot.price.toLocaleString("vi-VN")}đ
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedSlots && selected && maxDuration > 0 && (
        <div className="rounded-md border p-3 text-sm">
          <p className="font-medium">
            {venue.courts.find((c) => c.id === selected.courtId)?.name} ·{" "}
            {selectedSlots[selected.index].start}–
            {selectedSlots[selected.index + durationSlots - 1].end}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Label htmlFor="duration">Số giờ chơi</Label>
            <select
              id="duration"
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
          <p className="mt-2">
            Tổng:{" "}
            {selectedSlots
              .slice(selected.index, selected.index + durationSlots)
              .reduce((sum, s) => sum + s.price, 0)
              .toLocaleString("vi-VN")}
            đ
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Hủy trước {venue.cancellationCutoffHours}h miễn phí
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
    </div>
  );
}

function VenueMapSection({ venue }: { venue: PublicVenueDetail }) {
  if (venue.latitude == null || venue.longitude == null) return null;

  return (
    <div className="flex flex-col gap-3">
      <VenueLocationMap latitude={venue.latitude} longitude={venue.longitude} />
      <div className="flex gap-2">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <Navigation className="size-4" />
          Chỉ đường
        </a>
        <Link
          href={`/ban-do?venueId=${venue.id}`}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
        >
          <MapPin className="size-4" />
          Xem bản đồ
        </Link>
      </div>
    </div>
  );
}

function ContactSection({ venue }: { venue: PublicVenueDetail }) {
  const orderedHours = orderForDisplay(venue.operatingHours);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="text-lg font-semibold">Thông tin liên hệ</h2>
      <a
        href={`tel:${venue.phone}`}
        className="flex items-center gap-1.5 text-sm hover:underline"
      >
        <Phone className="size-4" />
        {venue.phone}
      </a>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <MapPin className="size-4 shrink-0" />
        {venue.address}
        {venue.district ? `, ${venue.district}` : ""}, {venue.city}
      </p>
      <table className="mt-2 w-fit text-sm">
        <tbody>
          {orderedHours.map((row) => (
            <tr key={row.dayOfWeek}>
              <td className="pr-4 py-0.5 font-medium">{DAY_LABELS[row.dayOfWeek]}</td>
              <td className="py-0.5 text-muted-foreground">
                {row.isOpen && row.openTime && row.closeTime
                  ? `${row.openTime}–${row.closeTime}`
                  : "Đóng cửa"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
