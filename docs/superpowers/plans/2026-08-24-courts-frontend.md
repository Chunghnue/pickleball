# Courts Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Next.js frontend (`apps/web`) for the Courts module: owner venue/court management, admin venue approval, and public search/detail/slot browsing — on top of the already-implemented Courts backend.

**Architecture:** Same BFF pattern as Auth+Users — Next.js route handlers under `apps/web/src/app/api/*` proxy to the NestJS API (`apps/api`), using the existing `fetchApi()` (authenticated, cookie + refresh) or plain `fetch(`${API_BASE_URL}/...`)` (public, unauthenticated) helpers, and `toNextResponse()` to relay the upstream response. Pages are client components (`"use client"`) that fetch through these same-origin `/api/*` routes, matching every existing page (`/me`, `/admin/owners`, etc.). One small backend addition (Task 1) is required first: the owner venue-detail endpoint doesn't currently return the venue's images, which the approved frontend design needs.

**Tech Stack:** Next.js 16 (App Router), React 19, react-hook-form + zod v4 (`@hookform/resolvers`), shadcn/ui (`Card`, `Button`, `Input`, `Label`, `Alert` only — no other components exist), sonner (toasts), Vitest (`environment: 'node'`, no DOM).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-24-courts-frontend-design.md`
- Browser never calls NestJS directly; every request goes through a same-origin `/api/*` Next.js route handler.
- Public (unauthenticated) route handlers use `fetch(`${API_BASE_URL}/...`)` directly (mirrors `/api/auth/register`, `/api/auth/verify-email`). Owner/admin (authenticated) route handlers use `fetchApi()` from `@/lib/fetch-api` (mirrors `/api/users/me`, `/api/admin/owners/*`).
- Owner-scoped route handlers call `clearAuthCookies()` on a 401 upstream response (mirrors `/api/users/me`); admin-scoped route handlers do not (mirrors `/api/admin/owners/*` exactly — do not "fix" this asymmetry, it's existing precedent).
- No new shadcn/ui components (no Dialog, Table, Select, Switch, Textarea). Reuse `Card`/`Button`/`Input`/`Label`/`Alert`. The court `isActive` toggle is a plain `<input type="checkbox">`, not a styled Switch.
- No test files for pages or route handlers — `apps/web/vitest.config.ts` sets `environment: 'node'` (no DOM/jsdom available), so only `lib/*.test.ts` (pure logic) get automated tests, matching every existing page in this codebase.
- Vietnamese UI copy throughout. Terminology: **venue → "địa điểm"**, **court → "sân"** (used consistently to avoid ambiguity between the two entities on the same page).
- `apps/web/proxy.ts` already protects `/owner/:path*` (role `owner`) and `/admin/:path*` (role `admin`) — no changes needed there. `/venues` and `/venues/[id]` are public and must NOT be added to the protected matcher.
- Landing page (`/`) is explicitly NOT modified (approved design decision, not an oversight).
- No booking action on the slot grid — slots are a non-interactive informational display only.
- Client-side Zod validation bounds must match the backend exactly: `pricePerHour` > 0, `slotDurationMinutes` in `[15, 240]`, `openTime`/`closeTime` match `HH:mm`.

---

## Task 1: Backend fix — include images in venue-detail responses

**Files:**
- Modify: `apps/api/src/courts/venues.service.spec.ts`
- Modify: `apps/api/src/courts/venues.service.ts`
- Modify: `apps/api/src/courts/venues.controller.ts`

**Interfaces:**
- Consumes: `VenueImage` entity (existing)
- Produces: `VenuesService.findImagesByVenue(venueId: string): Promise<VenueImage[]>` — no internal ownership/status check, same pattern as the existing `CourtsService.findActiveByVenue(venueId)`, which is always called only after the caller has already established access (ownership for the owner route, `findPublicById` for the public route). `GET /venues/mine/:id` now returns `{ ...venue fields, images: VenueImage[] }`, and the public `GET /venues/:id` now returns `{ ...venue fields, courts: Court[], images: VenueImage[] }`.

- [ ] **Step 1: Add `find: jest.fn()` to the venue-images repository mock and write a failing test for `findImagesByVenue`**

In `apps/api/src/courts/venues.service.spec.ts`, change the `mockVenueImagesRepository` factory from:

```typescript
const mockVenueImagesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
});
```

to:

```typescript
const mockVenueImagesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  find: jest.fn(),
});
```

Then add this new `describe` block anywhere after the `buildTestingModule` function definition:

```typescript
describe('VenuesService.findImagesByVenue', () => {
  it('returns images for the given venue', async () => {
    const { service, venueImagesRepo } = await buildTestingModule();
    venueImagesRepo.find.mockResolvedValue([
      { id: 'image-1', venueId: 'venue-1', url: 'https://example.com/a.jpg' },
    ]);

    const result = await service.findImagesByVenue('venue-1');

    expect(venueImagesRepo.find).toHaveBeenCalledWith({
      where: { venueId: 'venue-1' },
    });
    expect(result).toEqual([
      { id: 'image-1', venueId: 'venue-1', url: 'https://example.com/a.jpg' },
    ]);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run (from `apps/api`): `npx jest venues.service.spec.ts`
Expected: FAIL — `service.findImagesByVenue is not a function`.

- [ ] **Step 3: Implement `VenuesService.findImagesByVenue`**

In `apps/api/src/courts/venues.service.ts`, add this method (e.g. directly after `removeImage`):

```typescript
  findImagesByVenue(venueId: string): Promise<VenueImage[]> {
    return this.venueImagesRepository.find({ where: { venueId } });
  }
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx jest venues.service.spec.ts`
Expected: PASS, all tests green (15 tests total).

- [ ] **Step 5: Include images in both the owner and public venue-detail responses**

In `apps/api/src/courts/venues.controller.ts`, change:

```typescript
  @Get('mine/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  findMineById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.venuesService.findMineById(user.userId, id);
  }
```

to:

```typescript
  @Get('mine/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  async findMineById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const venue = await this.venuesService.findMineById(user.userId, id);
    const images = await this.venuesService.findImagesByVenue(id);
    return { ...venue, images };
  }
```

and change:

```typescript
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const venue = await this.venuesService.findPublicById(id);
    const courts = await this.courtsService.findActiveByVenue(id);
    return { ...venue, courts };
  }
```

to:

```typescript
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const venue = await this.venuesService.findPublicById(id);
    const courts = await this.courtsService.findActiveByVenue(id);
    const images = await this.venuesService.findImagesByVenue(id);
    return { ...venue, courts, images };
  }
```

- [ ] **Step 6: Run the full backend test suite**

Run (from `apps/api`): `npm test`
Expected: all suites pass (7 suites, 46 tests — 45 existing + 1 new).

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/courts/venues.service.spec.ts apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.controller.ts
git commit -m "feat(api): include images in owner and public venue-detail responses"
```

---

## Task 2: Frontend Zod schemas

**Files:**
- Modify: `apps/web/src/lib/schemas.ts`
- Modify: `apps/web/src/lib/schemas.test.ts`

**Interfaces:**
- Consumes: nothing (pure)
- Produces (used by Tasks 5, 7, 8):
  - `createVenueSchema`, `type CreateVenueInput`
  - `updateVenueSchema`, `type UpdateVenueInput`
  - `addVenueImageSchema`, `type AddVenueImageInput`
  - `createCourtSchema`, `type CreateCourtInput`
  - `updateCourtSchema`, `type UpdateCourtInput`

- [ ] **Step 1: Write failing tests**

Append to `apps/web/src/lib/schemas.test.ts` (add the new names to the existing top `import { ... } from './schemas'` statement, then add these `describe` blocks at the end of the file):

Change the import at the top of the file from:

```typescript
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from './schemas';
```

to:

```typescript
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  createVenueSchema,
  updateVenueSchema,
  addVenueImageSchema,
  createCourtSchema,
  updateCourtSchema,
} from './schemas';
```

Append at the end of the file:

```typescript
describe('createVenueSchema', () => {
  it('accepts a valid payload', () => {
    expect(
      createVenueSchema.safeParse({
        name: 'ABC Pickleball',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
      }).success,
    ).toBe(true);
  });

  it('rejects an empty name', () => {
    expect(
      createVenueSchema.safeParse({ name: '', address: 'X', city: 'Y' }).success,
    ).toBe(false);
  });

  it('accepts an optional description', () => {
    expect(
      createVenueSchema.safeParse({
        name: 'A',
        address: 'B',
        city: 'C',
        description: 'Mô tả',
      }).success,
    ).toBe(true);
  });
});

describe('updateVenueSchema', () => {
  it('accepts an empty object (no fields required)', () => {
    expect(updateVenueSchema.safeParse({}).success).toBe(true);
  });

  it('rejects an empty name when provided', () => {
    expect(updateVenueSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('addVenueImageSchema', () => {
  it('accepts a valid URL', () => {
    expect(
      addVenueImageSchema.safeParse({ url: 'https://example.com/a.jpg' }).success,
    ).toBe(true);
  });

  it('rejects an invalid URL', () => {
    expect(addVenueImageSchema.safeParse({ url: 'not-a-url' }).success).toBe(
      false,
    );
  });
});

describe('createCourtSchema', () => {
  const valid = {
    name: 'Sân 1',
    pricePerHour: 100000,
    openTime: '08:00',
    closeTime: '20:00',
    slotDurationMinutes: 60,
  };

  it('accepts a valid payload', () => {
    expect(createCourtSchema.safeParse(valid).success).toBe(true);
  });

  it('coerces string number inputs from form fields', () => {
    const result = createCourtSchema.safeParse({
      ...valid,
      pricePerHour: '100000',
      slotDurationMinutes: '60',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pricePerHour).toBe(100000);
      expect(result.data.slotDurationMinutes).toBe(60);
    }
  });

  it('rejects a price of 0', () => {
    expect(
      createCourtSchema.safeParse({ ...valid, pricePerHour: 0 }).success,
    ).toBe(false);
  });

  it('rejects a malformed openTime', () => {
    expect(
      createCourtSchema.safeParse({ ...valid, openTime: '8:00' }).success,
    ).toBe(false);
  });

  it('rejects a slotDurationMinutes below 15', () => {
    expect(
      createCourtSchema.safeParse({ ...valid, slotDurationMinutes: 10 }).success,
    ).toBe(false);
  });

  it('rejects a slotDurationMinutes above 240', () => {
    expect(
      createCourtSchema.safeParse({ ...valid, slotDurationMinutes: 300 }).success,
    ).toBe(false);
  });
});

describe('updateCourtSchema', () => {
  it('accepts an empty object (no fields required)', () => {
    expect(updateCourtSchema.safeParse({}).success).toBe(true);
  });

  it('accepts isActive alone', () => {
    expect(updateCourtSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('rejects an out-of-range slotDurationMinutes when provided', () => {
    expect(
      updateCourtSchema.safeParse({ slotDurationMinutes: 500 }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run (from `apps/web`): `npx vitest run src/lib/schemas.test.ts`
Expected: FAIL — the import of `createVenueSchema` (and the others) fails because they don't exist in `./schemas` yet.

- [ ] **Step 3: Implement the schemas**

Append to `apps/web/src/lib/schemas.ts`:

```typescript
export const createVenueSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên địa điểm'),
  address: z.string().min(1, 'Vui lòng nhập địa chỉ'),
  city: z.string().min(1, 'Vui lòng nhập thành phố'),
  description: z.string().optional(),
});
export type CreateVenueInput = z.infer<typeof createVenueSchema>;

export const updateVenueSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên địa điểm').optional(),
  address: z.string().min(1, 'Vui lòng nhập địa chỉ').optional(),
  city: z.string().min(1, 'Vui lòng nhập thành phố').optional(),
  description: z.string().optional(),
});
export type UpdateVenueInput = z.infer<typeof updateVenueSchema>;

export const addVenueImageSchema = z.object({
  url: z.string().url('URL không hợp lệ'),
});
export type AddVenueImageInput = z.infer<typeof addVenueImageSchema>;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const createCourtSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên sân'),
  pricePerHour: z.coerce.number().min(0.01, 'Giá phải lớn hơn 0'),
  openTime: z
    .string()
    .regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)'),
  closeTime: z
    .string()
    .regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)'),
  slotDurationMinutes: z.coerce
    .number()
    .int('Phải là số nguyên')
    .min(15, 'Tối thiểu 15 phút')
    .max(240, 'Tối đa 240 phút'),
});
export type CreateCourtInput = z.infer<typeof createCourtSchema>;

export const updateCourtSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên sân').optional(),
  pricePerHour: z.coerce.number().min(0.01, 'Giá phải lớn hơn 0').optional(),
  openTime: z
    .string()
    .regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)')
    .optional(),
  closeTime: z
    .string()
    .regex(TIME_PATTERN, 'Định dạng giờ không hợp lệ (HH:mm)')
    .optional(),
  slotDurationMinutes: z.coerce
    .number()
    .int('Phải là số nguyên')
    .min(15, 'Tối thiểu 15 phút')
    .max(240, 'Tối đa 240 phút')
    .optional(),
  isActive: z.boolean().optional(),
});
export type UpdateCourtInput = z.infer<typeof updateCourtSchema>;
```

- [ ] **Step 4: Run and confirm pass**

Run: `npx vitest run src/lib/schemas.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/schemas.ts apps/web/src/lib/schemas.test.ts
git commit -m "feat(web): add venue and court validation schemas"
```

---

## Task 3: BFF route handlers

**Files:**
- Create: `apps/web/src/app/api/venues/route.ts`
- Create: `apps/web/src/app/api/venues/mine/route.ts`
- Create: `apps/web/src/app/api/venues/mine/[id]/route.ts`
- Create: `apps/web/src/app/api/venues/mine/[id]/images/route.ts`
- Create: `apps/web/src/app/api/venues/mine/[id]/images/[imageId]/route.ts`
- Create: `apps/web/src/app/api/venues/mine/[venueId]/courts/route.ts`
- Create: `apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/route.ts`
- Create: `apps/web/src/app/api/venues/[id]/route.ts`
- Create: `apps/web/src/app/api/courts/[id]/slots/route.ts`
- Create: `apps/web/src/app/api/admin/venues/pending/route.ts`
- Create: `apps/web/src/app/api/admin/venues/[id]/approve/route.ts`
- Create: `apps/web/src/app/api/admin/venues/[id]/reject/route.ts`

**Interfaces:**
- Consumes: `fetchApi` (`@/lib/fetch-api`), `API_BASE_URL` (`@/lib/api-config`), `clearAuthCookies` (`@/lib/auth-cookies`), `toNextResponse` (`@/lib/proxy-response`) — all existing
- Produces: the 15 `/api/*` endpoints listed in the design spec section 2, used by every page task below

No unit tests for these — this codebase has none for route handlers (confirmed: only `lib/*.test.ts` exist). Verified via manual smoke test (Step 14).

- [ ] **Step 1: `apps/web/src/app/api/venues/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query');
  const url = query
    ? `${API_BASE_URL}/venues?query=${encodeURIComponent(query)}`
    : `${API_BASE_URL}/venues`;
  const upstream = await fetch(url);
  return toNextResponse(upstream);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetchApi('/venues', {
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

- [ ] **Step 2: `apps/web/src/app/api/venues/mine/route.ts`**

```typescript
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET() {
  const upstream = await fetchApi('/venues/mine');
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 3: `apps/web/src/app/api/venues/mine/[id]/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const upstream = await fetchApi(`/venues/mine/${id}`);
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const upstream = await fetchApi(`/venues/mine/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 4: `apps/web/src/app/api/venues/mine/[id]/images/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const upstream = await fetchApi(`/venues/mine/${id}/images`, {
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

- [ ] **Step 5: `apps/web/src/app/api/venues/mine/[id]/images/[imageId]/route.ts`**

```typescript
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> },
) {
  const { id, imageId } = await params;
  const upstream = await fetchApi(`/venues/mine/${id}/images/${imageId}`, {
    method: 'DELETE',
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 6: `apps/web/src/app/api/venues/mine/[venueId]/courts/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await params;
  const upstream = await fetchApi(`/venues/mine/${venueId}/courts`);
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await params;
  const body = await request.json();
  const upstream = await fetchApi(`/venues/mine/${venueId}/courts`, {
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

- [ ] **Step 7: `apps/web/src/app/api/venues/mine/[venueId]/courts/[id]/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import { fetchApi } from '@/lib/fetch-api';
import { clearAuthCookies } from '@/lib/auth-cookies';
import { toNextResponse } from '@/lib/proxy-response';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string; id: string }> },
) {
  const { venueId, id } = await params;
  const body = await request.json();
  const upstream = await fetchApi(`/venues/mine/${venueId}/courts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 8: `apps/web/src/app/api/venues/[id]/route.ts`**

```typescript
import { API_BASE_URL } from '@/lib/api-config';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const upstream = await fetch(`${API_BASE_URL}/venues/${id}`);
  return toNextResponse(upstream);
}
```

- [ ] **Step 9: `apps/web/src/app/api/courts/[id]/slots/route.ts`**

```typescript
import { NextRequest } from 'next/server';
import { API_BASE_URL } from '@/lib/api-config';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const date = request.nextUrl.searchParams.get('date') ?? '';
  const upstream = await fetch(
    `${API_BASE_URL}/courts/${id}/slots?date=${encodeURIComponent(date)}`,
  );
  return toNextResponse(upstream);
}
```

- [ ] **Step 10: `apps/web/src/app/api/admin/venues/pending/route.ts`**

```typescript
import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function GET() {
  const upstream = await fetchApi('/admin/venues/pending');
  return toNextResponse(upstream);
}
```

- [ ] **Step 11: `apps/web/src/app/api/admin/venues/[id]/approve/route.ts`**

```typescript
import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const upstream = await fetchApi(`/admin/venues/${id}/approve`, {
    method: 'POST',
  });
  return toNextResponse(upstream);
}
```

- [ ] **Step 12: `apps/web/src/app/api/admin/venues/[id]/reject/route.ts`**

```typescript
import { fetchApi } from '@/lib/fetch-api';
import { toNextResponse } from '@/lib/proxy-response';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const upstream = await fetchApi(`/admin/venues/${id}/reject`, {
    method: 'POST',
  });
  return toNextResponse(upstream);
}
```

- [ ] **Step 13: Confirm the project builds**

Run (from `apps/web`): `npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 14: Manual smoke test**

Ensure the NestJS API (`apps/api`, `npm run start:dev`) is running on port 3001, then start the web dev server:

```bash
npm run dev
```

In another terminal:
```bash
curl -i http://localhost:3000/api/venues
```
Expected: `HTTP/1.1 200 OK` with body `[]`.

```bash
curl -i http://localhost:3000/api/admin/venues/pending
```
Expected: `HTTP/1.1 401 Unauthorized` (no session cookie).

Stop the dev server (`Ctrl+C`).

- [ ] **Step 15: Commit**

```bash
git add apps/web/src/app/api/venues apps/web/src/app/api/courts apps/web/src/app/api/admin/venues
git commit -m "feat(web): add BFF route handlers for the Courts module"
```

---

## Task 4: Owner venue list page (`/owner`)

**Files:**
- Modify: `apps/web/src/app/owner/page.tsx` (replaces the current placeholder entirely)

**Interfaces:**
- Consumes: `GET /api/venues/mine` (Task 3)
- Produces: nothing consumed by later tasks (leaf page)

- [ ] **Step 1: Replace the placeholder page**

```typescript
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Venue {
  id: string;
  name: string;
  city: string;
  status: "pending_approval" | "active" | "rejected";
}

const STATUS_LABEL: Record<Venue["status"], string> = {
  pending_approval: "Đang chờ duyệt",
  active: "Đang hoạt động",
  rejected: "Bị từ chối",
};

const STATUS_CLASS: Record<Venue["status"], string> = {
  pending_approval: "text-amber-600",
  active: "text-emerald-600",
  rejected: "text-destructive",
};

export default function OwnerDashboardPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[] | null>(null);

  useEffect(() => {
    fetch("/api/venues/mine")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner");
          return null;
        }
        return (await res.json()) as Venue[];
      })
      .then((data) => {
        if (!data) return;
        setVenues(data);
      });
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sân của tôi</h1>
        <div className="flex gap-2">
          <Link href="/owner/venues/new" className={buttonVariants()}>
            Thêm sân mới
          </Link>
          <Button variant="outline" onClick={handleLogout}>
            Đăng xuất
          </Button>
        </div>
      </div>

      {venues === null && <p>Đang tải...</p>}
      {venues !== null && venues.length === 0 && (
        <p className="text-muted-foreground">
          Bạn chưa có địa điểm nào. Hãy thêm sân mới để bắt đầu.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {venues?.map((venue) => (
          <Link key={venue.id} href={`/owner/venues/${venue.id}`}>
            <Card className="transition-colors hover:bg-muted">
              <CardHeader>
                <CardTitle className="text-base">{venue.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {venue.city}
                </span>
                <span
                  className={`text-sm font-medium ${STATUS_CLASS[venue.status]}`}
                >
                  {STATUS_LABEL[venue.status]}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Confirm the project builds**

Run (from `apps/web`): `npm run build`
Expected: exits 0.

- [ ] **Step 3: Manual verification**

With `apps/api` and `apps/web` dev servers running, log in as an owner in the browser and visit `/owner`. Expected: "Sân của tôi" heading, empty-state message (no venues yet), and a working "Thêm sân mới" link (404 until Task 5 exists — that's expected at this point).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/owner/page.tsx
git commit -m "feat(web): add owner venue list page"
```

---

## Task 5: Owner create-venue page (`/owner/venues/new`)

**Files:**
- Create: `apps/web/src/app/owner/venues/new/page.tsx`

**Interfaces:**
- Consumes: `createVenueSchema`, `type CreateVenueInput` (Task 2), `POST /api/venues` (Task 3), `getSubmitErrorMessage` (existing `@/lib/error-message`)
- Produces: nothing consumed by later tasks (leaf page)

- [ ] **Step 1: Create the page**

```typescript
"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createVenueSchema, type CreateVenueInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

export default function NewVenuePage() {
  const router = useRouter();
  const form = useForm<CreateVenueInput>({
    resolver: zodResolver(createVenueSchema),
    defaultValues: { name: "", address: "", city: "", description: "" },
  });

  async function onSubmit(values: CreateVenueInput) {
    const response = await fetch("/api/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã tạo địa điểm, đang chờ admin duyệt");
    router.push(`/owner/venues/${data.id}`);
  }

  const { errors } = form.formState;

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Thêm sân mới</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Tên địa điểm</Label>
              <Input
                id="name"
                aria-invalid={!!errors.name}
                {...form.register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Địa chỉ</Label>
              <Input
                id="address"
                aria-invalid={!!errors.address}
                {...form.register("address")}
              />
              {errors.address && (
                <p className="text-sm text-destructive">
                  {errors.address.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Thành phố</Label>
              <Input
                id="city"
                aria-invalid={!!errors.city}
                {...form.register("city")}
              />
              {errors.city && (
                <p className="text-sm text-destructive">{errors.city.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Mô tả (tuỳ chọn)</Label>
              <Input id="description" {...form.register("description")} />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              Tạo địa điểm
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Confirm the project builds**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Manual verification**

Visit `/owner/venues/new` as a logged-in owner, submit the form. Expected: success toast, redirect to `/owner/venues/<new-id>` (404 until Task 6 exists — expected at this point). Revisit `/owner` and confirm the new venue now appears with "Đang chờ duyệt".

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/owner/venues/new/page.tsx
git commit -m "feat(web): add owner create-venue page"
```

---

## Task 6: Venue detail shell + venue info section

**Files:**
- Create: `apps/web/src/app/owner/venues/[id]/types.ts`
- Create: `apps/web/src/app/owner/venues/[id]/page.tsx`
- Create: `apps/web/src/app/owner/venues/[id]/venue-info-section.tsx`

**Interfaces:**
- Consumes: `GET/PATCH /api/venues/mine/[id]` (Task 3, now returns `images` per Task 1), `updateVenueSchema`, `type UpdateVenueInput` (Task 2)
- Produces (used by Tasks 7, 8): `Venue`, `VenueImage`, `Court` interfaces from `./types`; `VenueInfoSection` component

- [ ] **Step 1: Create the shared types**

```typescript
// apps/web/src/app/owner/venues/[id]/types.ts
export interface VenueImage {
  id: string;
  url: string;
}

export interface Court {
  id: string;
  name: string;
  pricePerHour: number;
  openTime: string;
  closeTime: string;
  slotDurationMinutes: number;
  isActive: boolean;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  description: string | null;
  status: "pending_approval" | "active" | "rejected";
  images: VenueImage[];
}
```

- [ ] **Step 2: Create the venue info section**

```typescript
// apps/web/src/app/owner/venues/[id]/venue-info-section.tsx
"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateVenueSchema, type UpdateVenueInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { Venue } from "./types";

interface VenueInfoSectionProps {
  venue: Venue;
  onUpdated: (venue: Venue) => void;
}

export function VenueInfoSection({ venue, onUpdated }: VenueInfoSectionProps) {
  const form = useForm<UpdateVenueInput>({
    resolver: zodResolver(updateVenueSchema),
    defaultValues: {
      name: venue.name,
      address: venue.address,
      city: venue.city,
      description: venue.description ?? "",
    },
  });

  async function onSubmit(values: UpdateVenueInput) {
    const response = await fetch(`/api/venues/mine/${venue.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã lưu thay đổi");
    onUpdated({ ...venue, ...(data as Venue) });
  }

  const { errors } = form.formState;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông tin địa điểm</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {venue.status === "rejected" && (
          <Alert variant="destructive">
            <AlertTitle>Địa điểm này đã bị admin từ chối.</AlertTitle>
          </Alert>
        )}
        {venue.status === "pending_approval" && (
          <Alert>
            <AlertTitle>Địa điểm đang chờ admin duyệt.</AlertTitle>
          </Alert>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Tên địa điểm</Label>
            <Input
              id="name"
              aria-invalid={!!errors.name}
              {...form.register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Địa chỉ</Label>
            <Input
              id="address"
              aria-invalid={!!errors.address}
              {...form.register("address")}
            />
            {errors.address && (
              <p className="text-sm text-destructive">
                {errors.address.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">Thành phố</Label>
            <Input
              id="city"
              aria-invalid={!!errors.city}
              {...form.register("city")}
            />
            {errors.city && (
              <p className="text-sm text-destructive">{errors.city.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Mô tả</Label>
            <Input id="description" {...form.register("description")} />
          </div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Lưu thay đổi
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

Note: `data` from the `PATCH` response is the raw venue (no `images` field), so `onUpdated` merges it into the existing `venue` object (`{ ...venue, ...data }`) rather than replacing it, to avoid dropping `images` from state.

- [ ] **Step 3: Create the page shell**

```typescript
// apps/web/src/app/owner/venues/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { VenueInfoSection } from "./venue-info-section";
import type { Venue } from "./types";

export default function OwnerVenueDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [venue, setVenue] = useState<Venue | null>(null);

  useEffect(() => {
    fetch(`/api/venues/mine/${params.id}`)
      .then(async (res) => {
        if (res.status === 401) {
          router.push(`/login?returnTo=%2Fowner%2Fvenues%2F${params.id}`);
          return null;
        }
        if (res.status === 404) {
          router.push("/owner");
          return null;
        }
        return (await res.json()) as Venue;
      })
      .then((data) => {
        if (!data) return;
        setVenue(data);
      });
  }, [params.id, router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{venue.name}</h1>
        <Button variant="outline" onClick={handleLogout}>
          Đăng xuất
        </Button>
      </div>

      <VenueInfoSection venue={venue} onUpdated={setVenue} />
    </main>
  );
}
```

- [ ] **Step 4: Confirm the project builds**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 5: Manual verification**

Visit `/owner/venues/<id>` for a venue created in Task 5. Expected: title, status `Alert` banner, editable info form; editing and saving shows a success toast and the new values persist on reload.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/owner/venues/[id]/types.ts apps/web/src/app/owner/venues/[id]/page.tsx apps/web/src/app/owner/venues/[id]/venue-info-section.tsx
git commit -m "feat(web): add owner venue detail page with editable info"
```

---

## Task 7: Venue images section

**Files:**
- Create: `apps/web/src/app/owner/venues/[id]/venue-images-section.tsx`
- Modify: `apps/web/src/app/owner/venues/[id]/page.tsx`

**Interfaces:**
- Consumes: `Venue`, `VenueImage` (Task 6 `./types`), `POST/DELETE /api/venues/mine/[id]/images*` (Task 3)
- Produces: `VenueImagesSection` component, rendered by `page.tsx`

- [ ] **Step 1: Create the images section**

```typescript
// apps/web/src/app/owner/venues/[id]/venue-images-section.tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { VenueImage } from "./types";

interface VenueImagesSectionProps {
  venueId: string;
  images: VenueImage[];
  onImagesChanged: (images: VenueImage[]) => void;
}

export function VenueImagesSection({
  venueId,
  images,
  onImagesChanged,
}: VenueImagesSectionProps) {
  const [newUrl, setNewUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setError(null);
    const response = await fetch(`/api/venues/mine/${venueId}/images`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: newUrl }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      setError(data?.message ?? "URL không hợp lệ");
      return;
    }

    onImagesChanged([...images, data as VenueImage]);
    setNewUrl("");
    toast.success("Đã thêm ảnh");
  }

  async function handleRemove(imageId: string) {
    const response = await fetch(
      `/api/venues/mine/${venueId}/images/${imageId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      toast.error("Không thể xoá ảnh, vui lòng thử lại.");
      return;
    }
    onImagesChanged(images.filter((image) => image.id !== imageId));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ảnh</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {images.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có ảnh nào.</p>
        )}
        <ul className="flex flex-col gap-2">
          {images.map((image) => (
            <li
              key={image.id}
              className="flex items-center justify-between gap-2"
            >
              <a
                href={image.url}
                target="_blank"
                rel="noreferrer"
                className="truncate text-sm underline"
              >
                {image.url}
              </a>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => handleRemove(image.id)}
              >
                Xoá
              </Button>
            </li>
          ))}
        </ul>
        <div className="space-y-2">
          <Label htmlFor="newImageUrl">Thêm URL ảnh</Label>
          <div className="flex gap-2">
            <Input
              id="newImageUrl"
              value={newUrl}
              onChange={(event) => setNewUrl(event.target.value)}
            />
            <Button type="button" onClick={handleAdd}>
              Thêm
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire it into the page**

In `apps/web/src/app/owner/venues/[id]/page.tsx`, add the import:

```typescript
import { VenueImagesSection } from "./venue-images-section";
```

and render it after `<VenueInfoSection ... />`:

```typescript
      <VenueInfoSection venue={venue} onUpdated={setVenue} />
      <VenueImagesSection
        venueId={venue.id}
        images={venue.images}
        onImagesChanged={(images) => setVenue({ ...venue, images })}
      />
```

- [ ] **Step 3: Confirm the project builds**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Manual verification**

On `/owner/venues/<id>`, add an image URL (expect it to appear in the list immediately), reload the page (expect it to still be there — this is what Task 1's backend fix enables), then remove it (expect it to disappear).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/owner/venues/[id]/venue-images-section.tsx apps/web/src/app/owner/venues/[id]/page.tsx
git commit -m "feat(web): add venue images management"
```

---

## Task 8: Courts section (list, inline edit, add)

**Files:**
- Create: `apps/web/src/app/owner/venues/[id]/courts-section.tsx`
- Modify: `apps/web/src/app/owner/venues/[id]/page.tsx`

**Interfaces:**
- Consumes: `Court` (Task 6 `./types`), `createCourtSchema`/`updateCourtSchema` + input types (Task 2), `GET/POST /api/venues/mine/[venueId]/courts`, `PATCH /api/venues/mine/[venueId]/courts/[id]` (Task 3)
- Produces: `CourtsSection` component, rendered by `page.tsx`. Page now also fetches the venue's courts on mount.

- [ ] **Step 1: Create the courts section**

```typescript
// apps/web/src/app/owner/venues/[id]/courts-section.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createCourtSchema,
  updateCourtSchema,
  type CreateCourtInput,
  type UpdateCourtInput,
} from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { Court } from "./types";

interface CourtsSectionProps {
  venueId: string;
  courts: Court[];
  onCourtsChanged: (courts: Court[]) => void;
}

export function CourtsSection({
  venueId,
  courts,
  onCourtsChanged,
}: CourtsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Danh sách sân</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {courts.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có sân nào.</p>
        )}
        <div className="flex flex-col gap-4">
          {courts.map((court) => (
            <CourtCard
              key={court.id}
              venueId={venueId}
              court={court}
              onUpdated={(updated) =>
                onCourtsChanged(
                  courts.map((c) => (c.id === updated.id ? updated : c)),
                )
              }
            />
          ))}
        </div>
        <AddCourtForm
          venueId={venueId}
          onCreated={(created) => onCourtsChanged([...courts, created])}
        />
      </CardContent>
    </Card>
  );
}

function CourtCard({
  venueId,
  court,
  onUpdated,
}: {
  venueId: string;
  court: Court;
  onUpdated: (court: Court) => void;
}) {
  const [editing, setEditing] = useState(false);
  const form = useForm<UpdateCourtInput>({
    resolver: zodResolver(updateCourtSchema),
    defaultValues: {
      name: court.name,
      pricePerHour: court.pricePerHour,
      openTime: court.openTime.slice(0, 5),
      closeTime: court.closeTime.slice(0, 5),
      slotDurationMinutes: court.slotDurationMinutes,
      isActive: court.isActive,
    },
  });

  async function onSubmit(values: UpdateCourtInput) {
    const response = await fetch(
      `/api/venues/mine/${venueId}/courts/${court.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      },
    );
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã lưu thay đổi");
    onUpdated(data as Court);
    setEditing(false);
  }

  const { errors } = form.formState;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{court.name}</CardTitle>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? "Đóng" : "Sửa"}
        </Button>
      </CardHeader>
      <CardContent>
        {!editing && (
          <p className="text-sm text-muted-foreground">
            {court.pricePerHour.toLocaleString("vi-VN")}đ/giờ ·{" "}
            {court.openTime.slice(0, 5)}–{court.closeTime.slice(0, 5)} ·{" "}
            {court.isActive ? "Đang hoạt động" : "Đã tắt"}
          </p>
        )}
        {editing && (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`name-${court.id}`}>Tên sân</Label>
              <Input
                id={`name-${court.id}`}
                aria-invalid={!!errors.name}
                {...form.register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`price-${court.id}`}>Giá/giờ (VNĐ)</Label>
              <Input
                id={`price-${court.id}`}
                type="number"
                step="1000"
                aria-invalid={!!errors.pricePerHour}
                {...form.register("pricePerHour")}
              />
              {errors.pricePerHour && (
                <p className="text-sm text-destructive">
                  {errors.pricePerHour.message}
                </p>
              )}
            </div>
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor={`open-${court.id}`}>Giờ mở cửa</Label>
                <Input
                  id={`open-${court.id}`}
                  type="time"
                  aria-invalid={!!errors.openTime}
                  {...form.register("openTime")}
                />
                {errors.openTime && (
                  <p className="text-sm text-destructive">
                    {errors.openTime.message}
                  </p>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor={`close-${court.id}`}>Giờ đóng cửa</Label>
                <Input
                  id={`close-${court.id}`}
                  type="time"
                  aria-invalid={!!errors.closeTime}
                  {...form.register("closeTime")}
                />
                {errors.closeTime && (
                  <p className="text-sm text-destructive">
                    {errors.closeTime.message}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`slot-${court.id}`}>
                Độ dài khung giờ (phút)
              </Label>
              <Input
                id={`slot-${court.id}`}
                type="number"
                aria-invalid={!!errors.slotDurationMinutes}
                {...form.register("slotDurationMinutes")}
              />
              {errors.slotDurationMinutes && (
                <p className="text-sm text-destructive">
                  {errors.slotDurationMinutes.message}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                id={`active-${court.id}`}
                type="checkbox"
                {...form.register("isActive")}
              />
              <Label htmlFor={`active-${court.id}`}>Đang hoạt động</Label>
            </div>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Lưu
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function AddCourtForm({
  venueId,
  onCreated,
}: {
  venueId: string;
  onCreated: (court: Court) => void;
}) {
  const defaultValues: CreateCourtInput = {
    name: "",
    pricePerHour: 0,
    openTime: "08:00",
    closeTime: "20:00",
    slotDurationMinutes: 60,
  };
  const form = useForm<CreateCourtInput>({
    resolver: zodResolver(createCourtSchema),
    defaultValues,
  });

  async function onSubmit(values: CreateCourtInput) {
    const response = await fetch(`/api/venues/mine/${venueId}/courts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã thêm sân");
    onCreated(data as Court);
    form.reset(defaultValues);
  }

  const { errors } = form.formState;

  return (
    <div className="border-t pt-4">
      <h3 className="mb-4 text-sm font-medium">Thêm sân mới</h3>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-court-name">Tên sân</Label>
          <Input
            id="new-court-name"
            aria-invalid={!!errors.name}
            {...form.register("name")}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-court-price">Giá/giờ (VNĐ)</Label>
          <Input
            id="new-court-price"
            type="number"
            step="1000"
            aria-invalid={!!errors.pricePerHour}
            {...form.register("pricePerHour")}
          />
          {errors.pricePerHour && (
            <p className="text-sm text-destructive">
              {errors.pricePerHour.message}
            </p>
          )}
        </div>
        <div className="flex gap-4">
          <div className="flex-1 space-y-2">
            <Label htmlFor="new-court-open">Giờ mở cửa</Label>
            <Input
              id="new-court-open"
              type="time"
              aria-invalid={!!errors.openTime}
              {...form.register("openTime")}
            />
            {errors.openTime && (
              <p className="text-sm text-destructive">
                {errors.openTime.message}
              </p>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <Label htmlFor="new-court-close">Giờ đóng cửa</Label>
            <Input
              id="new-court-close"
              type="time"
              aria-invalid={!!errors.closeTime}
              {...form.register("closeTime")}
            />
            {errors.closeTime && (
              <p className="text-sm text-destructive">
                {errors.closeTime.message}
              </p>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-court-slot">Độ dài khung giờ (phút)</Label>
          <Input
            id="new-court-slot"
            type="number"
            aria-invalid={!!errors.slotDurationMinutes}
            {...form.register("slotDurationMinutes")}
          />
          {errors.slotDurationMinutes && (
            <p className="text-sm text-destructive">
              {errors.slotDurationMinutes.message}
            </p>
          )}
        </div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Thêm sân
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the page**

In `apps/web/src/app/owner/venues/[id]/page.tsx`, add the import:

```typescript
import { CourtsSection } from "./courts-section";
import type { Court } from "./types";
```

Add court state and a fetch effect (after the existing `venue` state):

```typescript
  const [courts, setCourts] = useState<Court[] | null>(null);

  useEffect(() => {
    if (!venue) return;
    fetch(`/api/venues/mine/${venue.id}/courts`)
      .then((res) => res.json())
      .then((data) => setCourts(Array.isArray(data) ? data : []));
  }, [venue]);
```

Render it after `<VenueImagesSection ... />`:

```typescript
      {courts && (
        <CourtsSection
          venueId={venue.id}
          courts={courts}
          onCourtsChanged={setCourts}
        />
      )}
```

- [ ] **Step 3: Confirm the project builds**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Manual verification**

On `/owner/venues/<id>`, add a court via "Thêm sân mới" (expect it to appear in the list), click "Sửa" on it, change the price and toggle "Đang hoạt động" off, save (expect the summary line to update and show "Đã tắt"), reload the page (expect the change to persist).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/owner/venues/[id]/courts-section.tsx apps/web/src/app/owner/venues/[id]/page.tsx
git commit -m "feat(web): add court management to venue detail page"
```

---

## Task 9: Admin venue approval page + shared admin nav

**Files:**
- Create: `apps/web/src/components/admin-nav.tsx`
- Create: `apps/web/src/app/admin/venues/page.tsx`
- Modify: `apps/web/src/app/admin/owners/page.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/venues/pending`, `POST /api/admin/venues/[id]/approve|reject` (Task 3)
- Produces: `AdminNav` component

- [ ] **Step 1: Create the shared admin nav**

```typescript
// apps/web/src/components/admin-nav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/owners", label: "Chủ sân chờ duyệt" },
  { href: "/admin/venues", label: "Sân chờ duyệt" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 border-b pb-2">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "text-sm font-medium text-muted-foreground hover:text-foreground",
            pathname === link.href && "text-foreground underline",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Create the admin venues page**

```typescript
// apps/web/src/app/admin/venues/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminNav } from "@/components/admin-nav";

interface PendingVenue {
  id: string;
  name: string;
  address: string;
  city: string;
}

export default function AdminVenuesPage() {
  const router = useRouter();
  const [venues, setVenues] = useState<PendingVenue[] | null>(null);

  async function loadPending() {
    const response = await fetch("/api/admin/venues/pending");
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fadmin%2Fvenues");
      return;
    }
    const data = await response.json().catch(() => []);
    setVenues(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadPending();
  }, []);

  async function handleDecision(id: string, action: "approve" | "reject") {
    const response = await fetch(`/api/admin/venues/${id}/${action}`, {
      method: "POST",
    });
    if (!response.ok) {
      toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      return;
    }
    toast.success(action === "approve" ? "Đã duyệt sân" : "Đã từ chối sân");
    loadPending();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <AdminNav />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sân chờ duyệt</h1>
        <Button variant="outline" onClick={handleLogout}>
          Đăng xuất
        </Button>
      </div>

      {venues === null && <p>Đang tải...</p>}
      {venues !== null && venues.length === 0 && (
        <p className="text-muted-foreground">
          Không có sân nào đang chờ duyệt.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {venues?.map((venue) => (
          <Card key={venue.id}>
            <CardHeader>
              <CardTitle className="text-base">{venue.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {venue.address}, {venue.city}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => handleDecision(venue.id, "approve")}
                >
                  Duyệt
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDecision(venue.id, "reject")}
                >
                  Từ chối
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Add the nav to the existing admin owners page**

In `apps/web/src/app/admin/owners/page.tsx`, add the import:

```typescript
import { AdminNav } from "@/components/admin-nav";
```

and render it as the first child inside `<main>`, right before the existing header `<div>`:

```typescript
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <AdminNav />
      <div className="flex items-center justify-between">
```

- [ ] **Step 4: Confirm the project builds**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 5: Manual verification**

Log in as admin, visit `/admin/owners`. Expected: nav bar with both links, current page underlined. Click "Sân chờ duyệt" — expect it to navigate to `/admin/venues` and list any pending venues from earlier tasks, with working "Duyệt"/"Từ chối" buttons.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/admin-nav.tsx apps/web/src/app/admin/venues/page.tsx apps/web/src/app/admin/owners/page.tsx
git commit -m "feat(web): add admin venue approval page and shared admin nav"
```

---

## Task 10: Public venue search page (`/venues`)

**Files:**
- Create: `apps/web/src/app/venues/page.tsx`

**Interfaces:**
- Consumes: `GET /api/venues?query=` (Task 3)
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Create the page**

```typescript
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PublicVenue {
  id: string;
  name: string;
  address: string;
  city: string;
}

export default function VenuesSearchPage() {
  const [query, setQuery] = useState("");
  const [venues, setVenues] = useState<PublicVenue[] | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      const params = query ? `?query=${encodeURIComponent(query)}` : "";
      fetch(`/api/venues${params}`)
        .then((res) => res.json())
        .then((data) => setVenues(Array.isArray(data) ? data : []));
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">Tìm sân</h1>

      <div className="space-y-2">
        <Label htmlFor="query">Tìm theo tên, địa chỉ hoặc thành phố</Label>
        <Input
          id="query"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {venues === null && <p>Đang tải...</p>}
      {venues !== null && venues.length === 0 && (
        <p className="text-muted-foreground">Không tìm thấy sân nào phù hợp.</p>
      )}

      <div className="flex flex-col gap-4">
        {venues?.map((venue) => (
          <Link key={venue.id} href={`/venues/${venue.id}`}>
            <Card className="transition-colors hover:bg-muted">
              <CardHeader>
                <CardTitle className="text-base">{venue.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-sm text-muted-foreground">
                  {venue.address}, {venue.city}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Confirm the project builds**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Manual verification**

Visit `/venues` without logging in. Expected: search box, list of active venues (any approved during Task 9's manual verification). Typing filters the list after ~300ms. Clicking a card navigates to `/venues/<id>` (404 until Task 11 exists — expected at this point).

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/venues/page.tsx
git commit -m "feat(web): add public venue search page"
```

---

## Task 11: Public venue detail page with slots (`/venues/[id]`)

**Files:**
- Create: `apps/web/src/app/venues/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/venues/[id]` (Task 3, returns venue + `courts` + `images` per Task 1), `GET /api/courts/[id]/slots?date=` (Task 3)
- Produces: nothing consumed by later tasks (final page)

- [ ] **Step 1: Create the page**

```typescript
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
```

- [ ] **Step 2: Confirm the project builds**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Manual verification**

Visit `/venues/<id>` for an approved venue with at least one active court (from Task 8/9's manual verification). Expected: venue info, court card(s) with today's slot grid pre-loaded; changing the date fetches new slots; visiting a random UUID shows the Next.js 404 page.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/venues/[id]/page.tsx
git commit -m "feat(web): add public venue detail page with slot browsing"
```
