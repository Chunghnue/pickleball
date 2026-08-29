# Venue is_default/phone + Branch Dialog Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real `is_default` (auto-assigned) and `phone` (owner-editable) columns to `venues`, then redesign `BranchSwitcher`'s dialog to match the sanbong.vn reference image (gradient header, icon-in-colored-box rows, "Mặc định" badge, phone line, selection checkmark).

**Architecture:** A migration adds the two columns and backfills `is_default` for existing owners (oldest venue per owner). `VenuesService.create` decides `isDefault` by counting the owner's existing venues; `VenuesService.update` accepts an optional `phone`. The owner's venue-edit form gets a phone input. `BranchSwitcher` is rewritten to track a `selectedId` (`"all"` or a venue id) instead of a label string, and its dialog markup is redesigned to match the image.

**Tech Stack:** NestJS/TypeORM (Postgres), Next.js/React, Tailwind, `lucide-react`, Jest (`apps/api`), Vitest (`apps/web`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-29-venue-default-phone-and-branch-dialog-design.md`.
- No `set-default` endpoint, no delete-reassigns-default logic, no `phone` on the venue **create** form — only what's listed in the spec.
- Selecting a branch in the dialog only changes local UI state — no data filtering anywhere else.
- No new npm dependencies.

---

## Task 1: Migration — `is_default` + `phone` on `venues`

**Files:**
- Create: `apps/api/src/migrations/1787850000000-AddIsDefaultAndPhoneToVenues.ts`

**Interfaces:**
- Produces: `venues.is_default` (boolean, not null, default false), `venues.phone` (varchar, nullable) — consumed by the entity in Task 2.

- [ ] **Step 1: Create the migration**

Create `apps/api/src/migrations/1787850000000-AddIsDefaultAndPhoneToVenues.ts`:

```ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsDefaultAndPhoneToVenues1787850000000 implements MigrationInterface {
    name = 'AddIsDefaultAndPhoneToVenues1787850000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venues" ADD "is_default" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "venues" ADD "phone" character varying`);
        await queryRunner.query(`
            UPDATE "venues" SET "is_default" = true
            WHERE "id" IN (
                SELECT DISTINCT ON ("owner_id") "id"
                FROM "venues"
                ORDER BY "owner_id", "created_at" ASC
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "phone"`);
        await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "is_default"`);
    }

}
```

- [ ] **Step 2: Run the migration against the dev database**

Run (from `apps/api`): `npm run migration:run`
Expected: output lists `AddIsDefaultAndPhoneToVenues1787850000000` as applied. Verify with `npx typeorm-ts-node-commonjs -d src/config/data-source.ts migration:show` — the new migration shows `[X]`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/migrations/1787850000000-AddIsDefaultAndPhoneToVenues.ts
git commit -m "feat(api): add is_default and phone columns to venues"
```

---

## Task 2: Entity, DTO, service logic (`isDefault` on create, `phone` on update)

**Files:**
- Modify: `apps/api/src/courts/entities/venue.entity.ts`
- Modify: `apps/api/src/courts/dto/update-venue.dto.ts`
- Modify: `apps/api/src/courts/venues.service.ts`
- Modify: `apps/api/src/courts/venues.service.spec.ts`

**Interfaces:**
- Produces: `Venue.isDefault: boolean`, `Venue.phone: string | null` — consumed by `GET /venues/mine` (no controller change needed, it already returns full entities) and by the frontend in Task 3/4.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/courts/venues.service.spec.ts`, add `count: jest.fn()` to `mockVenuesRepository`:

```ts
const mockVenuesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
});
```

Then add these two test blocks (after the existing `describe('VenuesService.create', ...)` block):

```ts
describe('VenuesService.create — isDefault', () => {
  it('sets isDefault true for the owner\'s first venue', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);
    venuesRepo.create.mockImplementation((data) => data);
    venuesRepo.save.mockImplementation((data) => Promise.resolve({ id: 'venue-1', ...data }));

    const result = await service.create('owner-1', {
      name: 'ABC Pickleball',
      address: '123 Le Loi',
      city: 'Ho Chi Minh',
    });

    expect(result.isDefault).toBe(true);
  });

  it('sets isDefault false when the owner already has a venue', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(1);
    venuesRepo.create.mockImplementation((data) => data);
    venuesRepo.save.mockImplementation((data) => Promise.resolve({ id: 'venue-2', ...data }));

    const result = await service.create('owner-1', {
      name: 'XYZ Pickleball',
      address: '456 Le Loi',
      city: 'Ho Chi Minh',
    });

    expect(result.isDefault).toBe(false);
  });
});

describe('VenuesService.update — phone', () => {
  it('sets phone when provided', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', { phone: '0368886999' });

    expect(result.phone).toBe('0368886999');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/api`): `npm test -- venues.service`
Expected: FAIL — `result.isDefault` is `undefined` (not `true`/`false`), `result.phone` is `undefined`.

- [ ] **Step 3: Update the entity**

In `apps/api/src/courts/entities/venue.entity.ts`, add after the `cancellationCutoffHours` column:

```ts
  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @Column({ nullable: true, type: 'varchar' })
  phone: string | null;
```

- [ ] **Step 4: Update the DTO**

In `apps/api/src/courts/dto/update-venue.dto.ts`, add:

```ts
  @IsOptional()
  @IsString()
  phone?: string;
```

(alongside the existing `@IsOptional() @IsString() description?: string;` field — same import line already has `IsOptional`, `IsString`.)

- [ ] **Step 5: Update the service**

In `apps/api/src/courts/venues.service.ts`, replace the `create` method:

```ts
  async create(ownerId: string, dto: CreateVenueDto): Promise<Venue> {
    const existingCount = await this.venuesRepository.count({ where: { ownerId } });
    const venue = this.venuesRepository.create({
      ownerId,
      name: dto.name,
      address: dto.address,
      city: dto.city,
      description: dto.description ?? null,
      status: VenueStatus.PENDING_APPROVAL,
      isDefault: existingCount === 0,
    });
    return this.venuesRepository.save(venue);
  }
```

And in `update`, add one line after the existing `cancellationCutoffHours` handling:

```ts
    if (dto.cancellationCutoffHours !== undefined) {
      venue.cancellationCutoffHours = dto.cancellationCutoffHours;
    }
    if (dto.phone !== undefined) venue.phone = dto.phone;
    return this.venuesRepository.save(venue);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- venues.service`
Expected: PASS (all `VenuesService` tests, including the 3 new ones).

- [ ] **Step 7: Rebuild and restart the running dev API**

The dev API is already running as a compiled process (`node dist/main`), so it won't pick up these source changes on its own.

Run (from `apps/api`): `npm run build`
Then find and stop the running process, and start a fresh one:

```bash
# find the PID listening on 3001 (Windows):
# powershell: Get-NetTCPConnection -LocalPort 3001 -State Listen | Select OwningProcess
# stop it, then:
node dist/main &
```

Expected: `curl http://localhost:3001/users/me` still returns 401 (server is back up and responding).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/courts/entities/venue.entity.ts apps/api/src/courts/dto/update-venue.dto.ts apps/api/src/courts/venues.service.ts apps/api/src/courts/venues.service.spec.ts
git commit -m "feat(api): auto-assign isDefault on venue create, allow updating phone"
```

---

## Task 3: Phone field in the venue edit form

**Files:**
- Modify: `apps/web/src/lib/schemas.ts`
- Modify: `apps/web/src/app/owner/venues/[id]/types.ts`
- Modify: `apps/web/src/app/owner/venues/[id]/venue-info-section.tsx`

**Interfaces:**
- Consumes: `PATCH /api/venues/mine/:id` now accepts `phone` (Task 2).

- [ ] **Step 1: Add `phone` to the update schema**

In `apps/web/src/lib/schemas.ts`, in `updateVenueSchema`, add one line:

```ts
export const updateVenueSchema = z.object({
  name: z.string().min(1, 'Vui lòng nhập tên địa điểm').optional(),
  address: z.string().min(1, 'Vui lòng nhập địa chỉ').optional(),
  city: z.string().min(1, 'Vui lòng nhập thành phố').optional(),
  description: z.string().optional(),
  phone: z.string().optional(),
});
```

- [ ] **Step 2: Add `phone` to the `Venue` type**

In `apps/web/src/app/owner/venues/[id]/types.ts`, add to the `Venue` interface:

```ts
export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  description: string | null;
  phone: string | null;
  status: "pending_approval" | "active" | "rejected";
  images: VenueImage[];
}
```

- [ ] **Step 3: Add the input to the form**

In `apps/web/src/app/owner/venues/[id]/venue-info-section.tsx`:

Add `phone: venue.phone ?? ""` to `defaultValues`:

```tsx
    defaultValues: {
      name: venue.name,
      address: venue.address,
      city: venue.city,
      description: venue.description ?? "",
      phone: venue.phone ?? "",
    },
