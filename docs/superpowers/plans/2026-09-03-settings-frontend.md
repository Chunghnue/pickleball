# Settings Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `ComingSoon` stub at `/owner/settings` with the real 4-tab Settings page per [2026-09-03-settings-frontend-design.md](../specs/2026-09-03-settings-frontend-design.md): Thông tin sân, Giờ hoạt động, Thông báo, Tài khoản.

**Architecture:** One page (`page.tsx`) owns a vertical tab sidebar and renders exactly one of 4 self-contained tab components at a time, each fetching its own data — matching the file-per-tab pattern already used by Pricing (`PricingRulesTab`/`RecurringSchedulesTab`). Tabs 1 and 2 (venue info, operating hours) share a small hook that resolves which venue to target from the global branch switcher, since neither tab has its own venue picker. All network access goes through new/existing Next.js route proxies under `apps/web/src/app/api/`, never straight to the backend.

**Tech Stack:** Next.js 16 (App Router, modified — read `apps/web/node_modules/next/dist/docs/` before touching routing/dynamic-route code per `apps/web/AGENTS.md`), React 19, Tailwind, shadcn-style components on `@base-ui/react`, `lucide-react`, `sonner`, `react-hook-form` + `zod` + `@hookform/resolvers/zod`, Vitest.

## Global Constraints

- Backend is fully implemented and tested (`docs/superpowers/plans/2026-09-03-settings-module-backend.md`, all 10 tasks done, merged to `main`). This plan builds against the real API, not a speculative one.
- **Deviation from the approved frontend design spec, found while cross-checking it against the real backend response shape:** the design spec says the venue-info tab "tái dùng nguyên type đã có ở `apps/web/src/app/owner/types.ts` — không định nghĩa lại" (reuse the shared `Venue` type as-is). That type does **not** have a `website` field — it predates the backend's `website` column. Task 1 below adds it (purely additive, same as every other field on that type).
- The repo has no component-render test harness — per the design spec's own §6, UI verification for these tabs is manual (Task 11), not Vitest. Only genuinely pure logic gets a unit test: `operating-hours-format.ts` (Task 4) and `changePasswordSchema` (Task 3).
- Every task must leave `npx tsc --noEmit -p .` (from `apps/web`) green; tasks with pure-function tests must also leave `npm test` (Vitest) green.

---

## File Structure

**New files:**
- `apps/web/src/components/ui/switch.tsx`
- `apps/web/src/app/owner/settings/types.ts`
- `apps/web/src/app/owner/settings/operating-hours-format.ts` (+ `.test.ts`)
- `apps/web/src/app/owner/settings/use-settings-venue-id.ts`
- `apps/web/src/app/owner/settings/venue-info-tab.tsx`
- `apps/web/src/app/owner/settings/operating-hours-tab.tsx`
- `apps/web/src/app/owner/settings/notifications-tab.tsx`
- `apps/web/src/app/owner/settings/account-tab.tsx`
- `apps/web/src/app/api/venues/mine/[venueId]/operating-hours/route.ts`
- `apps/web/src/app/api/notification-settings/mine/route.ts`
- `apps/web/src/app/api/auth/change-password/route.ts`

**Modified:**
- `apps/web/src/app/owner/types.ts` — add `website` to `Venue`
- `apps/web/src/lib/schemas.ts` / `schemas.test.ts` — add `changePasswordSchema`
- `apps/web/src/app/owner/settings/page.tsx` — full rewrite (was `ComingSoon`)

**Not touched:** `apps/web/src/app/api/venues/mine/[venueId]/route.ts` (PATCH already forwards any body), `.../logo/route.ts`, `.../route.ts` (GET list), `apps/web/src/app/api/users/me/route.ts` — all already forward exactly what's needed.

---

### Task 1: Add `website` to the shared `Venue` type

**Files:**
- Modify: `apps/web/src/app/owner/types.ts`

**Interfaces:**
- Produces: `Venue.website: string | null` — consumed by `venue-info-tab.tsx` (Task 6).

- [ ] **Step 1: Add the field**

In `apps/web/src/app/owner/types.ts`, add `website` to the `Venue` interface right after `logoUrl`:

```ts
export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  district: string | null;
  slug: string | null;
  latitude: number | null;
  longitude: number | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  isDefault: boolean;
  isHidden: boolean;
  logoUrl: string | null;
  website: string | null;
  status: "pending_approval" | "active" | "rejected";
  images: VenueImage[];
}
```

