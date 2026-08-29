# Owner Sidebar Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match `OwnerSidebar` to the sanbong.vn reference screenshot: a brand logo block, a real (but non-filtering) branch switcher dialog, a restructured menu (new "Dashboard" and "Chi nhánh" stub entries, renamed/re-iconed items), and blue active-item styling.

**Architecture:** A new `ui/dialog.tsx` wrapper (same pattern as `ui/dropdown-menu.tsx`, wrapping `@base-ui/react/dialog`) backs a new `BranchSwitcher` component, which fetches the owner's venues from the already-existing `GET /api/venues/mine` and lets the user pick one to relabel the switcher button — no filtering elsewhere. `OwnerSidebar` is rewritten: logo block + "CHI NHÁNH" label + `BranchSwitcher` above the nav, restructured `GROUPS` array, and a blue active-link style. Two new trivial `ComingSoon` stub pages (`/owner/dashboard`, `/owner/branches`) back the two new nav entries.

**Tech Stack:** Next.js App Router, React, Tailwind, `lucide-react`, `@base-ui/react/dialog` (already installed, not yet used anywhere in the app).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-29-owner-sidebar-visual-refresh-design.md`.
- Only `OwnerSidebar` and its owner-only surroundings change — `AdminSidebar` is untouched.
- Branch switcher only relabels its own button (local component state) — it must not add any filtering behavior to any other page.
- No `phone` or "Mặc định" badge in the branch dialog — those fields don't exist on `Venue` yet.
- No new npm dependencies.

---

## Task 1: `ui/dialog.tsx` wrapper

**Files:**
- Create: `apps/web/src/components/ui/dialog.tsx`

**Interfaces:**
- Produces: `Dialog`, `DialogTrigger`, `DialogContent`, `DialogClose`, `DialogTitle` (named exports) — consumed by `BranchSwitcher` in Task 2.

- [ ] **Step 1: Create the wrapper**

Create `apps/web/src/components/ui/dialog.tsx`:

```tsx
"use client";

import type { ComponentProps } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogTitle = DialogPrimitive.Title;

