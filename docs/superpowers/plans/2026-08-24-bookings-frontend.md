# Bookings Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js frontend (`apps/web`) for the Bookings module: an interactive slot-booking flow on the public venue page, a customer "my bookings" page, and an owner bookings section — on top of the already-implemented Bookings backend.

**Architecture:** Same BFF pattern as Auth+Users/Courts — Next.js route handlers under `apps/web/src/app/api/*` proxy to the NestJS API (`apps/api`), using `fetchApi()` (authenticated) or plain `fetch()` (public), and `toNextResponse()` to relay the response. Pages are client components (`"use client"`). Two small backend enrichments (Task 1) are required first: `GET /bookings/mine`/`GET /bookings/mine/:id` don't currently return court/venue names, and `GET /venues/mine/:venueId/bookings` doesn't return the customer's name/phone — both needed by the approved frontend design.

**Tech Stack:** Next.js 16 (App Router), React 19, sonner (toasts), Vitest (`environment: 'node'`, no DOM). NestJS 11 + TypeORM for the backend enrichment task.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-24-bookings-frontend-design.md`
- Browser never calls NestJS directly; every request goes through a same-origin `/api/*` Next.js route handler.
- Public (unauthenticated) route handlers use `fetch(`${API_BASE_URL}/...`)` directly. Customer/owner (authenticated) route handlers use `fetchApi()` from `@/lib/fetch-api` and call `clearAuthCookies()` on a 401 upstream response (mirrors every existing owner/customer-scoped handler).
- No new shadcn/ui components. Reuse `Card`/`Button`/`Input`/`Label`. The duration picker is a plain `<select>`, the owner's date filter is a plain `<input type="date">`.
- No new zod schemas — the booking flow is entirely selection-driven (click + dropdown), no free-text input to validate.
- Cancel actions (both customer and owner) use a two-step inline confirm: first click on "Huỷ" reveals "Xác nhận huỷ?" + "Thôi" buttons; the second click calls the API. No modal/Dialog component exists.
- Booking creation is a two-step inline confirm too: selecting a start slot + duration reveals a summary (time range + total price) and a "Xác nhận đặt sân" button; that button is what calls the API.
- Only the route handlers actually consumed by a page are built — `GET /bookings/mine/:id` is **not** wired up (no detail page is planned; the spec's route table listed it but nothing in the design consumes it).
- No test files for pages or route handlers — matches every existing page in this codebase (only `lib/*.test.ts` gets automated tests).
- Vietnamese UI copy throughout. Terminology: **venue → "địa điểm"/tên venue**, **court → "sân"**.
- Landing page (`/`) is explicitly NOT modified.
- Selecting a slot does not survive a redirect-to-login round trip — the customer must reselect after logging in (approved simplification, not a bug).

---

## Task 1: Backend enrichment — court/venue name and customer name/phone on booking responses

**Files:**
- Modify: `apps/api/src/bookings/bookings.service.spec.ts`
- Modify: `apps/api/src/bookings/bookings.service.ts`
- Modify: `apps/api/src/bookings/bookings.module.ts`

**Interfaces:**
- Consumes: `CourtsService.findByIdOrThrow`, `VenuesService.findByIdOrThrow` (existing), `UsersService.findById(id: string): Promise<User | null>` (existing, exported by `UsersModule`).
- Produces: `BookingsService.findMineByCustomer(customerId): Promise<Array<Booking & { courtName: string; venueName: string }>>`, `.findMineById(customerId, id): Promise<Booking & { courtName: string; venueName: string }>`, `.findByVenueForOwner(ownerId, venueId, filters): Promise<Array<Booking & { customerName: string; customerPhone: string | null }>>` — same parameters as today, enriched return shape.

- [ ] **Step 1: Add the users-service mock and wire it into the testing module**

In `apps/api/src/bookings/bookings.service.spec.ts`, add this import next to the existing ones:

```typescript
import { UsersService } from '../users/users.service';
```

Add this factory next to `mockVenuesService`:

```typescript
const mockUsersService = () => ({
  findById: jest.fn(),
});
```

In `buildTestingModule`, add the provider (in the `providers` array, after the `VenuesService` provider):

```typescript
      { provide: UsersService, useFactory: mockUsersService },
```

And add it to the returned object (after `venuesService`):

```typescript
    usersService: module.get(UsersService) as ReturnType<
      typeof mockUsersService
    >,
```

- [ ] **Step 2: Write the failing tests for court/venue-name enrichment**

Replace the `describe('BookingsService.findMineByCustomer', ...)` block with:

```typescript
describe('BookingsService.findMineByCustomer', () => {
  it('completes past bookings before listing, enriched with court/venue name', async () => {
    const { service, bookingsRepo, courtsService, venuesService } =
      await buildTestingModule();
    bookingsRepo.find.mockResolvedValue([
      { id: 'booking-1', courtId: 'court-1' },
    ]);
    courtsService.findByIdOrThrow.mockResolvedValue({
      id: 'court-1',
      venueId: 'venue-1',
      name: 'Sân 1',
    });
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      name: 'Venue A',
    });

    const result = await service.findMineByCustomer('customer-1');

    expect(bookingsRepo.createQueryBuilder().execute).toHaveBeenCalled();
    expect(bookingsRepo.find).toHaveBeenCalledWith({
      where: { customerId: 'customer-1' },
      order: { date: 'DESC', startTime: 'DESC' },
    });
    expect(result).toEqual([
      {
        id: 'booking-1',
        courtId: 'court-1',
        courtName: 'Sân 1',
        venueName: 'Venue A',
      },
    ]);
  });
});
```

Replace the `describe('BookingsService.findMineById', ...)` block with:

```typescript
describe('BookingsService.findMineById', () => {
  it('returns the booking enriched with court/venue name', async () => {
    const { service, bookingsRepo, courtsService, venuesService } =
      await buildTestingModule();
    bookingsRepo.findOne.mockResolvedValue({
      id: 'booking-1',
      customerId: 'customer-1',
      courtId: 'court-1',
    });
    courtsService.findByIdOrThrow.mockResolvedValue({
      id: 'court-1',
      venueId: 'venue-1',
      name: 'Sân 1',
    });
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      name: 'Venue A',
    });

    const result = await service.findMineById('customer-1', 'booking-1');

    expect(result).toEqual({
      id: 'booking-1',
      customerId: 'customer-1',
      courtId: 'court-1',
      courtName: 'Sân 1',
      venueName: 'Venue A',
    });
  });

  it('throws NotFoundException when the booking does not belong to the customer', async () => {
    const { service, bookingsRepo } = await buildTestingModule();
    bookingsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.findMineById('customer-1', 'booking-1'),
    ).rejects.toThrow('Booking booking-1 không tồn tại');
  });
});
```

- [ ] **Step 3: Run tests to verify the two enrichment tests fail**

Run (from `apps/api`): `npx jest bookings.service.spec.ts -t "enriched with court"`
Expected: FAIL — `result` does not include `courtName`/`venueName` (undefined properties).

- [ ] **Step 4: Write the failing test for customer-name/phone enrichment**

Replace the first test in `describe('BookingsService.findByVenueForOwner', ...)` (`'lists bookings for every court in the venue'`) with:

```typescript
  it('lists bookings for every court in the venue, enriched with customer name/phone', async () => {
    const { service, bookingsRepo, courtsService, usersService } =
      await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([
      { id: 'court-1' },
      { id: 'court-2' },
    ]);
    bookingsRepo.find.mockResolvedValue([
      { id: 'booking-1', customerId: 'customer-1' },
    ]);
    usersService.findById.mockResolvedValue({
      id: 'customer-1',
      fullName: 'Nguyễn Văn A',
      phone: '0900000000',
    });

    const result = await service.findByVenueForOwner('owner-1', 'venue-1', {});

    expect(courtsService.findByVenueForOwner).toHaveBeenCalledWith(
      'owner-1',
      'venue-1',
    );
    expect(bookingsRepo.find).toHaveBeenCalledWith({
      where: { courtId: expect.anything() },
      order: { date: 'ASC', startTime: 'ASC' },
    });
    expect(result).toEqual([
      {
        id: 'booking-1',
        customerId: 'customer-1',
        customerName: 'Nguyễn Văn A',
        customerPhone: '0900000000',
      },
    ]);
  });
```

(Leave the `'filters to a single court when courtId is provided'` test right after it unchanged — it mocks `bookingsRepo.find` to resolve `[]`, so no enrichment call happens and nothing about it needs to change.)

- [ ] **Step 5: Run tests to verify this one fails too**

Run: `npx jest bookings.service.spec.ts -t "enriched with customer name"`
Expected: FAIL — `result` does not include `customerName`/`customerPhone`.

- [ ] **Step 6: Implement the enrichment in BookingsService**

In `apps/api/src/bookings/bookings.service.ts`, add the import:

```typescript
import { UsersService } from '../users/users.service';
```

Add `usersService` to the constructor (after `venuesService`):

```typescript
    private readonly venuesService: VenuesService,
    private readonly usersService: UsersService,
```

Add these two type aliases after the `UNIQUE_VIOLATION_CODE` constant:

```typescript
type BookingWithCourtInfo = Booking & { courtName: string; venueName: string };
type BookingWithCustomerInfo = Booking & {
  customerName: string;
  customerPhone: string | null;
};
```

Replace `findMineByCustomer` and `findMineById` with:

```typescript
  async findMineByCustomer(customerId: string): Promise<BookingWithCourtInfo[]> {
    await this.completePastBookings();
    const bookings = await this.bookingsRepository.find({
      where: { customerId },
      order: { date: 'DESC', startTime: 'DESC' },
    });
    return this.enrichWithCourtInfo(bookings);
  }

  async findMineById(
    customerId: string,
    id: string,
  ): Promise<BookingWithCourtInfo> {
    await this.completePastBookings();
    const booking = await this.bookingsRepository.findOne({
      where: { id, customerId },
    });
    if (!booking) {
      throw new NotFoundException(`Booking ${id} không tồn tại`);
    }
    const [enriched] = await this.enrichWithCourtInfo([booking]);
    return enriched;
  }
```

Replace `findByVenueForOwner`'s return statement (the `return this.bookingsRepository.find({...})` at the end) with:

```typescript
    const bookings = await this.bookingsRepository.find({
      where: {
        courtId: In(courtIds.length > 0 ? courtIds : ['__none__']),
        ...(filters.date ? { date: filters.date } : {}),
      },
      order: { date: 'ASC', startTime: 'ASC' },
    });

    return Promise.all(
      bookings.map(async (booking) => {
        const customer = await this.usersService.findById(booking.customerId);
        return {
          ...booking,
          customerName: customer?.fullName ?? 'Không rõ',
          customerPhone: customer?.phone ?? null,
        };
      }),
    );
```

And update its signature's return type from `Promise<Booking[]>` to `Promise<BookingWithCustomerInfo[]>`.

Add this private helper method (e.g. after `cancel`):

```typescript
  private async enrichWithCourtInfo(
    bookings: Booking[],
  ): Promise<BookingWithCourtInfo[]> {
    return Promise.all(
      bookings.map(async (booking) => {
        const court = await this.courtsService.findByIdOrThrow(booking.courtId);
        const venue = await this.venuesService.findByIdOrThrow(court.venueId);
        return { ...booking, courtName: court.name, venueName: venue.name };
      }),
    );
  }
```

- [ ] **Step 7: Wire UsersModule into BookingsModule**

In `apps/api/src/bookings/bookings.module.ts`, add the import:

```typescript
import { UsersModule } from '../users/users.module';
```

And add it to the `imports` array:

```typescript
  imports: [
    TypeOrmModule.forFeature([Booking, BookingSlot]),
    CourtsModule,
    UsersModule,
  ],
```

- [ ] **Step 8: Run the full unit test suite**

Run: `npx jest`
Expected: PASS (all suites, including the 3 modified/added tests).

- [ ] **Step 9: Run the e2e suite to confirm nothing regressed**

Ensure Postgres is running: `docker-compose up -d postgres` (from repo root). Then:

Run: `npm run test:e2e`
Expected: PASS (all suites — the existing `bookings.e2e-spec.ts` assertions use `toMatchObject`, which ignores the newly added fields).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/bookings/bookings.service.ts apps/api/src/bookings/bookings.service.spec.ts apps/api/src/bookings/bookings.module.ts
git commit -m "feat(api): enrich booking responses with court/venue and customer info"
```

---

## Task 2: BFF route handlers

**Files:**
- Create: `apps/web/src/app/api/bookings/route.ts`
- Create: `apps/web/src/app/api/bookings/mine/route.ts`
- Create: `apps/web/src/app/api/bookings/[id]/cancel/route.ts`
- Create: `apps/web/src/app/api/bookings/availability/route.ts`
- Create: `apps/web/src/app/api/venues/mine/[venueId]/bookings/route.ts`
- Create: `apps/web/src/app/api/venues/mine/[venueId]/bookings/[id]/cancel/route.ts`

**Interfaces:**
- Consumes: `fetchApi` (`@/lib/fetch-api`), `API_BASE_URL` (`@/lib/api-config`), `clearAuthCookies` (`@/lib/auth-cookies`), `toNextResponse` (`@/lib/proxy-response`) — all existing.
- Produces: the 6 `/api/*` endpoints used by Tasks 3-6.

No unit tests for these — this codebase has none for route handlers. Verified via manual smoke test (Step 6).

- [ ] **Step 1: `apps/web/src/app/api/bookings/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetchApi('/bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: `apps/web/src/app/api/bookings/mine/route.ts`**

```typescript
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET() {
  const upstream = await fetchApi('/bookings/mine');
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 3: `apps/web/src/app/api/bookings/[id]/cancel/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const upstream = await fetchApi(`/bookings/${id}/cancel`, {
    method: 'POST',
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 4: `apps/web/src/app/api/bookings/availability/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(request: NextRequest) {
  const courtId = request.nextUrl.searchParams.get('courtId') ?? '';
  const date = request.nextUrl.searchParams.get('date') ?? '';
  const upstream = await fetch(
    `${API_BASE_URL}/bookings/availability?courtId=${encodeURIComponent(courtId)}&date=${encodeURIComponent(date)}`,
  );
  return toNextResponse(upstream);
}
```

- [ ] **Step 5: `apps/web/src/app/api/venues/mine/[venueId]/bookings/route.ts` and `.../bookings/[id]/cancel/route.ts`**

`apps/web/src/app/api/venues/mine/[venueId]/bookings/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await params;
  const date = request.nextUrl.searchParams.get('date');
  const path = date
    ? `/venues/mine/${venueId}/bookings?date=${encodeURIComponent(date)}`
    : `/venues/mine/${venueId}/bookings`;
  const upstream = await fetchApi(path);
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

`apps/web/src/app/api/venues/mine/[venueId]/bookings/[id]/cancel/route.ts`:

```typescript
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string }> },
) {
  const { venueId, id } = await params;
  const upstream = await fetchApi(
    `/venues/mine/${venueId}/bookings/${id}/cancel`,
    { method: 'POST' },
  );
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 6: Manual smoke test**

Ensure the NestJS API (`apps/api`, `npm run start:dev`) is running on port 3001, then (from `apps/web`) start the web dev server:

```bash
npm run dev
```

In another terminal:
```bash
curl -i "http://localhost:3000/api/bookings/availability?courtId=00000000-0000-0000-0000-000000000000&date=2099-01-01"
```
Expected: `HTTP/1.1 404 Not Found` (court doesn't exist — confirms the request reached the backend and got a real response, not a client-side error).

```bash
curl -i http://localhost:3000/api/bookings/mine
```
Expected: `HTTP/1.1 401 Unauthorized` (no session cookie).

Stop the dev server (`Ctrl+C`).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/api/bookings apps/web/src/app/api/venues/mine/[venueId]/bookings
git commit -m "feat(web): add BFF route handlers for the Bookings module"
```

---

## Task 3: Slot-selection pure function

**Files:**
- Create: `apps/web/src/lib/slot-selection.ts`
- Create: `apps/web/src/lib/slot-selection.test.ts`

**Interfaces:**
- Produces: `AvailabilitySlot` (`{ start: string; end: string; price: number; isBooked: boolean }`), `computeMaxConsecutiveDuration(slots: AvailabilitySlot[], selectedIndex: number): number`.
- Consumed by: Task 4 (`/venues/[id]` page).

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/lib/slot-selection.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeMaxConsecutiveDuration, type AvailabilitySlot } from './slot-selection';

function slot(isBooked: boolean): AvailabilitySlot {
  return { start: '08:00', end: '09:00', price: 100000, isBooked };
}

describe('computeMaxConsecutiveDuration', () => {
  it('returns the full remaining count when nothing after is booked', () => {
    const slots = [slot(false), slot(false), slot(false)];
    expect(computeMaxConsecutiveDuration(slots, 0)).toBe(3);
  });

  it('stops at the first booked slot after the selection', () => {
    const slots = [slot(false), slot(false), slot(true), slot(false)];
    expect(computeMaxConsecutiveDuration(slots, 0)).toBe(2);
  });

  it('returns 1 when the selected slot is the last in the array', () => {
    const slots = [slot(false), slot(false), slot(false)];
    expect(computeMaxConsecutiveDuration(slots, 2)).toBe(1);
  });

  it('returns 0 when the selected slot itself is booked', () => {
    const slots = [slot(true), slot(false)];
    expect(computeMaxConsecutiveDuration(slots, 0)).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/web`): `npx vitest run src/lib/slot-selection.test.ts`
Expected: FAIL — cannot find module `./slot-selection`.

- [ ] **Step 3: Implement computeMaxConsecutiveDuration**

Create `apps/web/src/lib/slot-selection.ts`:

```typescript
export interface AvailabilitySlot {
  start: string;
  end: string;
  price: number;
  isBooked: boolean;
}

export function computeMaxConsecutiveDuration(
  slots: AvailabilitySlot[],
  selectedIndex: number,
): number {
  let count = 0;
  for (let i = selectedIndex; i < slots.length; i++) {
    if (slots[i].isBooked) break;
    count += 1;
  }
  return count;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/slot-selection.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/slot-selection.ts apps/web/src/lib/slot-selection.test.ts
git commit -m "feat(web): add slot-selection duration calculation"
```

---

## Task 4: Interactive booking flow on `/venues/[id]`

**Files:**
- Modify: `apps/web/src/app/venues/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/bookings/availability` (Task 2), `POST /api/bookings` (Task 2), `computeMaxConsecutiveDuration`, `type AvailabilitySlot` (Task 3), `getSubmitErrorMessage` (existing `@/lib/error-message`).

No unit tests — this is a page component (see Global Constraints). Verified via manual test (Step 4).

- [ ] **Step 1: Replace the file with the interactive version**

Replace the full contents of `apps/web/src/app/venues/[id]/page.tsx`:

```typescript
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
```

- [ ] **Step 2: Confirm the project builds**

Run (from `apps/web`): `npm run build`
Expected: exits 0.

- [ ] **Step 3: Manual verification**

With `apps/api` and `apps/web` dev servers running, visit `/venues/<id>` for an active venue with an active court (created during earlier Courts frontend verification). Expected: slot chips render; clicking an unbooked chip highlights it and shows a "Số giờ chơi" dropdown + summary + "Xác nhận đặt sân" button; clicking a second, non-adjacent chip re-selects instead of extending the range; increasing the duration dropdown extends the highlighted range and updates the total price. While logged out, clicking "Xác nhận đặt sân" redirects to `/login?returnTo=...`. While logged in as a customer, confirming shows a success toast, the booked chip becomes disabled/greyed, and reloading the page still shows it as booked.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/venues/[id]/page.tsx
git commit -m "feat(web): add interactive slot booking to the public venue page"
```

---

## Task 5: `/me/bookings` page

**Files:**
- Create: `apps/web/src/app/me/bookings/page.tsx`
- Modify: `apps/web/src/app/me/page.tsx`

**Interfaces:**
- Consumes: `GET /api/bookings/mine` (Task 2, returns `Booking & { courtName, venueName }` per Task 1), `POST /api/bookings/[id]/cancel` (Task 2), `getSubmitErrorMessage` (existing).

No unit tests — page component. Verified via manual test (Step 4).

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/me/bookings/page.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSubmitErrorMessage } from "@/lib/error-message";

type BookingStatus = "confirmed" | "cancelled" | "completed";

interface Booking {
  id: string;
  courtName: string;
  venueName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  status: BookingStatus;
}

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Đã xác nhận",
  cancelled: "Đã huỷ",
  completed: "Hoàn thành",
};

export default function MyBookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/bookings/mine")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fme%2Fbookings");
          return null;
        }
        return (await res.json()) as Booking[];
      })
      .then((data) => {
        if (!data) return;
        setBookings(data);
      });
  }, [router]);

  async function handleCancel(id: string) {
    const response = await fetch(`/api/bookings/${id}/cancel`, {
      method: "POST",
    });
    const data = await response.json().catch(() => null);
    setConfirmingId(null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã huỷ booking");
    setBookings(
      (current) =>
        current?.map((booking) =>
          booking.id === id ? { ...booking, status: "cancelled" } : booking,
        ) ?? null,
    );
  }

  if (!bookings) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p>Đang tải...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">Booking của tôi</h1>

      {bookings.length === 0 && (
        <p className="text-muted-foreground">Bạn chưa có booking nào.</p>
      )}

      <div className="flex flex-col gap-4">
        {bookings.map((booking) => (
          <Card key={booking.id}>
            <CardHeader>
              <CardTitle className="text-base">
                {booking.courtName} · {booking.venueName}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                <p>
                  {booking.date} · {booking.startTime}–{booking.endTime}
                </p>
                <p>
                  {booking.totalPrice.toLocaleString("vi-VN")}đ ·{" "}
                  {STATUS_LABEL[booking.status]}
                </p>
              </div>
              {booking.status === "confirmed" && (
                <div className="flex gap-2">
                  {confirmingId === booking.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleCancel(booking.id)}
                      >
                        Xác nhận huỷ?
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmingId(null)}
                      >
                        Thôi
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmingId(booking.id)}
                    >
                      Huỷ
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Add a nav link from `/me`**

In `apps/web/src/app/me/page.tsx`, add the import:

```typescript
import Link from "next/link";
```

next to the other imports (after `import { useRouter } from "next/navigation";`), and add `buttonVariants` to the existing button import:

```typescript
import { Button, buttonVariants } from "@/components/ui/button";
```

Then change:

```typescript
          <Button variant="outline" className="mt-4 w-full" onClick={handleLogout}>
            Đăng xuất
          </Button>
```

to:

```typescript
          <Link
            href="/me/bookings"
            className={`${buttonVariants({ variant: "outline" })} mt-4 w-full`}
          >
            Booking của tôi
          </Link>
          <Button variant="outline" className="mt-2 w-full" onClick={handleLogout}>
            Đăng xuất
          </Button>
```

- [ ] **Step 3: Confirm the project builds**

Run (from `apps/web`): `npm run build`
Expected: exits 0.

- [ ] **Step 4: Manual verification**

Log in as a customer who has at least one booking (from Task 4's manual test). Visit `/me` and click "Booking của tôi" — expected: lands on `/me/bookings`, listing the booking with court/venue name, time, price, and status badge. Click "Huỷ" — expected: it turns into "Xác nhận huỷ?" + "Thôi"; clicking "Thôi" reverts it; clicking "Xác nhận huỷ?" shows a success toast and the status badge updates to "Đã huỷ" with the cancel button gone. Reload the page — expected: the booking still shows "Đã huỷ" (persisted).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/me/bookings/page.tsx apps/web/src/app/me/page.tsx
git commit -m "feat(web): add /me/bookings page for customers"
```

---

## Task 6: Owner bookings section on `/owner/venues/[id]`

**Files:**
- Create: `apps/web/src/app/owner/venues/[id]/bookings-section.tsx`
- Modify: `apps/web/src/app/owner/venues/[id]/page.tsx`

**Interfaces:**
- Consumes: `type Court` (existing `./types`), `GET /api/venues/mine/[venueId]/bookings?date=` (Task 2, returns `Booking & { customerName, customerPhone }` per Task 1), `POST /api/venues/mine/[venueId]/bookings/[id]/cancel` (Task 2), `getSubmitErrorMessage` (existing).
- Produces: `BookingsSection({ venueId, courts }: { venueId: string; courts: Court[] })` component, consumed by `page.tsx`.

No unit tests — page component. Verified via manual test (Step 3).

- [ ] **Step 1: Create the section component**

Create `apps/web/src/app/owner/venues/[id]/bookings-section.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { Court } from "./types";

type BookingStatus = "confirmed" | "cancelled" | "completed";

interface OwnerBooking {
  id: string;
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
  status: BookingStatus;
  customerName: string;
  customerPhone: string | null;
}

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: "Đã xác nhận",
  cancelled: "Đã huỷ",
  completed: "Hoàn thành",
};

interface BookingsSectionProps {
  venueId: string;
  courts: Court[];
}

export function BookingsSection({ venueId, courts }: BookingsSectionProps) {
  const [bookings, setBookings] = useState<OwnerBooking[] | null>(null);
  const [date, setDate] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  async function loadBookings() {
    const query = date ? `?date=${date}` : "";
    const response = await fetch(
      `/api/venues/mine/${venueId}/bookings${query}`,
    );
    const data = await response.json().catch(() => []);
    setBookings(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadBookings();
  }, [venueId, date]);

  function courtName(courtId: string): string {
    return courts.find((court) => court.id === courtId)?.name ?? courtId;
  }

  async function handleCancel(id: string) {
    const response = await fetch(
      `/api/venues/mine/${venueId}/bookings/${id}/cancel`,
      { method: "POST" },
    );
    const data = await response.json().catch(() => null);
    setConfirmingId(null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã huỷ booking");
    setBookings(
      (current) =>
        current?.map((booking) =>
          booking.id === id ? { ...booking, status: "cancelled" } : booking,
        ) ?? null,
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Booking</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor="booking-date-filter">Lọc theo ngày</Label>
            <Input
              id="booking-date-filter"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          {date && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDate("")}
            >
              Xem tất cả
            </Button>
          )}
        </div>

        {bookings === null && <p className="text-sm">Đang tải...</p>}
        {bookings !== null && bookings.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Chưa có booking nào.
          </p>
        )}

        <div className="flex flex-col gap-4">
          {bookings?.map((booking) => (
            <Card key={booking.id}>
              <CardContent className="flex items-center justify-between pt-6">
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {courtName(booking.courtId)}
                  </p>
                  <p>
                    {booking.date} · {booking.startTime}–{booking.endTime}
                  </p>
                  <p>
                    {booking.customerName} · {booking.customerPhone ?? "Chưa có"}
                  </p>
                  <p>
                    {booking.totalPrice.toLocaleString("vi-VN")}đ ·{" "}
                    {STATUS_LABEL[booking.status]}
                  </p>
                </div>
                {booking.status === "confirmed" && (
                  <div className="flex gap-2">
                    {confirmingId === booking.id ? (
                      <>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleCancel(booking.id)}
                        >
                          Xác nhận huỷ?
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmingId(null)}
                        >
                          Thôi
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmingId(booking.id)}
                      >
                        Huỷ
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire the section into the venue detail page**

In `apps/web/src/app/owner/venues/[id]/page.tsx`, add the import:

```typescript
import { BookingsSection } from "./bookings-section";
```

Change:

```typescript
      {courts && (
        <CourtsSection
          venueId={venue.id}
          courts={courts}
          onCourtsChanged={setCourts}
        />
      )}
```

to:

```typescript
      {courts && (
        <>
          <CourtsSection
            venueId={venue.id}
            courts={courts}
            onCourtsChanged={setCourts}
          />
          <BookingsSection venueId={venue.id} courts={courts} />
        </>
      )}
```

- [ ] **Step 3: Confirm the project builds**

Run (from `apps/web`): `npm run build`
Expected: exits 0.

- [ ] **Step 4: Manual verification**

Log in as the owner of the venue used in Task 4's manual test. Visit `/owner/venues/<id>` — expected: a new "Booking" card below the courts list, showing the booking created in Task 4 with the court name, customer name/phone, time, price, and "Đã xác nhận" badge. Pick a date in the filter that doesn't match the booking's date — expected: "Chưa có booking nào."; click "Xem tất cả" — expected: the booking reappears. Click "Huỷ" → "Xác nhận huỷ?" — expected: success toast, badge updates to "Đã huỷ", cancel buttons disappear.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/owner/venues/[id]/bookings-section.tsx apps/web/src/app/owner/venues/[id]/page.tsx
git commit -m "feat(web): add owner bookings section to venue detail page"
```