- [ ] **Step 2: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0 — every existing consumer of `Venue` only reads a subset of fields, so a purely-additive field doesn't break anything.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/types.ts
git commit -m "feat(web): add website to the shared Venue type"
```

---

### Task 2: `Switch` UI component

**Files:**
- Create: `apps/web/src/components/ui/switch.tsx`

**Interfaces:**
- Produces: `Switch` (props: `checked`, `onCheckedChange`, `disabled`, from `@base-ui/react/switch`'s `SwitchRoot`) — consumed by `operating-hours-tab.tsx` (Task 7) and `notifications-tab.tsx` (Task 8).

- [ ] **Step 1: Implement**

Create `apps/web/src/components/ui/switch.tsx` (same thin-wrapper pattern as `dialog.tsx`: import the base-ui namespace, style with `data-[checked]`):

```tsx
"use client";

import type { ComponentProps } from "react";
import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";

function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-background shadow transition-transform data-[checked]:translate-x-[18px]"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
```

- [ ] **Step 2: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/switch.tsx
git commit -m "feat(web): add Switch UI component"
```

---

### Task 3: `changePasswordSchema` (TDD)

**Files:**
- Modify: `apps/web/src/lib/schemas.ts`
- Modify: `apps/web/src/lib/schemas.test.ts`

**Interfaces:**
- Produces: `changePasswordSchema`, `ChangePasswordInput` — consumed by `account-tab.tsx` (Task 9).

- [ ] **Step 1: Write the failing tests**

In `apps/web/src/lib/schemas.test.ts`, add `changePasswordSchema` to the import block at the top:

```ts
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  addVenueImageSchema,
  createCourtSchema,
  updateCourtSchema,
  changePasswordSchema,
} from './schemas';
```

Add this `describe` block at the end of the file:

```ts
describe('changePasswordSchema', () => {
  it('accepts a valid payload', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'oldpassword1',
        newPassword: 'newpassword1',
        confirmPassword: 'newpassword1',
      }).success,
    ).toBe(true);
  });

  it('rejects a newPassword shorter than 8 characters', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'oldpassword1',
        newPassword: '123',
        confirmPassword: '123',
      }).success,
    ).toBe(false);
  });

  it('rejects when confirmPassword does not match newPassword', () => {
    const result = changePasswordSchema.safeParse({
      currentPassword: 'oldpassword1',
      newPassword: 'newpassword1',
      confirmPassword: 'different1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['confirmPassword']);
    }
  });

  it('rejects an empty currentPassword', () => {
    expect(
      changePasswordSchema.safeParse({
        currentPassword: '',
        newPassword: 'newpassword1',
        confirmPassword: 'newpassword1',
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/web`): `npx vitest run schemas`
Expected: FAIL — `changePasswordSchema` is not exported yet.

- [ ] **Step 3: Implement**

In `apps/web/src/lib/schemas.ts`, add at the end of the file:

```ts
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
    newPassword: z.string().min(8, 'Mật khẩu tối thiểu 8 ký tự'),
    confirmPassword: z.string().min(1, 'Vui lòng xác nhận mật khẩu mới'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Xác nhận mật khẩu không khớp',
    path: ['confirmPassword'],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/web`): `npx vitest run schemas`
Expected: PASS (all existing + 4 new tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/schemas.ts apps/web/src/lib/schemas.test.ts
git commit -m "feat(web): add changePasswordSchema"
```

---

### Task 4: Settings types + `operating-hours-format.ts` helpers (TDD)

**Files:**
- Create: `apps/web/src/app/owner/settings/types.ts`
- Create: `apps/web/src/app/owner/settings/operating-hours-format.ts`
- Test: `apps/web/src/app/owner/settings/operating-hours-format.test.ts`

**Interfaces:**
- Produces: `SettingsTab`, `OperatingHourRow`, `NotificationSettings` (types — consumed by every tab component and `page.tsx`), `orderForDisplay`, `validateOperatingHours`, `DAY_LABELS` (consumed by `operating-hours-tab.tsx`, Task 7).

- [ ] **Step 1: Create the types file**

Create `apps/web/src/app/owner/settings/types.ts`:

```ts
export type SettingsTab = "venue" | "hours" | "notifications" | "account";

export interface OperatingHourRow {
  dayOfWeek: number; // 0-6, 0 = Chủ Nhật
  isOpen: boolean;
  openTime: string | null; // "HH:mm"
  closeTime: string | null;
}

export interface NotificationSettings {
  newBooking: boolean;
  cancellation: boolean;
  payment: boolean;
  dailyReport: boolean;
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/web/src/app/owner/settings/operating-hours-format.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { orderForDisplay, validateOperatingHours, DAY_LABELS } from "./operating-hours-format";
import type { OperatingHourRow } from "./types";

function makeRows(overrides: Partial<Record<number, Partial<OperatingHourRow>>> = {}): OperatingHourRow[] {
  return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
    dayOfWeek,
    isOpen: true,
    openTime: "06:00",
    closeTime: "22:00",
    ...(overrides[dayOfWeek] ?? {}),
  }));
}

