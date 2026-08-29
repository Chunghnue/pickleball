# Owner Sidebar Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/owner/*` the same left-sidebar shell as `/admin/*` (nav + logout), with a grouped menu covering both the one real owner page today and 7 not-yet-built sections (from the sanbong.vn spec survey), each landing on a "Coming soon" placeholder instead of 404.

**Architecture:** A new `OwnerSidebar` client component (grouped nav, icons, active-route highlight, logout) rendered by a new `apps/web/src/app/owner/layout.tsx` nested layout — identical structure to the `AdminSidebar`/`admin/layout.tsx` pair built earlier this session, just with a grouped menu instead of a flat one. A shared `ComingSoon` component backs the 7 placeholder pages so they're not 7 copies of the same JSX. The 2 existing owner pages drop their own duplicated logout button/handler (now redundant, same fix already applied to the admin pages).

**Tech Stack:** Next.js App Router nested layouts, React, Tailwind, `lucide-react` (already installed) for icons.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-29-owner-sidebar-layout-design.md`.
- Pure navigation/layout + placeholder pages — no real feature logic for any of the 7 "coming soon" sections.
- No responsive/collapsible sidebar behavior (fixed-width, always visible) — same decision as the admin sidebar.
- Menu item set is fixed per the spec's §3 table — do not add/rename/drop items.

---

## Task 1: `OwnerSidebar`, `owner` layout, `ComingSoon` component

**Files:**
- Create: `apps/web/src/components/owner-sidebar.tsx`
- Create: `apps/web/src/app/owner/layout.tsx`
- Create: `apps/web/src/components/coming-soon.tsx`

**Interfaces:**
- Produces: `OwnerSidebar` (default export from `owner-sidebar.tsx`, no props) — consumed by `owner/layout.tsx` in this task. `ComingSoon({ title }: { title: string })` (named export from `coming-soon.tsx`) — consumed by Task 2's 7 stub pages.

No unit test for this — verified by a production build, and a full manual browser check at the end of Task 3 once every page exists.

- [ ] **Step 1: Create the sidebar component**

Create `apps/web/src/components/owner-sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  DollarSign,
  Eye,
  LogOut,
  Settings,
  Tag,
  UserCog,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const GROUPS = [
  {
    label: "Quản lý sân",
    links: [
      { href: "/owner", label: "Sân của tôi", icon: Building2 },
      { href: "/owner/bookings", label: "Đặt lịch", icon: CalendarDays },
      { href: "/owner/customers", label: "Khách hàng", icon: Users },
      { href: "/owner/pricing", label: "Bảng giá", icon: Tag },
    ],
  },
  {
    label: "Báo cáo",
    links: [
      { href: "/owner/revenue", label: "Doanh thu", icon: DollarSign },
      { href: "/owner/page-views", label: "Lượt xem trang", icon: Eye },
    ],
  },
  {
    label: "Hệ thống",
    links: [
      { href: "/owner/accounts", label: "Tài khoản", icon: UserCog },
      { href: "/owner/settings", label: "Cài đặt", icon: Settings },
    ],
  },
];

export function OwnerSidebar() {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside className="flex w-56 flex-col border-r p-4">
      <p className="mb-6 px-2 text-sm font-semibold text-muted-foreground">
        Quản trị chủ sân
      </p>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <p className="px-2 text-xs font-semibold uppercase text-muted-foreground">
              {group.label}
            </p>
            {group.links.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2 rounded px-2 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                    isActive && "bg-muted text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {link.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <Button variant="outline" className="justify-start gap-2" onClick={handleLogout}>
        <LogOut className="size-4" />
        Đăng xuất
      </Button>
    </aside>
  );
}
```

- [ ] **Step 2: Create the owner layout**

Create `apps/web/src/app/owner/layout.tsx`:

```tsx
import { OwnerSidebar } from "@/components/owner-sidebar";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <OwnerSidebar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Create the shared "coming soon" component**

