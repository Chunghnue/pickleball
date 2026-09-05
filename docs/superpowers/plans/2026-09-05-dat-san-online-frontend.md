# Đặt Sân Online — Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the standalone `/dat-san?venueId=...` booking page (guest-or-logged-in) per [2026-09-05-dat-san-online-design.md](../specs/2026-09-05-dat-san-online-design.md), and turn `/venues/[id]`'s availability grid into a read-only preview that links out to it.

**Architecture:** New client-page `apps/web/src/app/dat-san/page.tsx` reuses the same BFF routes the venue detail page already calls (`GET /api/venues/:id`, `GET /api/bookings/availability`, `GET /api/users/me`, `POST /api/bookings` — none of these route handlers need to change, since `fetchApi` already omits the `Authorization` header when there's no session and the backend plan makes that acceptable). `apps/web/src/app/venues/[id]/page.tsx`'s `AvailabilityCard` drops its selection/confirm state and becomes a pure display + `router.push`/`<Link>` to `/dat-san`.

**Tech Stack:** Next.js 16 App Router, "use client" pages, Tailwind classes matching the existing venue-detail styling, `sonner` for toasts, Vitest for `apps/web`.

## Global Constraints

- **Backend prerequisite:** this plan requires [2026-09-05-dat-san-online-module-backend.md](./2026-09-05-dat-san-online-module-backend.md) to be done first — `POST /bookings` must accept requests without a token and require `contactName`/`contactPhone` in the body, or every submission from this page will fail.
- No new UI-kit components — reuse `Input`/`Label` from `@/components/ui/*` and native `<select>`/`<button>`, matching the existing convention already used on `/venues/[id]`.
- No `*.test.tsx` for pages — matches the existing repo convention (only `lib/*.test.ts` and API `*.service.spec.ts` get automated tests). Verification is `npx tsc --noEmit`, `npm run build`, and a manual browser walkthrough.
- A page that calls `useSearchParams()` must wrap its search-param-reading content in `<Suspense>`, or `next build` fails — follow the exact split already used in `apps/web/src/app/ban-do/page.tsx` (`export default function X() { return <Suspense><XContent /></Suspense>; }`).
- Vietnamese user-facing strings throughout, matching existing copy style ("Đặt sân", "Xác nhận đặt sân", "Hủy trước Nh miễn phí", etc.).
- `/dat-san` requires no login and no role restriction (`proxy.ts`'s `PROTECTED_PREFIXES` must **not** gain a `/dat-san` entry).

---

## File Structure

**New files:**
- `apps/web/src/app/dat-san/page.tsx`

**Modified files:**
- `apps/web/src/app/venues/[id]/page.tsx` — `AvailabilityCard` becomes read-only + links to `/dat-san`

---

### Task 1: `/dat-san` page

**Files:**
- Create: `apps/web/src/app/dat-san/page.tsx`

**Interfaces:**
- Consumes: `GET /api/venues/:id` (returns `{id, name, address, city, cancellationCutoffHours, courts: [{id, name, pricePerHour, capacity}], ...}` — already exists, backs `/venues/[id]`), `GET /api/bookings/availability?courtId=&date=` (returns `AvailabilitySlot[]`, from `@/lib/slot-selection`), `GET /api/users/me` (returns `{fullName, phone, ...} | 401`), `POST /api/bookings` (now optionally-authenticated per the backend plan; body `{courtId, date, startTime, endTime, contactName, contactPhone, contactEmail?, note?}`).
- Produces: route `/dat-san?venueId=&courtId=&date=&start=` — consumed by Task 2's links.

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/dat-san/page.tsx`:

```tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Clock, LayoutGrid, MapPin, Users } from "lucide-react";
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
        <h2 className="font-semibold">Thông tin liên hệ</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="contact-name">Họ tên *</Label>
            <Input
              id="contact-name"
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="contact-phone">Số điện thoại *</Label>
            <Input
              id="contact-phone"
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="contact-email">Email (tuỳ chọn)</Label>
            <Input
              id="contact-email"
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="contact-note">Ghi chú (tuỳ chọn)</Label>
            <Input
              id="contact-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
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
```

- [ ] **Step 2: Type-check**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: no errors in `app/dat-san/page.tsx`.

- [ ] **Step 3: Production build (catches the Suspense-boundary requirement)**

Run (from `apps/web`): `npm run build`
Expected: build succeeds, `/dat-san` listed in the route output. If it fails with "Next.js encountered URL data in a Client Component outside of Suspense", the `<Suspense>` wrapper in `DatSanPage` is missing or misplaced — it must wrap `<DatSanPageContent />`, not be inside it.

- [ ] **Step 4: Manual smoke test**

Run `cd apps/api && npm run start:dev` and `cd apps/web && npm run dev` (requires Task 4/backend plan already applied — otherwise the confirm step returns 400). Find a real venue id from `/venues`, then visit `/dat-san?venueId=<that id>` directly:
1. Page loads: venue name/address card, court chips, date picker, time-slot grid.
2. Not logged in: "Họ tên"/"Số điện thoại" are empty and editable.
3. Pick a free slot, pick a duration, fill in Họ tên/SĐT, click "Xác nhận đặt sân" — see "Đặt sân thành công" with a "Quay lại tìm sân" link (not "Xem trong Lịch sử đặt sân", since not logged in).
4. Visit `/dat-san` with no `venueId` at all — see "Thiếu thông tin cơ sở." instead of a crash.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/dat-san/page.tsx
git commit -m "feat(web): add standalone /dat-san booking page with guest checkout"
```

---

### Task 2: `/venues/[id]` — read-only availability grid, link out to `/dat-san`

**Files:**
- Modify: `apps/web/src/app/venues/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 1's `/dat-san` route.

- [ ] **Step 1: Drop now-unused imports and the `SelectedCell` interface**

Replace:
```ts
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
```
with:
```ts
import { notFound, useParams, useRouter } from "next/navigation";
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
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import type { AvailabilitySlot } from "@/lib/slot-selection";
```

Replace:
```ts
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
```
with:
```ts
function AvailabilityCard({ venue }: { venue: PublicVenueDetail }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [slotsByCourtId, setSlotsByCourtId] = useState<Record<
    string,
    AvailabilitySlot[]
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
```

(`Label` is dropped because it was only used inside the removed duration-picker block in this file; `useParams` stays imported because `VenueDetailPage` at the top of the file still uses it.)

- [ ] **Step 2: Replace the `useEffect`, click handler, and confirm logic**

Replace:
```ts
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
```
with:
```ts
  useEffect(() => {
    loadSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, venue.id]);

  function handleCellClick(courtId: string, slot: AvailabilitySlot) {
    if (slot.isBooked) return;
    router.push(
      `/dat-san?venueId=${venue.id}&courtId=${courtId}&date=${date}&start=${slot.start}`,
    );
  }

  const hasAnySlots =
```

- [ ] **Step 3: Update the card header (date picker + new "Đặt sân" button)**

Replace:
```tsx
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
```
with:
```tsx
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 font-semibold">
          <Clock className="size-4 text-green-600" />
          Lịch trống hôm nay
        </h2>
        <div className="flex items-center gap-2">
          <Input
            id="venue-date"
            type="date"
            min={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-auto"
          />
          <Link
            href={`/dat-san?venueId=${venue.id}`}
            className="rounded-full bg-green-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-800"
          >
            Đặt sân
          </Link>
        </div>
      </div>
```

- [ ] **Step 4: Make the slot grid buttons read-only-and-link instead of selectable**

Replace:
```tsx
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
```
with:
```tsx
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {slots.map((slot) => (
                    <button
                      key={slot.start}
                      type="button"
                      disabled={slot.isBooked}
                      onClick={() => handleCellClick(court.id, slot)}
                      className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                        slot.isBooked
                          ? "cursor-not-allowed border-gray-200 bg-gray-100 text-muted-foreground dark:border-neutral-800 dark:bg-neutral-800"
                          : vip
                            ? "border-amber-200 bg-white hover:border-amber-500 hover:bg-amber-50 dark:border-amber-900 dark:bg-transparent dark:hover:bg-amber-950"
                            : "border-gray-200 hover:border-green-600 hover:bg-green-50 dark:border-neutral-800 dark:hover:bg-green-950"
                      }`}
                    >
                      {slot.start}
                    </button>
                  ))}
                </div>
```

- [ ] **Step 5: Remove the inline summary/confirm panel and the standalone confirm button**

Delete this whole block (it followed the legend/"Trống"/"Đã đặt" block and preceded the closing `</div>` of `AvailabilityCard`):
```tsx
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
```
Replace it with just the closing tags:
```tsx
    </div>
  );
}
```

- [ ] **Step 6: Type-check**

Run (from `apps/web`): `npx tsc --noEmit`
Expected: no errors. If `toast`, `getSubmitErrorMessage`, or `computeMaxConsecutiveDuration` show as unused-import errors, they were missed in Step 1 — remove them.

- [ ] **Step 7: Production build**

Run (from `apps/web`): `npm run build`
Expected: build succeeds.

- [ ] **Step 8: Manual walkthrough (full flow, requires the backend plan already applied)**

Run `cd apps/api && npm run start:dev` and `cd apps/web && npm run dev`:
1. Open `/venues/[id]` for a venue with at least one court and some open slots — the grid still shows correctly, but clicking a free slot no longer shows an inline confirm panel.
2. Click a free slot — browser navigates to `/dat-san?venueId=...&courtId=...&date=...&start=...` with that exact slot preselected (duration dropdown shows "1" already selected, summary panel visible immediately).
3. Click an already-booked (greyed out) slot — nothing happens, stays on `/venues/[id]`.
4. Click the new "Đặt sân" button next to the date picker — navigates to `/dat-san?venueId=...` with nothing preselected.
5. From `/dat-san`, click "Đổi" — navigates to `/venues`.
6. Complete a booking from `/dat-san` as a logged-in customer — confirm it appears at `/me/bookings`, and back on `/venues/[id]` the slot now shows as booked.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/venues/\[id\]/page.tsx
git commit -m "feat(web): make /venues/[id] availability grid read-only, link to /dat-san"
```