describe("orderForDisplay", () => {
  it("reorders Monday-first, Sunday-last regardless of input order", () => {
    const rows = makeRows();
    const result = orderForDisplay(rows);
    expect(result.map((r) => r.dayOfWeek)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it("fills in a missing day with a closed default", () => {
    const rows = makeRows().filter((r) => r.dayOfWeek !== 3);
    const result = orderForDisplay(rows);
    const wednesday = result.find((r) => r.dayOfWeek === 3);
    expect(wednesday).toEqual({ dayOfWeek: 3, isOpen: false, openTime: null, closeTime: null });
  });
});

describe("validateOperatingHours", () => {
  it("returns null when every open day has openTime < closeTime", () => {
    expect(validateOperatingHours(makeRows())).toBeNull();
  });

  it("returns an error naming the day when openTime >= closeTime", () => {
    const rows = makeRows({ 2: { openTime: "22:00", closeTime: "06:00" } });
    expect(validateOperatingHours(rows)).toBe(`${DAY_LABELS[2]}: giờ mở phải trước giờ đóng`);
  });

  it("ignores closed days even with nonsensical times", () => {
    const rows = makeRows({ 4: { isOpen: false, openTime: null, closeTime: null } });
    expect(validateOperatingHours(rows)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (from `apps/web`): `npx vitest run operating-hours-format`
Expected: FAIL — `Cannot find module './operating-hours-format'`.

- [ ] **Step 4: Implement**

Create `apps/web/src/app/owner/settings/operating-hours-format.ts`:

```ts
import type { OperatingHourRow } from "./types";

export const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const DAY_LABELS: Record<number, string> = {
  0: "Chủ Nhật",
  1: "Thứ 2",
  2: "Thứ 3",
  3: "Thứ 4",
  4: "Thứ 5",
  5: "Thứ 6",
  6: "Thứ 7",
};

export function orderForDisplay(rows: OperatingHourRow[]): OperatingHourRow[] {
  return DISPLAY_ORDER.map(
    (dayOfWeek) =>
      rows.find((row) => row.dayOfWeek === dayOfWeek) ?? {
        dayOfWeek,
        isOpen: false,
        openTime: null,
        closeTime: null,
      },
  );
}

export function validateOperatingHours(rows: OperatingHourRow[]): string | null {
  for (const row of rows) {
    if (row.isOpen && row.openTime && row.closeTime && row.openTime >= row.closeTime) {
      return `${DAY_LABELS[row.dayOfWeek]}: giờ mở phải trước giờ đóng`;
    }
  }
  return null;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run (from `apps/web`): `npx vitest run operating-hours-format`
Expected: PASS (5 tests).

- [ ] **Step 6: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/owner/settings/types.ts apps/web/src/app/owner/settings/operating-hours-format.ts apps/web/src/app/owner/settings/operating-hours-format.test.ts
git commit -m "feat(web): add settings types and operating-hours-format helpers"
```

---

### Task 5: `use-settings-venue-id.ts` shared hook

**Files:**
- Create: `apps/web/src/app/owner/settings/use-settings-venue-id.ts`

**Interfaces:**
- Consumes: `useBranch()`/`ALL_BRANCHES_ID` (`@/lib/branch-context`, existing), `Venue` (Task 1, for `isDefault`).
- Produces: `useSettingsVenueId(): { venueId: string | null; resolved: boolean }` — consumed by `venue-info-tab.tsx` (Task 6) and `operating-hours-tab.tsx` (Task 7).

- [ ] **Step 1: Implement**

Create `apps/web/src/app/owner/settings/use-settings-venue-id.ts` (same fallback reasoning as the Pricing page's `resolvedVenueId`: read the global switcher, but never write a fallback back into it):

```ts
"use client";

import { useEffect, useState } from "react";
import { useBranch, ALL_BRANCHES_ID } from "@/lib/branch-context";
import type { Venue } from "../types";

export interface SettingsVenueTarget {
  venueId: string | null;
  resolved: boolean;
}

// Neither Tab 1 nor Tab 2 has its own branch picker (10-cai-dat.md only
// surveyed a single-venue business) — both fall back to the global switcher,
// resolving to the owner's default venue when it's at "Tất cả chi nhánh".
export function useSettingsVenueId(): SettingsVenueTarget {
  const { selectedVenueId } = useBranch();
  const [venues, setVenues] = useState<Venue[] | null>(null);

  useEffect(() => {
    if (selectedVenueId !== ALL_BRANCHES_ID) return;
    fetch("/api/venues/mine")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setVenues(Array.isArray(data) ? data : []));
  }, [selectedVenueId]);

  if (selectedVenueId !== ALL_BRANCHES_ID) {
    return { venueId: selectedVenueId, resolved: true };
  }
  if (venues === null) {
    return { venueId: null, resolved: false };
  }
  const fallback = venues.find((venue) => venue.isDefault) ?? venues[0] ?? null;
  return { venueId: fallback?.id ?? null, resolved: true };
}
```

- [ ] **Step 2: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/settings/use-settings-venue-id.ts
git commit -m "feat(web): add useSettingsVenueId hook"
```

---

### Task 6: Tab "Thông tin sân" (`venue-info-tab.tsx`)

**Files:**
- Create: `apps/web/src/app/owner/settings/venue-info-tab.tsx`

**Interfaces:**
- Consumes: `useSettingsVenueId` (Task 5), `Venue` (Task 1), existing `GET`/`PATCH /api/venues/mine/[venueId]` and `POST /api/venues/mine/[venueId]/logo` proxies (no changes needed to any of them).
- Produces: `VenueInfoTab` — consumed by `page.tsx` (Task 10).

- [ ] **Step 1: Implement**

Create `apps/web/src/app/owner/settings/venue-info-tab.tsx` (logo widget copied from `branch-form-dialog.tsx`'s edit-mode upload flow, minus create-mode branching since this tab only ever edits):

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { useSettingsVenueId } from "./use-settings-venue-id";
import type { Venue } from "../types";

const ALLOWED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export function VenueInfoTab() {
  const router = useRouter();
  const { venueId, resolved } = useSettingsVenueId();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    setVenue(null);
    setLoadError(null);
    fetch(`/api/venues/mine/${venueId}`).then(async (res) => {
      if (res.status === 401) {
        router.push("/login?returnTo=%2Fowner%2Fsettings");
        return;
      }
      const data: Venue | null = res.ok ? await res.json() : null;
      if (!data) {
        setLoadError("Không tải được dữ liệu.");
        return;
      }
      setVenue(data);
      setName(data.name);
      setPhone(data.phone ?? "");
      setAddress(data.address);
      setEmail(data.email ?? "");
      setWebsite(data.website ?? "");
      setDescription(data.description ?? "");
      setLogoUrl(data.logoUrl);
    });
  }, [venueId, router]);

  function validateLogoFile(file: File): boolean {
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      toast.error("Chỉ chấp nhận ảnh JPG/PNG/WEBP");
      return false;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Ảnh tối đa 5MB");
      return false;
    }
    return true;
  }

  async function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !venueId || !validateLogoFile(file)) return;
    setUploadingLogo(true);
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`/api/venues/mine/${venueId}/logo`, {
      method: "POST",
      body: formData,
    });
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fowner%2Fsettings");
      return;
    }
    const data = await response.json().catch(() => null);
    setUploadingLogo(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    setLogoUrl(data.logoUrl as string);
  }

  async function handleSubmit() {
    if (!venueId) return;
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên sân");
      return;
    }
    setSubmitting(true);
    const response = await fetch(`/api/venues/mine/${venueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        email: email.trim() || undefined,
        website: website.trim() || undefined,
        description: description.trim() || undefined,
      }),
    });
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fowner%2Fsettings");
      return;
    }
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success("Đã lưu thay đổi");
  }

  if (!resolved) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }
  if (!venueId) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có chi nhánh nào, tạo chi nhánh trước ở mục Chi nhánh.
      </p>
    );
  }
  if (loadError) {
    return <p className="text-sm text-muted-foreground">{loadError}</p>;
  }
  if (!venue) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label className="font-semibold">Logo</Label>
          <div className="flex flex-wrap items-start gap-3">
            <label
              className="flex size-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-dashed text-center text-muted-foreground hover:border-foreground hover:text-foreground"
              aria-disabled={uploadingLogo}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="size-20 object-cover" />
              ) : (
                <>
                  <Upload className="size-5" />
                  <span className="px-1 text-[10px] leading-tight">Bấm hoặc kéo thả ảnh</span>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleLogoChange}
                disabled={uploadingLogo}
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <label className="inline-flex h-9 w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium hover:bg-muted">
                <Upload className="size-3.5" />
                Đổi logo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleLogoChange}
                  disabled={uploadingLogo}
                />
              </label>
              <p className="text-xs text-muted-foreground">PNG, JPG, WEBP · tối đa 5MB</p>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="font-semibold">
            Tên sân <span className="text-destructive">*</span>
          </Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className="h-9" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="font-semibold">Số điện thoại</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold">Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className="h-9" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="font-semibold">Địa chỉ</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" className="h-9" />
        </div>

        <div className="space-y-1.5">
          <Label className="font-semibold">Website</Label>
          <Input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            autoComplete="off"
            placeholder="https://..."
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="font-semibold">Mô tả</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả chung về cơ sở..."
            rows={3}
            className="w-full resize-none rounded-lg border border-input px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
          >
            Lưu thay đổi
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/settings/venue-info-tab.tsx
git commit -m "feat(web): add Settings venue-info tab"
```

---

### Task 7: Tab "Giờ hoạt động" — route proxy + `operating-hours-tab.tsx`

**Files:**
- Create: `apps/web/src/app/api/venues/mine/[venueId]/operating-hours/route.ts`
- Create: `apps/web/src/app/owner/settings/operating-hours-tab.tsx`

**Interfaces:**
- Consumes: backend `GET`/`PUT /venues/mine/:id/operating-hours` (implemented), `useSettingsVenueId` (Task 5), `orderForDisplay`/`validateOperatingHours`/`DAY_LABELS` (Task 4), `Switch` (Task 2).
- Produces: `OperatingHoursTab` — consumed by `page.tsx` (Task 10).

- [ ] **Step 1: Create the route proxy**

Create `apps/web/src/app/api/venues/mine/[venueId]/operating-hours/route.ts`:

```ts
import { NextRequest } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { clearAuthCookies } from "@/lib/auth-cookies";
import { toNextResponse } from "@/lib/proxy-response";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await params;
  const upstream = await fetchApi(`/venues/mine/${venueId}/operating-hours`);
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> },
) {
  const { venueId } = await params;
  const body = await request.json();
  const upstream = await fetchApi(`/venues/mine/${venueId}/operating-hours`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: Implement the tab**

Create `apps/web/src/app/owner/settings/operating-hours-tab.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useSettingsVenueId } from "./use-settings-venue-id";
import { orderForDisplay, validateOperatingHours, DAY_LABELS } from "./operating-hours-format";
import type { OperatingHourRow } from "./types";

export function OperatingHoursTab() {
  const router = useRouter();
  const { venueId, resolved } = useSettingsVenueId();
  const [rows, setRows] = useState<OperatingHourRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    setRows(null);
    setLoadError(null);
    fetch(`/api/venues/mine/${venueId}/operating-hours`).then(async (res) => {
      if (res.status === 401) {
        router.push("/login?returnTo=%2Fowner%2Fsettings");
        return;
      }
      const data: OperatingHourRow[] | null = res.ok ? await res.json() : null;
      if (!data) {
        setLoadError("Không tải được dữ liệu.");
        return;
      }
      setRows(orderForDisplay(data));
    });
  }, [venueId, router]);

  function updateRow(dayOfWeek: number, patch: Partial<OperatingHourRow>) {
    setRows((prev) => (prev ?? []).map((row) => (row.dayOfWeek === dayOfWeek ? { ...row, ...patch } : row)));
  }

  function handleToggle(dayOfWeek: number, isOpen: boolean) {
    updateRow(
      dayOfWeek,
      isOpen ? { isOpen, openTime: "06:00", closeTime: "22:00" } : { isOpen, openTime: null, closeTime: null },
    );
  }

  async function handleSubmit() {
    if (!venueId || !rows) return;
    const error = validateOperatingHours(rows);
    if (error) {
      toast.error(error);
      return;
    }
    setSubmitting(true);
    const response = await fetch(`/api/venues/mine/${venueId}/operating-hours`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rows),
    });
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fowner%2Fsettings");
      return;
    }
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      toast.error(data?.message ?? "Có lỗi xảy ra, vui lòng thử lại.");
      return;
    }
    setRows(orderForDisplay(data));
    toast.success("Đã lưu thay đổi");
  }

  if (!resolved) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }
  if (!venueId) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có chi nhánh nào, tạo chi nhánh trước ở mục Chi nhánh.
      </p>
    );
  }
  if (loadError) {
    return <p className="text-sm text-muted-foreground">{loadError}</p>;
  }
  if (!rows) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        {rows.map((row) => (
          <div
            key={row.dayOfWeek}
            className="flex flex-wrap items-center gap-4 border-b pb-3 last:border-b-0 last:pb-0"
          >
            <Switch checked={row.isOpen} onCheckedChange={(checked) => handleToggle(row.dayOfWeek, checked)} />
            <span className="w-20 shrink-0 text-sm font-medium">{DAY_LABELS[row.dayOfWeek]}</span>
            <div className="flex items-center gap-2">
              <input
                type="time"
                value={row.openTime ?? ""}
                disabled={!row.isOpen}
                onChange={(e) => updateRow(row.dayOfWeek, { openTime: e.target.value })}
                className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="text-sm text-muted-foreground">-</span>
              <input
                type="time"
                value={row.closeTime ?? ""}
                disabled={!row.isOpen}
                onChange={(e) => updateRow(row.dayOfWeek, { closeTime: e.target.value })}
                className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
          </div>
        ))}

        <div className="flex justify-end pt-2">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
          >
            Lưu
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/venues/mine/[venueId]/operating-hours/route.ts apps/web/src/app/owner/settings/operating-hours-tab.tsx
git commit -m "feat(web): add Settings operating-hours tab"
```

---

### Task 8: Tab "Thông báo" — route proxy + `notifications-tab.tsx`

**Files:**
- Create: `apps/web/src/app/api/notification-settings/mine/route.ts`
- Create: `apps/web/src/app/owner/settings/notifications-tab.tsx`

**Interfaces:**
- Consumes: backend `GET`/`PATCH /notification-settings/mine` (implemented), `NotificationSettings` (Task 4), `Switch` (Task 2).
- Produces: `NotificationsTab` — consumed by `page.tsx` (Task 10).

- [ ] **Step 1: Create the route proxy**

Create `apps/web/src/app/api/notification-settings/mine/route.ts`:

```ts
import { NextRequest } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { clearAuthCookies } from "@/lib/auth-cookies";
import { toNextResponse } from "@/lib/proxy-response";

export async function GET() {
  const upstream = await fetchApi("/notification-settings/mine");
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetchApi("/notification-settings/mine", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: Implement the tab**

Create `apps/web/src/app/owner/settings/notifications-tab.tsx` (text taken verbatim from `docs/spec/10-cai-dat.md` §3, minus "Nhắc bảo trì sân" per the backend design decision):

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { NotificationSettings } from "./types";

const ROWS: { key: keyof NotificationSettings; title: string; description: string }[] = [
  { key: "newBooking", title: "Đặt lịch mới", description: "Nhận thông báo khi có khách đặt sân." },
  { key: "cancellation", title: "Hủy lịch", description: "Nhận thông báo khi khách hủy lịch đặt." },
  { key: "payment", title: "Thanh toán", description: "Nhận thông báo xác nhận thanh toán." },
  { key: "dailyReport", title: "Báo cáo ngày", description: "Nhận tóm tắt doanh thu cuối ngày." },
];

export function NotificationsTab() {
  const router = useRouter();
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/notification-settings/mine").then(async (res) => {
      if (res.status === 401) {
        router.push("/login?returnTo=%2Fowner%2Fsettings");
        return;
      }
      const data: NotificationSettings | null = res.ok ? await res.json() : null;
      if (!data) {
        setLoadError("Không tải được dữ liệu.");
        return;
      }
      setSettings(data);
    });
  }, [router]);

  async function handleToggle(key: keyof NotificationSettings, checked: boolean) {
    if (!settings) return;
    const previous = settings;
    setSettings({ ...settings, [key]: checked });
    const response = await fetch("/api/notification-settings/mine", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [key]: checked }),
    });
    if (response.status === 401) {
      setSettings(previous);
      router.push("/login?returnTo=%2Fowner%2Fsettings");
      return;
    }
    if (!response.ok) {
      setSettings(previous);
      toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      return;
    }
    toast.success("Đã lưu");
  }

  if (loadError) {
    return <p className="text-sm text-muted-foreground">{loadError}</p>;
  }
  if (!settings) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        {ROWS.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between gap-4 border-b pb-4 last:border-b-0 last:pb-0"
          >
            <div>
              <p className="text-sm font-semibold">{row.title}</p>
              <p className="text-sm text-muted-foreground">{row.description}</p>
            </div>
            <Switch checked={settings[row.key]} onCheckedChange={(checked) => handleToggle(row.key, checked)} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/notification-settings/mine/route.ts apps/web/src/app/owner/settings/notifications-tab.tsx
git commit -m "feat(web): add Settings notifications tab"
```

---

### Task 9: Tab "Tài khoản" — route proxy + `account-tab.tsx`

**Files:**
- Create: `apps/web/src/app/api/auth/change-password/route.ts`
- Create: `apps/web/src/app/owner/settings/account-tab.tsx`

**Interfaces:**
- Consumes: backend `POST /auth/change-password` (implemented), existing `GET`/`PATCH /api/users/me` and `POST /api/auth/logout` proxies (unchanged), `changePasswordSchema` (Task 3), `roleLabel` from `apps/web/src/app/owner/accounts/staff-format.ts` (existing, unchanged).
- Produces: `AccountTab` — consumed by `page.tsx` (Task 10).

- [ ] **Step 1: Create the route proxy**

Create `apps/web/src/app/api/auth/change-password/route.ts`:

```ts
import { NextRequest } from "next/server";
import { fetchApi } from "@/lib/fetch-api";
import { clearAuthCookies } from "@/lib/auth-cookies";
import { toNextResponse } from "@/lib/proxy-response";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const upstream = await fetchApi("/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (upstream.status === 401) {
    await clearAuthCookies();
  }
  return toNextResponse(upstream);
}
```

- [ ] **Step 2: Implement the tab**

Create `apps/web/src/app/owner/settings/account-tab.tsx` (`Profile` declared locally per the design spec §3.1 — it needs `role`/`staffRole`, which the shared `/me` page's local `Profile` type doesn't have, even though `GET /users/me` already returns them):

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/schemas";
import { roleLabel } from "../accounts/staff-format";

interface Profile {
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: "owner" | "staff";
  staffRole: "manager" | "cashier" | "staff" | null;
}

export function AccountTab() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const passwordForm = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  useEffect(() => {
    fetch("/api/users/me")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner%2Fsettings");
          return null;
        }
        return res.ok ? ((await res.json()) as Profile) : null;
      })
      .then((data) => {
        if (!data) return;
        setProfile(data);
        setFullName(data.fullName);
        setPhone(data.phone ?? "");
      });
  }, [router]);

  async function handleSaveProfile() {
    if (!fullName.trim()) {
      toast.error("Vui lòng nhập họ và tên");
      return;
    }
    setSavingProfile(true);
    const response = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: fullName.trim(), phone: phone.trim() || undefined }),
    });
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fowner%2Fsettings");
      return;
    }
    const data = await response.json().catch(() => null);
    setSavingProfile(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success("Đã lưu thay đổi");
  }

  async function onChangePassword(values: ChangePasswordInput) {
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    });
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fowner%2Fsettings");
      return;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 400) {
        passwordForm.setError("currentPassword", { message: getSubmitErrorMessage(response, data) });
      } else {
        toast.error(getSubmitErrorMessage(response, data));
      }
      return;
    }
    toast.success("Đã đổi mật khẩu");
    passwordForm.reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (!profile) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }

  const { errors } = passwordForm.formState;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" className="size-14 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
                {profile.fullName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-semibold">{profile.fullName}</p>
              <p className="text-sm text-muted-foreground">{roleLabel(profile)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold">Email</Label>
            <Input value={profile.email} readOnly disabled className="h-9" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">Họ và tên</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Số điện thoại</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" className="h-9" />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="h-10 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
            >
              Lưu
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h3 className="mb-4 font-semibold">Đổi mật khẩu</h3>
          <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">Mật khẩu hiện tại</Label>
              <Input
                type="password"
                aria-invalid={!!errors.currentPassword}
                {...passwordForm.register("currentPassword")}
                className="h-9"
              />
              {errors.currentPassword && <p className="text-sm text-destructive">{errors.currentPassword.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-semibold">Mật khẩu mới</Label>
                <Input
                  type="password"
                  aria-invalid={!!errors.newPassword}
                  {...passwordForm.register("newPassword")}
                  className="h-9"
                />
                {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold">Xác nhận lại</Label>
                <Input
                  type="password"
                  aria-invalid={!!errors.confirmPassword}
                  {...passwordForm.register("confirmPassword")}
                  className="h-9"
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={passwordForm.formState.isSubmitting}
                className="h-10 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
              >
                Lưu
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Button type="button" variant="outline" onClick={handleLogout} className="w-fit">
        Đăng xuất
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/api/auth/change-password/route.ts apps/web/src/app/owner/settings/account-tab.tsx
git commit -m "feat(web): add Settings account tab"
```

---

### Task 10: `page.tsx` — wire all 4 tabs

**Files:**
- Modify: `apps/web/src/app/owner/settings/page.tsx` (was `ComingSoon`, full rewrite)

**Interfaces:**
- Consumes: `SettingsTab` (Task 4), `VenueInfoTab` (Task 6), `OperatingHoursTab` (Task 7), `NotificationsTab` (Task 8), `AccountTab` (Task 9).

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `apps/web/src/app/owner/settings/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Bell, Building2, Clock, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { VenueInfoTab } from "./venue-info-tab";
import { OperatingHoursTab } from "./operating-hours-tab";
import { NotificationsTab } from "./notifications-tab";
import { AccountTab } from "./account-tab";
import type { SettingsTab } from "./types";

const TABS: { value: SettingsTab; label: string; icon: typeof Building2 }[] = [
  { value: "venue", label: "Thông tin sân", icon: Building2 },
  { value: "hours", label: "Giờ hoạt động", icon: Clock },
  { value: "notifications", label: "Thông báo", icon: Bell },
  { value: "account", label: "Tài khoản", icon: User },
];

function isSettingsTab(value: string | null): value is SettingsTab {
  return value === "venue" || value === "hours" || value === "notifications" || value === "account";
}

export default function OwnerSettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("venue");

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (isSettingsTab(tab)) {
      setActiveTab(tab);
    }
  }, []);

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div>
        <h1 className="text-2xl font-bold">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">
          Cấu hình thông tin sân, giờ hoạt động, thông báo và tài khoản
        </p>
      </div>

      <div className="flex flex-col gap-6 md:flex-row">
        <nav className="flex w-full shrink-0 flex-col gap-1 md:w-56">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium",
                  active
                    ? "bg-blue-50 font-semibold text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">
          {activeTab === "venue" && <VenueInfoTab />}
          {activeTab === "hours" && <OperatingHoursTab />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "account" && <AccountTab />}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Type-check and test**

Run (from `apps/web`): `npx tsc --noEmit -p . && npm test`
Expected: type-check exits 0; all Vitest tests pass.

- [ ] **Step 3: Production build**

Run (from `apps/web`): `npm run build`
Expected: build succeeds with no new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/owner/settings/page.tsx
git commit -m "feat(web): wire up the full /owner/settings page"
```

---

### Task 11: Manual browser verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server**

Use the `run` skill (or `npm run dev` from `apps/web` if no project-specific script exists) to start the app, then log in as an existing owner test account that has at least one venue.

- [ ] **Step 2: Walk the golden path (per design spec §6)**

1. Go to `/owner/settings` → defaults to tab "Thông tin sân", showing the venue currently selected in the global branch switcher; switch branches in the sidebar → the form reloads for the new venue.
2. Edit tên/SĐT/địa chỉ/email/website/mô tả + change the logo → Lưu thay đổi → reopen `/owner/branches` for the same venue and confirm the changes show there too (both pages edit the same `venues` row by design).
3. Tab "Giờ hoạt động": toggle a few days, change some times → Lưu → reload the page → data persisted. Try setting a day's giờ mở >= giờ đóng while open → submit is blocked with an inline/toast error naming the day.
4. Tab "Thông báo": toggle "Đặt lịch mới" off → create a test booking as a customer → confirm the owner does NOT receive the new-booking email (check logs/MailHog) while the customer still gets their confirmation email → toggle back on → confirm the owner does receive it this time.
5. Tab "Tài khoản": edit tên/SĐT → Lưu → confirm it's reflected in the owner header/sidebar; change password with the wrong current password → inline error under "Mật khẩu hiện tại"; with the correct one → toast success, fields clear; confirm the OLD refresh token now 401s on `/auth/refresh` (devtools or a second logged-in tab); "Đăng xuất" logs out and redirects to `/login`.
6. Confirm venue with zero branches (fresh test account, if available) shows the "Chưa có chi nhánh nào..." message on both "Thông tin sân" and "Giờ hoạt động" tabs instead of an error or blank page.

- [ ] **Step 3: Report results**

Note any deviation from expected behavior found during manual verification. If everything matches, no code changes needed — this task is a checkpoint, not expected to produce commits.

---

## Full-suite check (after Task 11)

Run (from `apps/web`): `npx tsc --noEmit -p . && npm test && npm run build`
Run (from `apps/api`): `npm test && npm run test:e2e` (unrelated to this plan's changes, but confirms nothing cross-cutting broke)
Expected: everything green — this is the acceptance bar for the whole plan.
