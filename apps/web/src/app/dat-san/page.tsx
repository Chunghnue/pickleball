"use client";

import { Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Clock, LayoutGrid, Mail, MapPin, Phone, User, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { getSubmitErrorMessage } from "@/lib/error-message";
import {
  computeMaxConsecutiveDuration,
  type AvailabilitySlot,
} from "@/lib/slot-selection";

const CARD_CLASS =
  "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6";

interface PublicCourt {
  id: string;
  name: string;
  pricePerHour: number;
  capacity: number | null;
}

interface PublicVenueDetail {
  id: string;
  name: string;
  address: string;
  city: string;
  cancellationCutoffHours: number;
  courts: PublicCourt[];
}

interface CurrentUser {
  fullName: string;
  phone: string | null;
}

interface ConfirmedBooking {
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
}

export default function DatSanPage() {
  return (
    <Suspense>
      <DatSanPageContent />
    </Suspense>
  );
}

function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <PublicHeader />
      <div className="flex-1 bg-gray-50 dark:bg-neutral-950">
        <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
          {children}
        </main>
      </div>
      <PublicFooter />
    </>
  );
}

function DatSanPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const venueId = searchParams.get("venueId");
  const presetCourtId = searchParams.get("courtId");
  const presetDate = searchParams.get("date");
  const presetStart = searchParams.get("start");

  const [venue, setVenue] = useState<PublicVenueDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);

  const [courtId, setCourtId] = useState<string | null>(presetCourtId);
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(presetDate ?? today);
  const [slots, setSlots] = useState<AvailabilitySlot[] | null>(null);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [durationSlots, setDurationSlots] = useState(1);
  const [appliedPreset, setAppliedPreset] = useState(false);

  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | null>(null);

  useEffect(() => {
    if (!venueId) return;
    fetch(`/api/venues/${venueId}`).then(async (res) => {
      if (!res.ok) {
        setLoadError("Không tìm thấy cơ sở.");
        return;
      }
      const data = (await res.json()) as PublicVenueDetail;
      setVenue(data);
      setCourtId((current) =>
        current && data.courts.some((c) => c.id === current)
          ? current
          : (data.courts[0]?.id ?? null),
      );
    });
  }, [venueId]);

  useEffect(() => {
    fetch("/api/users/me").then(async (res) => {
      if (!res.ok) return;
      const data = (await res.json()) as CurrentUser;
      setUser(data);
      setContactName(data.fullName);
      setContactPhone(data.phone ?? "");
    });
  }, []);

  useEffect(() => {
    if (!courtId) return;
    setSlotsError(null);
    setSelectedIndex(null);
    setDurationSlots(1);
    fetch(`/api/bookings/availability?courtId=${courtId}&date=${date}`).then(
      async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setSlotsError(data?.message ?? "Không thể tải khung giờ.");
          setSlots(null);
          return;
        }
        setSlots(data as AvailabilitySlot[]);
      },
    );
  }, [courtId, date]);

  useEffect(() => {
    if (appliedPreset || !presetStart || !slots) return;
    const index = slots.findIndex((slot) => slot.start === presetStart);
    if (index !== -1 && !slots[index].isBooked) {
      setSelectedIndex(index);
    }
    setAppliedPreset(true);
  }, [appliedPreset, presetStart, slots]);

  const selectedCourt = venue?.courts.find((c) => c.id === courtId) ?? null;
  const maxDuration =
    slots && selectedIndex !== null
      ? computeMaxConsecutiveDuration(slots, selectedIndex)
      : 0;
  const totalPrice =
    slots && selectedIndex !== null
      ? slots
          .slice(selectedIndex, selectedIndex + durationSlots)
          .reduce((sum, s) => sum + s.price, 0)
      : 0;

  async function handleConfirm() {
    if (!venue || !courtId || !slots || selectedIndex === null) return;
    setSubmitting(true);
    const startTime = slots[selectedIndex].start;
    const endTime = slots[selectedIndex + durationSlots - 1].end;
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courtId,
        date,
        startTime,
        endTime,
        contactName,
        contactPhone,
        contactEmail: contactEmail || undefined,
        note: note || undefined,
      }),
    });
    setSubmitting(false);

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      if (response.status === 409) {
        setSelectedIndex(null);
        setDurationSlots(1);
        fetch(`/api/bookings/availability?courtId=${courtId}&date=${date}`)
          .then((res) => res.json())
          .then((fresh) => setSlots(fresh as AvailabilitySlot[]));
      }
      return;
    }

    setConfirmed({
      courtName: selectedCourt?.name ?? "",
      date,
      startTime,
      endTime,
      totalPrice: data.totalPrice,
    });
  }

  if (!venueId) {
    return (
      <PageShell>
        <div className={CARD_CLASS}>
          <p className="text-destructive">Thiếu thông tin cơ sở.</p>
          <Link
            href="/venues"
            className="mt-2 inline-block text-green-600 hover:underline dark:text-green-400"
          >
            Quay lại tìm sân
          </Link>
        </div>
      </PageShell>
    );
  }

  if (loadError) {
    return (
      <PageShell>
        <div className={CARD_CLASS}>
          <p className="text-destructive">{loadError}</p>
          <Link
            href="/venues"
            className="mt-2 inline-block text-green-600 hover:underline dark:text-green-400"
          >
            Quay lại tìm sân
          </Link>
        </div>
      </PageShell>
    );
  }

  if (!venue) {
    return (
      <PageShell>
        <p>Đang tải...</p>
      </PageShell>
    );
  }

  if (confirmed) {
    return (
      <PageShell>
        <div className={CARD_CLASS}>
          <h1 className="text-xl font-bold text-green-700 dark:text-green-400">
            Đặt sân thành công
          </h1>
          <p className="mt-2 text-sm">
            {venue.name} · {confirmed.courtName} · {confirmed.date} ·{" "}
            {confirmed.startTime}–{confirmed.endTime}
          </p>
          <p className="mt-1 font-semibold">
            Tổng: {confirmed.totalPrice.toLocaleString("vi-VN")}đ
          </p>
          {user ? (
            <Link
              href="/me/bookings"
              className="mt-4 inline-block text-green-600 hover:underline dark:text-green-400"
            >
              Xem trong Lịch sử đặt sân
            </Link>
          ) : (
            <Link
              href="/venues"
              className="mt-4 inline-block text-green-600 hover:underline dark:text-green-400"
            >
              Quay lại tìm sân
            </Link>
          )}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className={CARD_CLASS}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold">{venue.name}</h1>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-4 shrink-0 text-green-600" />
              {venue.address}, {venue.city}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/venues")}
            className="shrink-0 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-neutral-800 dark:hover:bg-neutral-800"
          >
            Đổi
          </button>
        </div>
      </div>

      <div className={CARD_CLASS}>
        <h2 className="flex items-center gap-1.5 font-semibold">
          <LayoutGrid className="size-4 text-green-600" />
          Chọn sân &amp; lịch
        </h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {venue.courts.map((court) => (
            <button
              key={court.id}
              type="button"
              onClick={() => setCourtId(court.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                courtId === court.id
                  ? "border-green-700 bg-green-700 text-white"
                  : "border-gray-200 dark:border-neutral-800"
              }`}
            >
              {court.name}
              {court.capacity != null && (
                <span className="flex items-center gap-1 text-xs opacity-80">
                  <Users className="size-3" />
                  {court.capacity}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Label htmlFor="dat-san-date" className="flex items-center gap-1.5 text-sm">
            <Clock className="size-4 text-green-600" />
            Ngày
          </Label>
          <Input
            id="dat-san-date"
            type="date"
            min={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-auto"
          />
        </div>

        {slotsError && <p className="mt-3 text-sm text-destructive">{slotsError}</p>}

        {!slotsError && slots && slots.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">Không có khung giờ nào.</p>
        )}

        {!slotsError && slots && slots.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
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
                  onClick={() => {
                    if (selectedIndex === index) {
                      setSelectedIndex(null);
                      return;
                    }
                    setSelectedIndex(index);
                    setDurationSlots(1);
                  }}
                  className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    slot.isBooked
                      ? "cursor-not-allowed border-gray-200 bg-gray-100 text-muted-foreground dark:border-neutral-800 dark:bg-neutral-800"
                      : isSelected
                        ? "border-green-700 bg-green-700 text-white"
                        : "border-gray-200 hover:border-green-600 hover:bg-green-50 dark:border-neutral-800 dark:hover:bg-green-950"
                  }`}
                >
                  {slot.start}
                </button>
              );
            })}
          </div>
        )}

        {slots && selectedIndex !== null && maxDuration > 0 && (
          <div className="mt-3 flex items-center gap-3">
            <Label htmlFor="dat-san-duration" className="text-sm text-muted-foreground">
              Số giờ chơi
            </Label>
            <select
              id="dat-san-duration"
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
        )}
      </div>

      <div className={CARD_CLASS}>
        <div className="flex items-center gap-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">
            3
          </span>
          <h2 className="font-bold">Thông tin liên hệ</h2>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label
              htmlFor="contact-name"
              className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            >
              Họ tên *
            </Label>
            <div className="relative mt-1.5">
              <User className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="contact-name"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                required
                className="h-11 rounded-xl border-gray-200 bg-gray-50 pl-9 dark:border-neutral-700 dark:bg-neutral-800/50"
              />
            </div>
          </div>
          <div>
            <Label
              htmlFor="contact-phone"
              className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            >
              Số điện thoại *
            </Label>
            <div className="relative mt-1.5">
              <Phone className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="contact-phone"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                required
                className="h-11 rounded-xl border-gray-200 bg-gray-50 pl-9 dark:border-neutral-700 dark:bg-neutral-800/50"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label
              htmlFor="contact-email"
              className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            >
              Email
            </Label>
            <div className="relative mt-1.5">
              <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="contact-email"
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                className="h-11 rounded-xl border-gray-200 bg-gray-50 pl-9 dark:border-neutral-700 dark:bg-neutral-800/50"
              />
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label
              htmlFor="contact-note"
              className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            >
              Ghi chú
            </Label>
            <textarea
              id="contact-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Yêu cầu đặc biệt..."
              rows={3}
              className="mt-1.5 w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:border-neutral-700 dark:bg-neutral-800/50"
            />
          </div>
        </div>
      </div>

      {slots && selectedIndex !== null && (
        <div className={CARD_CLASS}>
          <p className="text-base font-semibold">
            {selectedCourt?.name} · {date} · {slots[selectedIndex].start}–
            {slots[selectedIndex + durationSlots - 1].end}
          </p>
          <p className="mt-2 text-lg font-bold">
            Tổng: {totalPrice.toLocaleString("vi-VN")}đ
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Hủy trước {venue.cancellationCutoffHours}h miễn phí
          </p>
          <button
            type="button"
            disabled={submitting || !contactName.trim() || !contactPhone.trim()}
            onClick={handleConfirm}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-green-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-muted-foreground dark:disabled:bg-neutral-800"
          >
            Xác nhận đặt sân
          </button>
        </div>
      )}
    </PageShell>
  );
}
