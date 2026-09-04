"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  LayoutGrid,
  MapPin,
  Navigation,
  Phone,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { cn } from "@/lib/utils";
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

const CARD_CLASS =
  "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6";
const DIVIDER_CLASS = "my-4 h-px bg-gray-200 dark:bg-neutral-800";

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
        <div className="flex flex-1 items-center justify-center bg-gray-50 p-8 dark:bg-neutral-950">
          <p className="text-destructive">{error}</p>
        </div>
        <PublicFooter />
      </>
    );
  }

  if (!venue) {
    return (
      <>
        <PublicHeader />
        <div className="flex flex-1 items-center justify-center bg-gray-50 p-8 dark:bg-neutral-950">
          <p>Đang tải...</p>
        </div>
        <PublicFooter />
      </>
    );
  }

  return (
    <>
      <PublicHeader />
      <div className="flex-1 bg-gray-50 dark:bg-neutral-950">
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
          <VenueBreadcrumb venue={venue} />
          <VenueHero images={venue.images} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <VenueInfoCard venue={venue} />
            <SidebarCard venue={venue} />
          </div>
          <AvailabilityCard venue={venue} />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <VenueMapCard venue={venue} />
            <ContactCard venue={venue} />
          </div>
        </main>
      </div>
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

function VenueBreadcrumb({ venue }: { venue: PublicVenueDetail }) {
  return (
    <nav className="flex items-center gap-2 text-sm">
      <Link href="/" className="text-green-600 hover:underline dark:text-green-400">
        Trang chủ
      </Link>
      <span className="text-muted-foreground">/</span>
      <Link href="/venues" className="text-green-600 hover:underline dark:text-green-400">
        Tìm sân
      </Link>
      <span className="text-muted-foreground">/</span>
      <span className="text-muted-foreground">{venue.name}</span>
    </nav>
  );
}

function VenueHero({ images }: { images: { id: string; url: string }[] }) {
  if (images.length === 0) return null;
  const [hero, ...rest] = images;

  return (
    <div className="flex flex-col gap-2">
      <a
        href={hero.url}
        target="_blank"
        rel="noreferrer"
        className="block h-56 overflow-hidden rounded-2xl bg-muted sm:h-80"
      >
        <img src={hero.url} alt="" className="size-full object-cover" />
      </a>
      {rest.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
          {rest.map((image) => (
            <a
              key={image.id}
              href={image.url}
              target="_blank"
              rel="noreferrer"
              className="size-20 shrink-0 overflow-hidden rounded-lg bg-muted"
            >
              <img src={image.url} alt="" className="size-full object-cover" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function VenueInfoCard({ venue }: { venue: PublicVenueDetail }) {
  const today = todaysHours(venue.operatingHours);
  const openNow = isOpenNow(today);

  return (
    <div className={cn(CARD_CLASS, "lg:col-span-2")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
          Pickleball
        </span>
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

      <h1 className="mt-3 text-2xl font-bold">{venue.name}</h1>
      <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
        <MapPin className="size-4 shrink-0 text-green-600" />
        {venue.address}
        {venue.district ? `, ${venue.district}` : ""}, {venue.city}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <span className="flex items-center gap-1.5">
          <Clock className="size-4 text-green-600" />
          {today?.isOpen && today.openTime && today.closeTime
            ? `Mở cửa: ${today.openTime} – ${today.closeTime}`
            : "Đóng cửa hôm nay"}
        </span>
        <span className="flex items-center gap-1.5">
          <Phone className="size-4 text-green-600" />
          Hotline:{" "}
          <a href={`tel:${venue.phone}`} className="font-semibold text-green-700 hover:underline dark:text-green-400">
            {venue.phone}
          </a>
        </span>
        <span className="flex items-center gap-1.5">
          <LayoutGrid className="size-4 text-green-600" />
          Quy mô: {venue.courts.length} sân
        </span>
        <span className="flex items-center gap-1.5 font-medium text-green-700 dark:text-green-400">
          <CheckCircle2 className="size-4" />
          Đang hoạt động
        </span>
      </div>

      {venue.description && (
        <>
          <div className={DIVIDER_CLASS} />
          <h2 className="font-semibold">Giới thiệu</h2>
          <p className="mt-1 text-sm text-muted-foreground">{venue.description}</p>
        </>
      )}

      <div className={DIVIDER_CLASS} />
      <h2 className="flex items-center gap-1.5 font-semibold">
        <LayoutGrid className="size-4 text-green-600" />
        Danh sách sân ({venue.courts.length})
      </h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {venue.courts.map((court) => (
          <span
            key={court.id}
            className="flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-sm dark:border-neutral-800"
          >
            <MapPin className="size-3.5 text-green-600" />
            {court.name}
            {court.capacity != null && (
              <span className="text-muted-foreground">({court.capacity} người)</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function SidebarCard({ venue }: { venue: PublicVenueDetail }) {
  return (
    <div className={CARD_CLASS}>
      <p className="text-3xl font-bold text-green-700 dark:text-green-400">
        {venue.courts.length} sân
      </p>
      <div className={DIVIDER_CLASS} />
      <a
        href={`tel:${venue.phone}`}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-green-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-800"
      >
        <Phone className="size-4" />
        Gọi ngay: {venue.phone}
      </a>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Đặt cọc an toàn · Hủy trước {venue.cancellationCutoffHours}h miễn phí
      </p>
    </div>
  );
}

interface SelectedCell {
  courtId: string;
  index: number;
}

function AvailabilityCard({ venue }: { venue: PublicVenueDetail }) {
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
    <div className={CARD_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-semibold">
          <Clock className="size-4 text-green-600" />
          Lịch trống hôm nay
        </h2>
        <Input
          id="venue-date"
          type="date"
          min={today}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="w-auto"
        />
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

      {!error && slotsByCourtId && columns.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">Không có khung giờ nào.</p>
      )}

      {!error && slotsByCourtId && columns.length > 0 && (
        <>
          <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200 dark:border-neutral-800">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 dark:border-neutral-800 dark:bg-neutral-900">
                  <th className="sticky left-0 bg-gray-50 p-2 text-left font-medium dark:bg-neutral-900">
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
                    <tr key={court.id} className="border-b border-gray-100 last:border-b-0 dark:border-neutral-800">
                      <td className="sticky left-0 whitespace-nowrap bg-white p-2 font-medium dark:bg-neutral-900">
                        <MapPin className="mr-1 inline size-3.5 text-green-600" />
                        {court.name}
                        <span className="ml-1.5 font-semibold text-green-700 dark:text-green-400">
                          {court.pricePerHour.toLocaleString("vi-VN")}đ/giờ
                        </span>
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
                              className={`w-full rounded-lg border px-2 py-1.5 text-xs whitespace-nowrap transition-colors ${
                                slot.isBooked
                                  ? "cursor-not-allowed border-gray-200 bg-gray-100 text-muted-foreground dark:border-neutral-800 dark:bg-neutral-800"
                                  : isSelected
                                    ? "border-green-700 bg-green-700 text-white"
                                    : "border-gray-200 hover:border-green-600 hover:bg-green-50 dark:border-neutral-800 dark:hover:bg-green-950"
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

          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm border border-gray-200 dark:border-neutral-800" />
              Trống
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded-sm bg-gray-200 dark:bg-neutral-800" />
              Đã đặt
            </span>
          </div>
        </>
      )}

      {selectedSlots && selected && maxDuration > 0 && (
        <div className="mt-3 rounded-lg border border-gray-200 p-3 text-sm dark:border-neutral-800">
          <p className="font-medium">
            {venue.courts.find((c) => c.id === selected.courtId)?.name} ·{" "}
            {selectedSlots[selected.index].start}–
            {selectedSlots[selected.index + durationSlots - 1].end}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Label htmlFor="duration">Số giờ chơi</Label>
            <select
              id="duration"
              className="rounded-md border border-gray-200 px-2 py-1 text-sm dark:border-neutral-800"
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
          <button
            type="button"
            disabled={submitting}
            onClick={handleConfirmBooking}
            className="mt-3 w-full rounded-full bg-green-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Xác nhận đặt sân
          </button>
        </div>
      )}
    </div>
  );
}

function VenueMapCard({ venue }: { venue: PublicVenueDetail }) {
  if (venue.latitude == null || venue.longitude == null) return null;

  return (
    <div className={cn(CARD_CLASS, "lg:col-span-2")}>
      <h2 className="flex items-center gap-1.5 font-semibold">
        <MapPin className="size-4 text-green-600" />
        Vị trí
      </h2>
      <div className="mt-3 overflow-hidden rounded-xl">
        <VenueLocationMap latitude={venue.latitude} longitude={venue.longitude} />
      </div>
      <div className="mt-3 flex gap-2">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-green-700 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
        >
          <Navigation className="size-4" />
          Chỉ đường
        </a>
        <Link
          href={`/ban-do?venueId=${venue.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
        >
          <LayoutGrid className="size-4" />
          Xem bản đồ
        </Link>
      </div>
    </div>
  );
}

function ContactCard({ venue }: { venue: PublicVenueDetail }) {
  const orderedHours = orderForDisplay(venue.operatingHours);

  return (
    <div className={CARD_CLASS}>
      <h2 className="font-semibold">Thông tin liên hệ</h2>
      <a
        href={`tel:${venue.phone}`}
        className="mt-3 flex items-center gap-1.5 text-sm hover:underline"
      >
        <Phone className="size-4 text-green-600" />
        {venue.phone}
      </a>
      <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
        <MapPin className="size-4 shrink-0 text-green-600" />
        {venue.address}
        {venue.district ? `, ${venue.district}` : ""}, {venue.city}
      </p>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {orderedHours.map((row) => (
            <tr key={row.dayOfWeek}>
              <td className="py-0.5 pr-4 font-medium">{DAY_LABELS[row.dayOfWeek]}</td>
              <td className="py-0.5 text-right text-muted-foreground">
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