Create `apps/web/src/components/coming-soon.tsx`:

```tsx
export function ComingSoon({ title }: { title: string }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground">
        Tính năng đang được phát triển, sẽ sớm ra mắt.
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Run the production build to verify no type/import errors**

Run (from `apps/web`): `npm run build`
Expected: build succeeds. At this point `/owner` and `/owner/venues/[id]` render both the new sidebar and their own (still-present, now-redundant) logout button — expected, cleaned up in Task 3.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/owner-sidebar.tsx apps/web/src/app/owner/layout.tsx apps/web/src/components/coming-soon.tsx
git commit -m "feat(web): add OwnerSidebar, owner layout, and ComingSoon component"
```

---

## Task 2: 7 "coming soon" pages

**Files:**
- Create: `apps/web/src/app/owner/bookings/page.tsx`
- Create: `apps/web/src/app/owner/customers/page.tsx`
- Create: `apps/web/src/app/owner/pricing/page.tsx`
- Create: `apps/web/src/app/owner/revenue/page.tsx`
- Create: `apps/web/src/app/owner/page-views/page.tsx`
- Create: `apps/web/src/app/owner/accounts/page.tsx`
- Create: `apps/web/src/app/owner/settings/page.tsx`

**Interfaces:**
- Consumes: `ComingSoon` (Task 1).

- [ ] **Step 1: Create all 7 stub pages**

Create `apps/web/src/app/owner/bookings/page.tsx`:

```tsx
import { ComingSoon } from "@/components/coming-soon";

export default function OwnerBookingsPage() {
  return <ComingSoon title="Đặt lịch" />;
}
```

Create `apps/web/src/app/owner/customers/page.tsx`:

```tsx
import { ComingSoon } from "@/components/coming-soon";

export default function OwnerCustomersPage() {
  return <ComingSoon title="Khách hàng" />;
}
```

Create `apps/web/src/app/owner/pricing/page.tsx`:

```tsx
import { ComingSoon } from "@/components/coming-soon";

export default function OwnerPricingPage() {
  return <ComingSoon title="Bảng giá" />;
}
```

Create `apps/web/src/app/owner/revenue/page.tsx`:

```tsx
import { ComingSoon } from "@/components/coming-soon";

export default function OwnerRevenuePage() {
  return <ComingSoon title="Doanh thu" />;
}
```

Create `apps/web/src/app/owner/page-views/page.tsx`:

```tsx
import { ComingSoon } from "@/components/coming-soon";

export default function OwnerPageViewsPage() {
  return <ComingSoon title="Lượt xem trang" />;
}
```

Create `apps/web/src/app/owner/accounts/page.tsx`:

```tsx
import { ComingSoon } from "@/components/coming-soon";

export default function OwnerAccountsPage() {
  return <ComingSoon title="Tài khoản" />;
}
```

Create `apps/web/src/app/owner/settings/page.tsx`:

```tsx
import { ComingSoon } from "@/components/coming-soon";

export default function OwnerSettingsPage() {
  return <ComingSoon title="Cài đặt" />;
}
```

- [ ] **Step 2: Run the production build to verify all 7 routes register**

