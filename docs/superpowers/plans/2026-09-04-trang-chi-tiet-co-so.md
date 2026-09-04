# Trang chi tiết cơ sở (`/venues/[id]`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the customer-facing venue detail page (`apps/web/src/app/venues/[id]/page.tsx`) into a full page per `docs/superpowers/specs/2026-09-04-trang-chi-tiet-co-so-design.md`: venue info header, real photo gallery, a unified multi-court availability grid with inline booking, an embedded read-only map, and a full contact/hours section — plus the small backend and `/ban-do` support changes the spec requires.

**Architecture:** One new backend method (`VenuesService.getOperatingHoursPublic`) wired into the two existing public detail controller handlers. Two small, independently testable frontend units (a pure grid-column helper, a read-only map component) get built first, then composed into a full rewrite of `page.tsx`. `/ban-do` gets a small additive change (`?venueId=` focus) used by the new "Xem bản đồ" button.

**Tech Stack:** NestJS + TypeORM (`apps/api`), Next.js App Router + React 19 + react-leaflet 5 (`apps/web`), Jest (api tests), Vitest (web tests).

## Global Constraints

- Spec is `docs/superpowers/specs/2026-09-04-trang-chi-tiet-co-so-design.md` — every task below cites the exact section it implements.
- `operatingHours[].dayOfWeek` follows JS `Date.getDay()` (0 = Chủ nhật … 6 = Thứ 7) — confirmed against `apps/web/src/app/owner/settings/operating-hours-format.ts:3-12`. Do not invent a different mapping.
- No bookmark/share/chat/`/lien-he` link, no separate `/dat-san` flow, no standalone price table — all explicitly out of scope (spec §6).
- Keep `/venues/[id]` URL as-is (no slug routing change).
- Run `apps/api` commands from `apps/api/`, `apps/web` commands from `apps/web/`.

---

### Task 1: Backend — public `operatingHours` on venue detail

**Files:**
- Modify: `apps/api/src/courts/venues.service.ts:825-843` (add new method after `getOperatingHours`)
- Modify: `apps/api/src/courts/venues.controller.ts:207-221` (`findBySlug`, `findOne`)
- Test: `apps/api/src/courts/venues.service.spec.ts` (add after the `VenuesService.getOperatingHours` describe block, i.e. after line 1560)

