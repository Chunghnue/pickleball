"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2,
  Clock,
  Crown,
  LayoutGrid,
  Mail,
  Map as MapIcon,
  MapPin,
  Navigation,
  Phone,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { getSubmitErrorMessage } from "@/lib/error-message";
import {
  computeMaxConsecutiveDuration,
  type AvailabilitySlot,
} from "@/lib/slot-selection";
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
  email: string | null;
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
            <div className="flex flex-col gap-4 lg:col-span-2">
              <VenueInfoCard venue={venue} />
              <AvailabilityCard venue={venue} />
              <VenueMapCard venue={venue} />
            </div>
            <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
              <SidebarCard venue={venue} />
              <ContactCard venue={venue} />
            </div>
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

function uniformHours(operatingHours: OperatingHourItem[]): OperatingHourItem | null {
  const [first, ...rest] = operatingHours;
  if (!first) return null;
  const allSame = rest.every(
    (h) =>
      h.isOpen === first.isOpen &&
      h.openTime === first.openTime &&
      h.closeTime === first.closeTime,
  );
  return allSame ? first : null;
}

function isVipCourt(name: string): boolean {
  return /\bvip\b/i.test(name);
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
    <div className={CARD_CLASS}>
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
        {venue.courts.map((court) => {
          const vip = isVipCourt(court.name);
          return (
            <span
              key={court.id}
              className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm ${
                vip
                  ? "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  : "border-gray-200 dark:border-neutral-800"
              }`}
            >
              {vip ? (
                <Crown className="size-3.5 text-amber-600 dark:text-amber-400" />
              ) : (
                <MapPin className="size-3.5 text-green-600" />
              )}
              {court.name}
              {court.capacity != null && (
                <span className={vip ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}>
                  ({court.capacity} người)
                </span>
              )}
            </span>
          );
        })}
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

  function handleCellClick(courtId: string, index: number) {
    const slots = slotsByCourtId?.[courtId];
    if (!slots || slots[index].isBooked) return;
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
  const hasAnySlots =
    slotsByCourtId != null &&
    Object.values(slotsByCourtId).some((slots) => slots.length > 0);

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

      {!error && slotsByCourtId && !hasAnySlots && (
        <p className="mt-3 text-sm text-muted-foreground">Không có khung giờ nào.</p>
      )}

      {!error && slotsByCourtId && hasAnySlots && (
        <div className="mt-4 flex flex-col gap-5">
          {venue.courts.map((court) => {
            const slots = slotsByCourtId[court.id] ?? [];
            if (slots.length === 0) return null;
            const vip = isVipCourt(court.name);
            return (
              <div
                key={court.id}
                className={
                  vip
                    ? "rounded-xl border border-amber-200 bg-amber-50/40 p-3 dark:border-amber-900 dark:bg-amber-950/20"
                    : undefined
                }
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-medium">
                    {vip ? (
                      <Crown className="size-3.5 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <MapPin className="size-3.5 text-green-600" />
                    )}
                    {court.name}
                    {vip && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-700 uppercase dark:bg-amber-900 dark:text-amber-300">
                        VIP
                      </span>
                    )}
                    {court.capacity != null && (
                      <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                        <Users className="size-3" />
                        {court.capacity} người
                      </span>
                    )}
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      vip ? "text-amber-700 dark:text-amber-400" : "text-green-700 dark:text-green-400"
                    }`}
                  >
                    {court.pricePerHour.toLocaleString("vi-VN")}đ/giờ
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {slots.map((slot, index) => {
                    const isSelected =
                      selected?.courtId === court.id &&
                      index >= selected.index &&
                      index < selected.index + durationSlots;
                    return (
                      <button
                        key={slot.start}
                        type="button"
                        disabled={slot.isBooked}
                        onClick={() => handleCellClick(court.id, index)}
                        className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                          slot.isBooked
                            ? "cursor-not-allowed border-gray-200 bg-gray-100 text-muted-foreground dark:border-neutral-800 dark:bg-neutral-800"
                            : isSelected
                              ? "border-green-700 bg-green-700 text-white"
                              : vip
                                ? "border-amber-200 bg-white hover:border-amber-500 hover:bg-amber-50 dark:border-amber-900 dark:bg-transparent dark:hover:bg-amber-950"
                                : "border-gray-200 hover:border-green-600 hover:bg-green-50 dark:border-neutral-800 dark:hover:bg-green-950"
                        }`}
                      >
                        {slot.start}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!error && slotsByCourtId && hasAnySlots && (
        <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm border border-gray-200 dark:border-neutral-800" />
            Trống
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-sm bg-gray-200 dark:bg-neutral-800" />
            Đã đặt
          </span>
        </div>
      )}

      {selectedSlots && selected && maxDuration > 0 && (
        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/50">
          <p className="text-base font-semibold">
            {venue.courts.find((c) => c.id === selected.courtId)?.name} ·{" "}
            {selectedSlots[selected.index].start}–
            {selectedSlots[selected.index + durationSlots - 1].end}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Label htmlFor="duration" className="text-sm text-muted-foreground">
              Số giờ chơi
            </Label>
            <select
              id="duration"
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
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
          <p className="mt-3 text-lg font-bold">
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
        </div>
      )}

      {!error && slotsByCourtId && hasAnySlots && (
        <button
          type="button"
          disabled={!selected || submitting}
          onClick={handleConfirmBooking}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-green-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-muted-foreground dark:disabled:bg-neutral-800"
        >
          {selected ? "Xác nhận đặt sân" : "Chọn khung giờ để đặt sân"}
        </button>
      )}
    </div>
  );
}

function VenueMapCard({ venue }: { venue: PublicVenueDetail }) {
  if (venue.latitude == null || venue.longitude == null) return null;

  return (
    <div className={CARD_CLASS}>
      <h2 className="flex items-center gap-1.5 font-semibold">
        <MapIcon className="size-4 text-green-600" />
        Vị trí
      </h2>
      <div className="mt-3 overflow-hidden rounded-xl">
        <VenueLocationMap
          latitude={venue.latitude}
          longitude={venue.longitude}
          name={venue.name}
        />
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
  const uniform = uniformHours(venue.operatingHours);

  return (
    <div className={CARD_CLASS}>
      <h2 className="font-semibold">Thông tin liên hệ</h2>
      <div className="mt-3 flex flex-col gap-2 text-sm">
        <a href={`tel:${venue.phone}`} className="flex items-center gap-1.5 hover:underline">
          <Phone className="size-4 text-green-600" />
          {venue.phone}
        </a>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          <MapPin className="size-4 shrink-0 text-green-600" />
          {venue.address}
          {venue.district ? `, ${venue.district}` : ""}, {venue.city}
        </p>
        {uniform ? (
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="size-4 shrink-0 text-green-600" />
            {uniform.isOpen && uniform.openTime && uniform.closeTime
              ? `${uniform.openTime} – ${uniform.closeTime} hàng ngày`
              : "Đóng cửa"}
          </p>
        ) : (
          <div className="flex items-start gap-1.5 text-muted-foreground">
            <Clock className="mt-0.5 size-4 shrink-0 text-green-600" />
            <div className="flex flex-1 flex-col gap-0.5">
              {orderedHours.map((row) => (
                <div key={row.dayOfWeek} className="flex items-center justify-between gap-4">
                  <span className="font-medium text-foreground">{DAY_LABELS[row.dayOfWeek]}</span>
                  <span>
                    {row.isOpen && row.openTime && row.closeTime
                      ? `${row.openTime}–${row.closeTime}`
                      : "Đóng cửa"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {venue.email && (
        <>
          <div className={DIVIDER_CLASS} />
          <a
            href={`mailto:${venue.email}`}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border border-green-700 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
          >
            <Mail className="size-4" />
            Liên hệ chủ sân
          </a>
        </>
      )}
    </div>
  );
}