Run (from `apps/web`): `npm run build`
Expected: build succeeds; route table includes all 7 new static routes: `○ /owner/bookings`, `○ /owner/customers`, `○ /owner/pricing`, `○ /owner/revenue`, `○ /owner/page-views`, `○ /owner/accounts`, `○ /owner/settings`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/bookings apps/web/src/app/owner/customers apps/web/src/app/owner/pricing apps/web/src/app/owner/revenue apps/web/src/app/owner/page-views apps/web/src/app/owner/accounts apps/web/src/app/owner/settings
git commit -m "feat(web): add coming-soon placeholder pages for future owner sections"
```

---

## Task 3: Migrate existing owner pages off their own logout button

**Files:**
- Modify: `apps/web/src/app/owner/page.tsx`
- Modify: `apps/web/src/app/owner/venues/[id]/page.tsx`

**Interfaces:**
- Consumes: `OwnerSidebar` via `apps/web/src/app/owner/layout.tsx` (Task 1) — applied automatically by Next.js, no import needed in the pages themselves.

- [ ] **Step 1: Update `owner/page.tsx`**

Replace the file's contents with:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
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

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sân của tôi</h1>
        <Link href="/owner/venues/new" className={buttonVariants()}>
          Thêm sân mới
        </Link>
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

- [ ] **Step 2: Update `owner/venues/[id]/page.tsx`**

Replace the file's contents with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { VenueInfoSection } from "./venue-info-section";
import { VenueImagesSection } from "./venue-images-section";
import { CourtsSection } from "./courts-section";
import { BookingsSection } from "./bookings-section";
import type { Court, Venue } from "./types";

export default function OwnerVenueDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [courts, setCourts] = useState<Court[] | null>(null);

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

  useEffect(() => {
    if (!venue) return;
    fetch(`/api/venues/mine/${venue.id}/courts`)
      .then((res) => res.json())
      .then((data) => setCourts(Array.isArray(data) ? data : []));
  }, [venue]);

  if (!venue) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p>Đang tải...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">{venue.name}</h1>

      <VenueInfoSection venue={venue} onUpdated={setVenue} />
      <VenueImagesSection
        venueId={venue.id}
        images={venue.images}
        onImagesChanged={(images) => setVenue({ ...venue, images })}
      />
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
    </main>
  );
}
```

- [ ] **Step 3: Run the production build**

Run (from `apps/web`): `npm run build`
Expected: build succeeds, no TypeScript errors, no unused-import warnings for `Button` in either file.

- [ ] **Step 4: Run the web unit test suite**

Run (from `apps/web`): `npm test`
Expected: PASS (49 tests — this change touches no logic these tests cover).

- [ ] **Step 5: Manually verify against the running app**

With the web dev server running and an active (approved) owner account logged in, check across all 9 `/owner/*` pages (`/owner`, the 7 coming-soon pages, and `/owner/venues/[id]` for an existing venue):
1. Sidebar renders on the left on every page, grouped into "Quản lý sân" / "Báo cáo" / "Hệ thống" with the correct 8 items and icons.
2. On `/owner`, the "Sân của tôi" link is highlighted; on each coming-soon page, that page's own link is highlighted.
3. Clicking each of the 7 new links navigates to its page and shows "Tính năng đang được phát triển, sẽ sớm ra mắt." — no 404.
4. "Đăng xuất" is present on every page and logs out correctly (redirects to `/login`).
5. `/owner` still shows "Thêm sân mới" working correctly, and `/owner/venues/[id]` still shows venue info/images/courts/bookings sections working as before (this task didn't change their logic, only removed the duplicated logout).

Report the result of each of these 5 checks before proceeding to commit.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/owner/page.tsx "apps/web/src/app/owner/venues/[id]/page.tsx"
git commit -m "feat(web): migrate owner pages to the new sidebar layout"
```

---

## Self-Review Notes

- **Spec coverage:** §3 menu list incl. the "not included" items explicitly left out (Task 1's `GROUPS`), §4 sidebar/layout/coming-soon components (Task 1), §5 migration of the 2 real pages (Task 3), §6 out-of-scope items (real feature builds, responsive sidebar, branch-switcher dropdown) correctly absent from every task, §7 testing — build + full manual walkthrough covering every route and the exact logout-consistency fix (Task 3 Step 5).
- **Type consistency:** `OwnerSidebar`/`ComingSoon` have no/one prop respectively, matching their only call sites (`owner/layout.tsx` for the former, all 7 Task 2 pages for the latter). The 8 routes in Task 1's `GROUPS` match exactly the 7 files created in Task 2 plus the existing `/owner` route — no route typos between the nav config and the actual page files.
- **Placeholder scan:** no TBD/TODO; every step has runnable code and exact commands.