**Interfaces:**
- Produces: `VenuesService.getOperatingHoursPublic(venueId: string): Promise<OperatingHourView[]>` — same `OperatingHourView` shape (`{dayOfWeek, isOpen, openTime, closeTime}`) as the existing owner-scoped `getOperatingHours`, no ownership check.
- Produces: `GET /venues/:id` and `GET /venues/by-slug/:slug` responses now include `operatingHours: OperatingHourView[]`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/courts/venues.service.spec.ts` right after the closing `});` of the `VenuesService.getOperatingHours` describe block (line 1560):

```ts
describe('VenuesService.getOperatingHoursPublic', () => {
  it('returns the default 7-day schedule when no rows exist yet', async () => {
    const { service, operatingHoursRepo } = await buildTestingModule();
    operatingHoursRepo.find.mockResolvedValue([]);

    const result = await service.getOperatingHoursPublic('venue-1');

    expect(operatingHoursRepo.find).toHaveBeenCalledWith({
      where: { venueId: 'venue-1' },
      order: { dayOfWeek: 'ASC' },
    });
    expect(result).toHaveLength(7);
    expect(result).toEqual(
      expect.arrayContaining([
        { dayOfWeek: 0, isOpen: true, openTime: '06:00', closeTime: '22:00' },
        { dayOfWeek: 6, isOpen: true, openTime: '06:00', closeTime: '22:00' },
      ]),
    );
  });

  it('returns saved rows mapped to the view shape, without checking ownership', async () => {
    const { service, operatingHoursRepo, venuesRepo } =
      await buildTestingModule();
    operatingHoursRepo.find.mockResolvedValue([
      {
        id: 'row-1',
        venueId: 'venue-1',
        dayOfWeek: 1,
        isOpen: true,
        openTime: '07:00:00',
        closeTime: '21:00:00',
      },
    ]);

    const result = await service.getOperatingHoursPublic('venue-1');

    expect(result).toEqual([
      { dayOfWeek: 1, isOpen: true, openTime: '07:00', closeTime: '21:00' },
    ]);
    expect(venuesRepo.findOne).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/api/`): `npx jest venues.service.spec.ts -t "getOperatingHoursPublic"`
Expected: FAIL — `service.getOperatingHoursPublic is not a function`

- [ ] **Step 3: Implement `getOperatingHoursPublic`**

In `apps/api/src/courts/venues.service.ts`, insert immediately after the closing `}` of `getOperatingHours` (after line 843, before `async setOperatingHours(`):

```ts
  async getOperatingHoursPublic(venueId: string): Promise<OperatingHourView[]> {
    const rows = await this.operatingHoursRepository.find({
      where: { venueId },
      order: { dayOfWeek: 'ASC' },
    });
    if (rows.length === 0) {
      return DEFAULT_OPERATING_HOURS;
    }
    return rows.map((row) => ({
      dayOfWeek: row.dayOfWeek,
      isOpen: row.isOpen,
      openTime: toHhMm(row.openTime),
      closeTime: toHhMm(row.closeTime),
    }));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest venues.service.spec.ts -t "getOperatingHoursPublic"`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire `operatingHours` into the two public detail controller handlers**

In `apps/api/src/courts/venues.controller.ts`, replace:

```ts
  @Get('by-slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const venue = await this.venuesService.findPublicBySlug(slug);
    const courts = await this.courtsService.findActiveByVenue(venue.id);
    const images = await this.venuesService.findImagesByVenue(venue.id);
    return { ...venue, courts, images };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const venue = await this.venuesService.findPublicById(id);
    const courts = await this.courtsService.findActiveByVenue(id);
    const images = await this.venuesService.findImagesByVenue(id);
    return { ...venue, courts, images };
  }
```

with:

```ts
  @Get('by-slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const venue = await this.venuesService.findPublicBySlug(slug);
    const courts = await this.courtsService.findActiveByVenue(venue.id);
    const images = await this.venuesService.findImagesByVenue(venue.id);
    const operatingHours = await this.venuesService.getOperatingHoursPublic(
      venue.id,
    );
    return { ...venue, courts, images, operatingHours };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const venue = await this.venuesService.findPublicById(id);
    const courts = await this.courtsService.findActiveByVenue(id);
    const images = await this.venuesService.findImagesByVenue(id);
    const operatingHours = await this.venuesService.getOperatingHoursPublic(id);
    return { ...venue, courts, images, operatingHours };
  }
```

- [ ] **Step 6: Run the full api test suite to check for regressions**

Run: `npx jest`
Expected: PASS (no failures; `getOperatingHours` describe block untouched)

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.controller.ts apps/api/src/courts/venues.service.spec.ts
git commit -m "feat(api): include operatingHours in public venue detail response"
```

---

### Task 2: `/ban-do` — focus a specific venue via `?venueId=`

**Files:**
- Modify: `apps/web/src/app/ban-do/page.tsx`
- Modify: `apps/web/src/app/ban-do/venue-map.tsx`

**Interfaces:**
- Consumes: existing `VenueMapItem` type (`apps/web/src/app/ban-do/venue-map.tsx:15-25`).
- Produces: `VenueMap` accepts a new optional prop `focusVenueId?: string | null`. Visiting `/ban-do?venueId=<id>` flies the map to that venue (zoom 16) and opens its popup instead of the default fit-all-results behavior; falls back to the default behavior if the venue has no coordinates.

This task has no automated test — Leaflet map behavior isn't unit-testable in this codebase (same conclusion the `ban-do` spec's own Testing section reached). Verification is manual, in Step 5.

- [ ] **Step 1: Wrap `BanDoPage` in `Suspense` and read `venueId` from the URL**

`useSearchParams()` requires a `Suspense` boundary in this app (same pattern already used in `apps/web/src/app/venues/page.tsx:37-48`). In `apps/web/src/app/ban-do/page.tsx`, replace:

```tsx
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Building2, ImageOff, MapPin, Menu, Search, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PublicHeader } from "@/components/public-header";
import { cn } from "@/lib/utils";
import type { VenueMapItem } from "./venue-map";

const VenueMap = dynamic(() => import("./venue-map"), { ssr: false });

interface CityOption {
  city: string;
  count: number;
}

export default function BanDoPage() {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
```

with:

```tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Building2, ImageOff, MapPin, Menu, Search, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PublicHeader } from "@/components/public-header";
import { cn } from "@/lib/utils";
import type { VenueMapItem } from "./venue-map";

const VenueMap = dynamic(() => import("./venue-map"), { ssr: false });

interface CityOption {
  city: string;
  count: number;
}

export default function BanDoPage() {
  return (
    <Suspense>
      <BanDoPageContent />
    </Suspense>
  );
}

function BanDoPageContent() {
  const searchParams = useSearchParams();
  const focusVenueId = searchParams.get("venueId");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
```

- [ ] **Step 2: Pass `focusVenueId` down to `VenueMap`**

Still in `apps/web/src/app/ban-do/page.tsx`, change:

```tsx
            {venues !== null && <VenueMap venues={venues} />}
```

to:

```tsx
            {venues !== null && <VenueMap venues={venues} focusVenueId={focusVenueId} />}
```

- [ ] **Step 3: Add `focusVenueId` handling to `VenueMap`**

In `apps/web/src/app/ban-do/venue-map.tsx`, replace the `FitToVenuesOnce` component:

```tsx
function FitToVenuesOnce({ venues }: { venues: VenueMapItem[] }) {
  const map = useMap();
  const didFit = useRef(false);

  useEffect(() => {
    if (didFit.current) return;
    const withCoords = venues.filter(hasCoords);
    if (withCoords.length === 0) return;
    didFit.current = true;
    map.fitBounds(boundsOf(withCoords), { padding: [40, 40] });
  }, [venues, map]);

  return null;
}
```

with a version that tries to focus a single venue first, falling back to the existing fit-all behavior:

```tsx
function FitToVenuesOnce({
  venues,
  focusVenueId,
  markerRefs,
}: {
  venues: VenueMapItem[];
  focusVenueId?: string | null;
  markerRefs: React.RefObject<Record<string, L.Marker | null>>;
}) {
  const map = useMap();
  const didFit = useRef(false);

  useEffect(() => {
    if (didFit.current) return;
    if (focusVenueId) {
      const target = venues.find((v) => v.id === focusVenueId);
      if (target && hasCoords(target)) {
        didFit.current = true;
        map.flyTo([target.latitude, target.longitude], 16);
        markerRefs.current[target.id]?.openPopup();
        return;
      }
    }
    const withCoords = venues.filter(hasCoords);
    if (withCoords.length === 0) return;
    didFit.current = true;
    map.fitBounds(boundsOf(withCoords), { padding: [40, 40] });
  }, [venues, map, focusVenueId, markerRefs]);

  return null;
}
```

Add the `React` import needed for `React.RefObject` — change:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
```

to:

```tsx
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
```

and use `RefObject<Record<string, L.Marker | null>>` (no `React.` prefix) in the `FitToVenuesOnce` prop type above.

- [ ] **Step 4: Thread `focusVenueId` and marker refs through `VenueMap`**

In `apps/web/src/app/ban-do/venue-map.tsx`, replace:

```tsx
export interface VenueMapProps {
  venues: VenueMapItem[];
}

export default function VenueMap({ venues }: VenueMapProps) {
  const [layer, setLayer] = useState<LayerOption>("osm");
  const venuesWithCoords = useMemo(() => venues.filter(hasCoords), [venues]);

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={6}
      zoomControl={false}
      style={{ height: "100%", width: "100%" }}
    >
      {layer === "osm" && (
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      )}
      {HAS_GOOGLE_MAPS_KEY && (
        <GoogleMutantLayer type={layer === "satellite" ? "satellite" : "roadmap"} active={layer !== "osm"} />
      )}
      <MarkerClusterGroup chunkedLoading iconCreateFunction={createClusterIcon}>
        {venuesWithCoords.map((venue) => (
          <Marker key={venue.id} position={[venue.latitude, venue.longitude]} icon={venueMarkerIcon}>
            <Popup>
              <div className="flex flex-col gap-1">
                <strong>{venue.name}</strong>
                <span>
                  {venue.district ? `${venue.district}, ` : ""}
                  {venue.city}
                </span>
                <span>{venue.courtsCount} sân</span>
                <Link href={`/venues/${venue.id}`} className="font-medium text-green-600 hover:underline">
                  Chi tiết
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
      <FitToVenuesOnce venues={venues} />
      <MapControls venues={venues} />
      <ZoomButtons />
      <LayerSwitcher layer={layer} onChange={setLayer} />
    </MapContainer>
  );
}
```

with:

```tsx
export interface VenueMapProps {
  venues: VenueMapItem[];
  focusVenueId?: string | null;
}

export default function VenueMap({ venues, focusVenueId }: VenueMapProps) {
  const [layer, setLayer] = useState<LayerOption>("osm");
  const venuesWithCoords = useMemo(() => venues.filter(hasCoords), [venues]);
  const markerRefs = useRef<Record<string, L.Marker | null>>({});

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={6}
      zoomControl={false}
      style={{ height: "100%", width: "100%" }}
    >
      {layer === "osm" && (
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      )}
      {HAS_GOOGLE_MAPS_KEY && (
        <GoogleMutantLayer type={layer === "satellite" ? "satellite" : "roadmap"} active={layer !== "osm"} />
      )}
      <MarkerClusterGroup chunkedLoading iconCreateFunction={createClusterIcon}>
        {venuesWithCoords.map((venue) => (
          <Marker
            key={venue.id}
            position={[venue.latitude, venue.longitude]}
            icon={venueMarkerIcon}
            ref={(instance) => {
              markerRefs.current[venue.id] = instance;
            }}
          >
            <Popup>
              <div className="flex flex-col gap-1">
                <strong>{venue.name}</strong>
                <span>
                  {venue.district ? `${venue.district}, ` : ""}
                  {venue.city}
                </span>
                <span>{venue.courtsCount} sân</span>
                <Link href={`/venues/${venue.id}`} className="font-medium text-green-600 hover:underline">
                  Chi tiết
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
      <FitToVenuesOnce venues={venues} focusVenueId={focusVenueId} markerRefs={markerRefs} />
      <MapControls venues={venues} />
      <ZoomButtons />
      <LayerSwitcher layer={layer} onChange={setLayer} />
    </MapContainer>
  );
}
```

- [ ] **Step 5: Manually verify**

Run the dev servers (`apps/api`: `npm run start:dev`; `apps/web`: `npm run dev`), then in a browser:
1. Open `/ban-do` (no query param) → confirm it still fits/zooms to all results as before (regression check).
2. Pick a venue id with coordinates from the DB, open `/ban-do?venueId=<that-id>` → map flies to zoom 16 centered on that venue and its popup opens automatically.
3. Open `/ban-do?venueId=00000000-0000-0000-0000-000000000000` (a nonexistent id) → falls back to the default fit-all behavior, no console error.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/ban-do/page.tsx apps/web/src/app/ban-do/venue-map.tsx
git commit -m "feat(web): support /ban-do?venueId= to focus a single venue"
```

---

### Task 3: Availability grid helper (pure logic, TDD)

**Files:**
- Create: `apps/web/src/app/venues/[id]/availability-grid.ts`
- Test: `apps/web/src/app/venues/[id]/availability-grid.test.ts`

**Interfaces:**
- Consumes: `AvailabilitySlot` from `@/lib/slot-selection` (`{start: string; end: string; price: number; isBooked: boolean}`).
- Produces: `buildTimeColumns(slotsByCourtId: Record<string, AvailabilitySlot[]>): {start: string; end: string}[]` and `findSlotIndex(slots: AvailabilitySlot[], column: {start: string; end: string}): number` — used by Task 5 (the page rewrite) to render the unified grid described in spec §4.5.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/app/venues/[id]/availability-grid.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTimeColumns, findSlotIndex } from "./availability-grid";
import type { AvailabilitySlot } from "@/lib/slot-selection";

function slot(start: string, end: string, isBooked = false): AvailabilitySlot {
  return { start, end, price: 100000, isBooked };
}

describe("buildTimeColumns", () => {
  it("returns the union of slot ranges across courts, sorted by start time", () => {
    const columns = buildTimeColumns({
      "court-a": [slot("06:00", "07:00"), slot("07:00", "08:00")],
      "court-b": [slot("07:00", "08:00"), slot("08:00", "09:00")],
    });

    expect(columns).toEqual([
      { start: "06:00", end: "07:00" },
      { start: "07:00", end: "08:00" },
      { start: "08:00", end: "09:00" },
    ]);
  });

  it("de-duplicates identical ranges shared by multiple courts", () => {
    const columns = buildTimeColumns({
      "court-a": [slot("06:00", "07:00")],
      "court-b": [slot("06:00", "07:00")],
    });

    expect(columns).toHaveLength(1);
  });

  it("returns an empty array when there are no courts", () => {
    expect(buildTimeColumns({})).toEqual([]);
  });
});

describe("findSlotIndex", () => {
  it("finds the index of a matching start/end pair", () => {
    const slots = [slot("06:00", "07:00"), slot("07:00", "08:00")];
    expect(findSlotIndex(slots, { start: "07:00", end: "08:00" })).toBe(1);
  });

  it("returns -1 when the court has no slot for that column", () => {
    const slots = [slot("06:00", "07:00")];
    expect(findSlotIndex(slots, { start: "20:00", end: "21:00" })).toBe(-1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/web/`): `npx vitest run src/app/venues/\[id\]/availability-grid.test.ts`
Expected: FAIL — cannot find module `./availability-grid`

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/app/venues/[id]/availability-grid.ts`:

```ts
import type { AvailabilitySlot } from "@/lib/slot-selection";

export interface GridColumn {
  start: string;
  end: string;
}

export function buildTimeColumns(
  slotsByCourtId: Record<string, AvailabilitySlot[]>,
): GridColumn[] {
  const seen = new Map<string, GridColumn>();
  for (const slots of Object.values(slotsByCourtId)) {
    for (const slot of slots) {
      seen.set(`${slot.start}-${slot.end}`, { start: slot.start, end: slot.end });
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.start.localeCompare(b.start));
}

export function findSlotIndex(
  slots: AvailabilitySlot[],
  column: GridColumn,
): number {
  return slots.findIndex(
    (slot) => slot.start === column.start && slot.end === column.end,
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/venues/\[id\]/availability-grid.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/venues/[id]/availability-grid.ts" "apps/web/src/app/venues/[id]/availability-grid.test.ts"
git commit -m "feat(web): add pure helper for the unified venue availability grid"
```

---

### Task 4: Embedded read-only venue location map

**Files:**
- Create: `apps/web/src/app/venues/[id]/venue-location-map.tsx`

**Interfaces:**
- Produces: default export `VenueLocationMap({ latitude, longitude }: { latitude: number; longitude: number })` — a static, read-only single-marker Leaflet map. Task 5 loads it via `dynamic(() => import("./venue-location-map"), { ssr: false })` and only renders it when both coordinates are non-null.

No automated test — same as `branch-location-map.tsx` this is derived from, Leaflet rendering isn't unit-tested in this codebase. Verified manually in Step 2.

- [ ] **Step 1: Create the component**

Create `apps/web/src/app/venues/[id]/venue-location-map.tsx` — a read-only derivative of `apps/web/src/app/owner/branches/branch-location-map.tsx` with the click-to-edit behavior removed and the green marker color used for customer-facing pins (matching `apps/web/src/app/ban-do/venue-map.tsx:39-44`):

```tsx
"use client";

import { memo } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer, ZoomControl } from "react-leaflet";

const markerIcon = L.divIcon({
  className: "",
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;background:#16a34a;transform:rotate(-45deg);border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

export interface VenueLocationMapProps {
  latitude: number;
  longitude: number;
}

function VenueLocationMap({ latitude, longitude }: VenueLocationMapProps) {
  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={15}
      zoomControl={false}
      style={{ height: "220px", width: "100%", borderRadius: "0.75rem" }}
    >
      <ZoomControl position="topright" />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[latitude, longitude]} icon={markerIcon} />
    </MapContainer>
  );
}

export default memo(VenueLocationMap);
```

- [ ] **Step 2: Manually verify in isolation**

This component isn't wired into any page yet (that happens in Task 5). Confirm it compiles and has no type errors:

Run (from `apps/web/`): `npx tsc --noEmit`
Expected: no errors reported for `venue-location-map.tsx`

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/venues/[id]/venue-location-map.tsx"
git commit -m "feat(web): add read-only embedded map for the venue detail page"
```

---

### Task 5: Rewrite the venue detail page

**Files:**
- Modify: `apps/web/src/app/venues/[id]/page.tsx` (full rewrite, replacing the entire file)

**Interfaces:**
- Consumes: `AvailabilitySlot`, `computeMaxConsecutiveDuration` from `@/lib/slot-selection`; `buildTimeColumns`, `findSlotIndex`, `GridColumn` from `./availability-grid` (Task 3); `VenueLocationMap` (dynamic import) from `./venue-location-map` (Task 4); `getSubmitErrorMessage` from `@/lib/error-message`; `PublicHeader`/`PublicFooter` from `@/components/public-header` / `@/components/public-footer`; `DAY_LABELS`, `DISPLAY_ORDER` from `@/app/owner/settings/operating-hours-format`; `GET /api/venues/:id` (now returns `operatingHours`, Task 1) and `GET /api/bookings/availability?courtId=&date=` (unchanged).
- Produces: the rebuilt page itself — no other task depends on its exports.

- [ ] **Step 1: Replace the entire file**

Replace the full contents of `apps/web/src/app/venues/[id]/page.tsx` with:

```tsx
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
```

- [ ] **Step 2: Type-check**

Run (from `apps/web/`): `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Run the full web test suite to check for regressions**

Run: `npx vitest run`
Expected: PASS (all existing tests plus the new `availability-grid.test.ts` from Task 3)

- [ ] **Step 4: Manually verify**

Run the dev servers (`apps/api`: `npm run start:dev`; `apps/web`: `npm run dev`). Open `/venues/[id]` for a venue that has courts, images, and coordinates, and confirm:
1. Header shows name, open/closed badge, full address, today's hours, court count, description.
2. Gallery renders actual `<img>` thumbnails (not text links); clicking one opens the full image in a new tab.
3. The availability grid shows one row per court and one column per distinct time range across all courts; cells outside a court's open hours are blank, not "Đã đặt".
4. Clicking an open cell shows the summary panel with the court name, time range, duration dropdown, running total, the dynamic cancellation-cutoff note, and a working "Xác nhận đặt sân" button; booking succeeds and the cell flips to booked after reload.
5. Changing the date reloads the whole grid for every court at once.
6. The embedded map renders at the venue's coordinates; "Chỉ đường" opens Google Maps directions in a new tab; "Xem bản đồ" navigates to `/ban-do?venueId=...` and the map there flies to and opens that venue's popup (Task 2).
7. The contact section at the bottom shows phone (as a `tel:` link), address, and a 7-day hours table ordered Monday→Sunday.
8. Open a venue with no images, no coordinates, and default (unconfigured) operating hours — gallery and map sections are hidden, badge/hours still render sensibly from the default 06:00–22:00 schedule.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/venues/[id]/page.tsx"
git commit -m "feat(web): rebuild venue detail page with unified availability grid, gallery, map and contact info"
```

---

### Task 6: Full spec regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run both test suites one more time**

```bash
cd apps/api && npx jest
cd ../apps/web && npx vitest run
```

Expected: PASS in both.

- [ ] **Step 2: Walk through the spec's full Testing checklist (§5) manually**

Using the running dev servers, work through every bullet in `docs/superpowers/specs/2026-09-04-trang-chi-tiet-co-so-design.md` §5 "Testing" end to end (both the backend bullets already covered by Task 1's unit tests, and the frontend bullets covered by Task 5 Step 4) — specifically re-check the two items that span multiple tasks:
1. Unauthenticated booking attempt redirects to `/login?returnTo=/venues/[id]` correctly (Task 5).
2. A venue with `isOpen=false` for today shows "Đã đóng cửa" even if the current wall-clock time would otherwise look like business hours (Task 5's `isOpenNow` only trusts `today.isOpen`).

- [ ] **Step 3: No commit needed** — this task only verifies work already committed in Tasks 1–5.