function DialogContent({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Popup>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40" />
      <DialogPrimitive.Popup
        className={cn(
          "fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg outline-none",
          className,
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogTrigger, DialogContent, DialogClose, DialogTitle };
```

- [ ] **Step 2: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ui/dialog.tsx
git commit -m "feat(web): add Dialog primitive wrapper (@base-ui/react/dialog)"
```

---

## Task 2: `BranchSwitcher` component

**Files:**
- Create: `apps/web/src/components/branch-switcher.tsx`

**Interfaces:**
- Consumes: `Dialog`, `DialogTrigger`, `DialogContent`, `DialogClose`, `DialogTitle` (Task 1); `GET /api/venues/mine` (existing endpoint, returns an array of `{ id: string; name: string; city: string; ... }`).
- Produces: `BranchSwitcher()` (named export, no props) — consumed by `OwnerSidebar` in Task 4.

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/branch-switcher.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Building2, ChevronRight } from "lucide-react";
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
}

const ALL_BRANCHES_LABEL = "Tất cả chi nhánh";

export function BranchSwitcher() {
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selectedLabel, setSelectedLabel] = useState(ALL_BRANCHES_LABEL);

  useEffect(() => {
    fetch("/api/venues/mine")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setVenues(Array.isArray(data) ? data : []));
  }, []);

  return (
    <Dialog>
      <DialogTrigger className="flex w-full items-center gap-2 rounded-lg bg-blue-50 px-2 py-2 text-left text-sm font-medium text-blue-700 outline-none hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-400">
        <Building2 className="size-4 shrink-0" />
        <span className="flex-1 truncate">{selectedLabel}</span>
        <ChevronRight className="size-4 shrink-0" />
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="mb-2 text-base font-semibold">Chọn chi nhánh</DialogTitle>
        <div className="flex flex-col gap-1">
          <DialogClose
            onClick={() => setSelectedLabel(ALL_BRANCHES_LABEL)}
            className="rounded px-2 py-2 text-left text-sm hover:bg-muted"
          >
            {ALL_BRANCHES_LABEL}
          </DialogClose>
          {venues.map((venue) => (
            <DialogClose
              key={venue.id}
              onClick={() => setSelectedLabel(venue.name)}
              className="flex flex-col rounded px-2 py-2 text-left text-sm hover:bg-muted"
            >
              <span>{venue.name}</span>
              <span className="text-xs text-muted-foreground">{venue.city}</span>
            </DialogClose>
          ))}
          {venues.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">Chưa có chi nhánh nào.</p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/branch-switcher.tsx
git commit -m "feat(web): add BranchSwitcher (branch picker dialog, label-only)"
```

---

## Task 3: New stub pages (`/owner/dashboard`, `/owner/branches`)

**Files:**
- Create: `apps/web/src/app/owner/dashboard/page.tsx`
- Create: `apps/web/src/app/owner/branches/page.tsx`

**Interfaces:**
- Consumes: `ComingSoon` (existing component, `apps/web/src/components/coming-soon.tsx`).

- [ ] **Step 1: Create the Dashboard stub**

Create `apps/web/src/app/owner/dashboard/page.tsx`:

```tsx
import { ComingSoon } from "@/components/coming-soon";

export default function OwnerDashboardPage() {
  return <ComingSoon title="Dashboard" />;
}
```

- [ ] **Step 2: Create the Branches stub**

Create `apps/web/src/app/owner/branches/page.tsx`:

```tsx
import { ComingSoon } from "@/components/coming-soon";

export default function OwnerBranchesPage() {
  return <ComingSoon title="Chi nhánh" />;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/owner/dashboard/page.tsx apps/web/src/app/owner/branches/page.tsx
git commit -m "feat(web): add Dashboard and Chi nhánh coming-soon stub pages"
```

---

## Task 4: Rewrite `OwnerSidebar` (logo, branch switcher, menu, active style)

**Files:**
- Modify: `apps/web/src/components/owner-sidebar.tsx`

**Interfaces:**
- Consumes: `BranchSwitcher` (Task 2); routes from Task 3.

- [ ] **Step 1: Replace the file**

Replace the contents of `apps/web/src/components/owner-sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarDays,
  Eye,
  IdCard,
  LayoutDashboard,
  MapPin,
  Settings,
  Tag,
  Trophy,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BranchSwitcher } from "@/components/branch-switcher";

const GROUPS = [
  {
    label: "Tổng quan",
    links: [{ href: "/owner/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Quản lý sân",
    links: [
      { href: "/owner", label: "Danh sách sân", icon: MapPin },
      { href: "/owner/bookings", label: "Đặt lịch", icon: CalendarDays },
      { href: "/owner/customers", label: "Khách hàng", icon: Users },
      { href: "/owner/pricing", label: "Bảng giá", icon: Tag },
    ],
  },
  {
    label: "Báo cáo",
    links: [
      { href: "/owner/revenue", label: "Doanh thu", icon: BarChart3 },
      { href: "/owner/page-views", label: "Lượt xem trang", icon: Eye },
    ],
  },
  {
    label: "Hệ thống",
    links: [
      { href: "/owner/branches", label: "Chi nhánh", icon: Building2 },
      { href: "/owner/accounts", label: "Tài khoản", icon: IdCard },
      { href: "/owner/settings", label: "Cài đặt", icon: Settings },
    ],
  },
];

export function OwnerSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 flex-col border-r p-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <div className="flex size-9 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Trophy className="size-5" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight">Pickleball</p>
          <p className="text-xs leading-tight text-muted-foreground">Quản lý sân thể thao</p>
        </div>
      </div>
      <p className="mb-1 px-2 text-xs font-semibold uppercase text-muted-foreground">
        Chi nhánh
      </p>
      <div className="mb-6 px-2">
        <BranchSwitcher />
      </div>
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
                    isActive &&
                      "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
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
    </aside>
  );
}
```

- [ ] **Step 2: Type-check, test, build**

Run (from `apps/web`): `npx tsc --noEmit -p . && npm run test && npm run build`
Expected: type-check exits 0, all Vitest tests pass, production build succeeds (new routes `/owner/dashboard` and `/owner/branches` appear in the route list).

- [ ] **Step 3: Manual verification**

Log in as an owner (via the running dev server), open `/owner`.
Expected: logo block ("Pickleball" + tagline) at the top; "CHI NHÁNH" label + a light-blue "Tất cả chi nhánh" button with a chevron; clicking it opens a dialog listing "Tất cả chi nhánh" plus the test account's venues (name + city); clicking a venue closes the dialog and updates the button's label; clicking "Tất cả chi nhánh" resets it. Nav shows, in order: Tổng quan/Dashboard, Quản lý sân/Danh sách sân+Đặt lịch+Khách hàng+Bảng giá, Báo cáo/Doanh thu+Lượt xem trang, Hệ thống/Chi nhánh+Tài khoản+Cài đặt. The active route is highlighted in blue. Clicking "Dashboard" and "Chi nhánh" lands on their "Sắp ra mắt" stub pages, no 404.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/owner-sidebar.tsx
git commit -m "feat(web): restyle OwnerSidebar to match sanbong.vn reference (logo, branch switcher, menu, active color)"
```

---

## Full-suite check (after Task 4)

Run (from `apps/web`): `npm run test && npx tsc --noEmit -p . && npm run build`
Expected: all Vitest tests pass, type-check exits 0, production build succeeds with no new warnings.