```

Add a new field block right after the `description` field block, before the submit `Button`:

```tsx
          <div className="space-y-2">
            <Label htmlFor="phone">Số điện thoại</Label>
            <Input id="phone" {...form.register("phone")} />
          </div>
```

- [ ] **Step 4: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/schemas.ts "apps/web/src/app/owner/venues/[id]/types.ts" "apps/web/src/app/owner/venues/[id]/venue-info-section.tsx"
git commit -m "feat(web): add phone field to the venue edit form"
```

---

## Task 4: Redesign `BranchSwitcher` dialog, swap the branch icon

**Files:**
- Modify: `apps/web/src/components/branch-switcher.tsx`
- Modify: `apps/web/src/components/owner-sidebar.tsx`

**Interfaces:**
- Consumes: `GET /api/venues/mine` now returns `isDefault`/`phone` per venue (Task 2).

- [ ] **Step 1: Rewrite `BranchSwitcher`**

Replace the contents of `apps/web/src/components/branch-switcher.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { BarChart3, Check, ChevronRight, LayoutGrid, MapPin, Phone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Venue {
  id: string;
  name: string;
  city: string;
  phone: string | null;
  isDefault: boolean;
}

const ALL_BRANCHES_ID = "all";

export function BranchSwitcher() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedId, setSelectedId] = useState(ALL_BRANCHES_ID);

  useEffect(() => {
    fetch("/api/venues/mine")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setVenues(Array.isArray(data) ? data : []));
  }, []);

  const selectedLabel =
    selectedId === ALL_BRANCHES_ID
      ? "Tất cả chi nhánh"
      : (venues.find((v) => v.id === selectedId)?.name ?? "Tất cả chi nhánh");

  return (
    <Dialog>
      <DialogTrigger className="flex w-full items-center gap-2 rounded-lg bg-blue-50 px-2 py-2 text-left text-sm font-medium text-blue-700 outline-none hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400">
        <BarChart3 className="size-4 shrink-0" />
        <span className="flex-1 truncate">{selectedLabel}</span>
        <ChevronRight className="size-4 shrink-0" />
      </DialogTrigger>
      <DialogContent className="max-w-sm overflow-hidden p-0">
        <div className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-3">
          <BarChart3 className="size-4 text-white" />
          <DialogTitle className="flex-1 text-base font-semibold text-white">
            Chọn chi nhánh
          </DialogTitle>
          <DialogClose aria-label="Đóng" className="text-white/80 outline-none hover:text-white">
            <X className="size-4" />
          </DialogClose>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <DialogClose
            onClick={() => setSelectedId(ALL_BRANCHES_ID)}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 text-left",
              selectedId === ALL_BRANCHES_ID ? "border-blue-500 bg-blue-50" : "border-border",
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
              <LayoutGrid className="size-4" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-semibold">Tất cả chi nhánh</span>
              <span className="block text-xs text-muted-foreground">Xem dữ liệu tổng hợp</span>
            </span>
            {selectedId === ALL_BRANCHES_ID ? (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                <Check className="size-3" />
              </span>
            ) : null}
          </DialogClose>
          {venues.map((venue) => (
            <DialogClose
              key={venue.id}
              onClick={() => setSelectedId(venue.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 text-left",
                selectedId === venue.id ? "border-blue-500 bg-blue-50" : "border-border",
              )}
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  venue.isDefault ? "bg-green-100 text-green-600" : "bg-muted text-muted-foreground",
                )}
              >
                <MapPin className="size-4" />
              </span>
              <span className="flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{venue.name}</span>
                  {venue.isDefault ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      Mặc định
                    </span>
                  ) : null}
                </span>
                {venue.phone ? (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="size-3" />
                    {venue.phone}
                  </span>
                ) : null}
              </span>
              {selectedId === venue.id ? (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                  <Check className="size-3" />
                </span>
              ) : null}
            </DialogClose>
          ))}
          {venues.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">Chưa có chi nhánh nào.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Swap the "Chi nhánh" nav icon in `OwnerSidebar`**

In `apps/web/src/components/owner-sidebar.tsx`, remove `Building2` from the `lucide-react` import list (no longer used anywhere in this file) and change the "Chi nhánh" entry's icon from `Building2` to `BarChart3` (already imported for "Doanh thu"):

```ts
{ href: "/owner/branches", label: "Chi nhánh", icon: BarChart3 },
```

- [ ] **Step 3: Type-check, test, build**

Run (from `apps/web`): `npx tsc --noEmit -p . && npm run test && npm run build`
Expected: type-check exits 0, all Vitest tests pass, production build succeeds.

- [ ] **Step 4: Manual verification**

Log in as the test owner. On `/owner/venues/[an existing venue's id]`, set a phone number and save. Open `/owner`, click the branch switcher.
Expected: dialog shows the blue gradient header with a close `X`; "Tất cả chi nhánh" row has a grid icon and is selected (checkmark) by default; the venue you just edited shows its phone number; whichever venue was created first shows a green pin icon + "Mặc định" badge; clicking any row closes the dialog and updates the trigger button's label; the "Chi nhánh" nav item and the trigger button now use the bar-chart icon instead of the building icon.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/branch-switcher.tsx apps/web/src/components/owner-sidebar.tsx
git commit -m "feat(web): redesign branch dialog to match reference (badge, phone, checkmark), swap branch icon"
```

---

## Full-suite check (after Task 4)

Run (from `apps/api`): `npm test`
Run (from `apps/web`): `npm run test && npx tsc --noEmit -p . && npm run build`
Expected: all tests pass in both apps, type-check exits 0, production build succeeds with no new warnings.
