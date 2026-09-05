"use client";

import { Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Calendar,
  CalendarCheck2,
  Check,
  Clock,
  Crown,
  LayoutGrid,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  Timer,
  User,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
const DURATION_OPTIONS = [1, 2, 3];

interface PublicCourt {
  id: string;
  name: string;
  pricePerHour: number;
  capacity: number | null;
  slotDurationMinutes: number;
}

interface PublicVenueDetail {
  id: string;
  name: string;
  address: string;
  city: string;
  cancellationCutoffHours: number;
  logoUrl: string | null;
  images: { id: string; url: string }[];
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
  bookingCode: string;
}

function isVipCourt(name: string): boolean {
  return /\bvip\b/i.test(name);
}

function formatHours(hours: number): string {
  return `${Number(hours.toFixed(1))}h`;
}

function formatDateDisplay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
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
  const slotHours = (selectedCourt?.slotDurationMinutes ?? 60) / 60;
  const totalPrice =
    slots && selectedIndex !== null
      ? slots
          .slice(selectedIndex, selectedIndex + durationSlots)
          .reduce((sum, s) => sum + s.price, 0)
      : 0;

  function selectDuration(n: number) {
    setDurationSlots(n);
    setSelectedIndex(null);
  }

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
      bookingCode: data.bookingCode,
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
      <>
        <PublicHeader />
        <div className="flex-1 bg-gray-50 dark:bg-neutral-950" />
        <PublicFooter />
        <Dialog open onOpenChange={() => {}}>
          <DialogContent className="max-w-sm p-6 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-green-600">
              <Check className="size-8 text-white" />
            </div>
            <DialogTitle className="mt-4 text-xl font-bold">
              Đặt sân thành công!
            </DialogTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Chủ sân sẽ liên hệ xác nhận qua số điện thoại bạn đã cung cấp.
            </p>
            <div className="mt-4 rounded-xl bg-green-50 py-3 dark:bg-green-950/30">
              <span className="text-lg font-bold tracking-wide text-green-700 dark:text-green-400">
                {confirmed.bookingCode}
              </span>
            </div>
            <div className="mt-5 flex justify-center gap-3">
              <Link
                href="/"
                className="rounded-full border border-green-600 px-5 py-2 text-sm font-semibold text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950"
              >
                Về trang chủ
              </Link>
              {user ? (
                <Link
                  href="/me/bookings"
                  className="rounded-full bg-green-700 px-5 py-2 text-sm font-semibold text-white hover:bg-green-800"
                >
                  Xem lịch sử
                </Link>
              ) : (
                <Link
                  href="/venues"
                  className="rounded-full bg-green-700 px-5 py-2 text-sm font-semibold text-white hover:bg-green-800"
                >
                  Tìm sân khác
                </Link>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <PublicHeader />
      <div className="flex-1 bg-gray-50 dark:bg-neutral-950">
        <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
          <div className="mb-2 text-center">
            <h1 className="flex items-center justify-center gap-2 text-2xl font-bold sm:text-3xl">
              <CalendarCheck2 className="size-7 text-green-600" />
              Đặt sân thể thao
            </h1>
            <p className="mt-1 text-sm text-blue-600 dark:text-blue-400">
              Hoàn tất đặt sân chỉ trong vài bước đơn giản
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="flex flex-col gap-4 lg:col-span-2">
              {/* Bước 1 — Cơ sở đã chọn */}
              <div className={CARD_CLASS}>
                <div className="flex items-center gap-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
                    <Check className="size-3.5" />
                  </span>
                  <h2 className="font-bold">Cơ sở đã chọn</h2>
                </div>
                <div className="mt-3 flex items-center gap-3 rounded-xl border border-gray-200 p-3 dark:border-neutral-700">
                  <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {venue.logoUrl || venue.images[0] ? (
                      <img
                        src={venue.logoUrl ?? venue.images[0].url}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-muted-foreground">
                        <LayoutGrid className="size-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{venue.name}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0 text-green-600" />
                      <span className="truncate">
                        {venue.address}, {venue.city}
                      </span>
                    </p>
                    <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-xs text-muted-foreground dark:bg-green-950/30">
                      <span className="size-1.5 shrink-0 rounded-full bg-pink-500" />
                      {venue.courts.length} sân
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push("/venues")}
                    className="flex shrink-0 items-center gap-1 text-sm font-medium text-green-600 hover:underline dark:text-green-400"
                  >
                    <Pencil className="size-3.5" />
                    Đổi
                  </button>
                </div>
              </div>

              {/* Bước 2 — Chọn sân & lịch */}
              <div className={CARD_CLASS}>
                <div className="flex items-center gap-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">
                    2
                  </span>
                  <h2 className="font-bold">Chọn sân &amp; lịch</h2>
                </div>

                <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <LayoutGrid className="size-3.5" />
                  Chọn sân
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {venue.courts.map((court) => {
                    const vip = isVipCourt(court.name);
                    return (
                      <button
                        key={court.id}
                        type="button"
                        onClick={() => setCourtId(court.id)}
                        className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-colors ${
                          courtId === court.id
                            ? "border-green-600 bg-green-50 dark:bg-green-950/30"
                            : "border-gray-200 hover:border-green-300 dark:border-neutral-800"
                        }`}
                      >
                        {vip ? (
                          <Crown className="size-5 text-amber-500" />
                        ) : (
                          <MapPin className="size-5 text-pink-500" />
                        )}
                        <span className="text-sm font-semibold">{court.name}</span>
                        {court.capacity != null && (
                          <span className="text-xs text-muted-foreground">
                            {court.capacity} người
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label
                      htmlFor="dat-san-date"
                      className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                    >
                      <Calendar className="size-3.5" />
                      Ngày đặt sân
                    </Label>
                    <Input
                      id="dat-san-date"
                      type="date"
                      min={today}
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                      className="mt-1.5 h-11 rounded-xl border-gray-200 bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800/50"
                    />
                  </div>
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      <Timer className="size-3.5" />
                      Thời lượng
                    </p>
                    <div className="mt-1.5 flex h-11 items-center gap-2">
                      {DURATION_OPTIONS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => selectDuration(n)}
                          className={`flex-1 rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                            durationSlots === n
                              ? "border-green-600 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                              : "border-gray-200 dark:border-neutral-700"
                          }`}
                        >
                          {formatHours(n * slotHours)}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <Clock className="size-3.5" />
                  Chọn giờ bắt đầu
                </p>

                {slotsError && (
                  <p className="mt-3 text-sm text-destructive">{slotsError}</p>
                )}
                {!slotsError && slots && slots.length === 0 && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Không có khung giờ nào.
                  </p>
                )}
                {!slotsError && slots && slots.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {slots.map((slot, index) => {
                      const fits =
                        computeMaxConsecutiveDuration(slots, index) >= durationSlots;
                      const disabled = slot.isBooked || !fits;
                      const isSelected = selectedIndex === index;
                      return (
                        <button
                          key={slot.start}
                          type="button"
                          disabled={disabled}
                          onClick={() => setSelectedIndex(isSelected ? null : index)}
                          className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                            disabled
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
              </div>

              {/* Bước 3 — Thông tin liên hệ */}
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
                      Họ tên <span className="text-red-500">*</span>
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
                      Số điện thoại <span className="text-red-500">*</span>
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
            </div>

            {/* Sidebar — Tóm tắt */}
            <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
              <div className={CARD_CLASS}>
                <h2 className="flex items-center gap-1.5 font-bold">
                  <LayoutGrid className="size-4 text-green-600" />
                  Tóm tắt
                </h2>
                <dl className="mt-3 flex flex-col gap-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Cơ sở</dt>
                    <dd className="truncate font-medium">{venue.name}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Sân</dt>
                    <dd className="font-medium">
                      {selectedCourt?.name ?? "Chưa chọn"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Ngày</dt>
                    <dd className="font-medium">{formatDateDisplay(date)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Giờ</dt>
                    <dd className="font-medium">
                      {slots && selectedIndex !== null
                        ? `${slots[selectedIndex].start}–${slots[selectedIndex + durationSlots - 1].end}`
                        : "Chưa chọn"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-muted-foreground">Thời lượng</dt>
                    <dd className="font-medium">
                      {formatHours(durationSlots * slotHours)}
                    </dd>
                  </div>
                </dl>

                <div className="my-3 h-px bg-gray-200 dark:bg-neutral-800" />

                <div className="flex items-center justify-between">
                  <span className="font-bold">Tổng thanh toán</span>
                  <span className="text-lg font-bold text-green-700 dark:text-green-400">
                    {slots && selectedIndex !== null
                      ? `${totalPrice.toLocaleString("vi-VN")}đ`
                      : "—"}
                  </span>
                </div>

                <button
                  type="button"
                  disabled={
                    submitting ||
                    !slots ||
                    selectedIndex === null ||
                    !contactName.trim() ||
                    !contactPhone.trim()
                  }
                  onClick={handleConfirm}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-green-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-green-200 disabled:text-white/80 dark:disabled:bg-green-900"
                >
                  <CalendarCheck2 className="size-4" />
                  Xác nhận đặt sân
                </button>
                <p className="mt-2 flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5" />
                  Hủy trước {venue.cancellationCutoffHours} giờ miễn phí
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
      <PublicFooter />
    </>
  );
}
