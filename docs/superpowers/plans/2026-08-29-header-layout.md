# Header Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared header row above the content column on every `/admin/*` and `/owner/*` page: a real-time clock, a light/dark theme toggle, and an account menu (name, role label, account link when one exists, logout) — and remove the now-redundant standalone logout button from `AdminSidebar`/`OwnerSidebar`.

**Architecture:** A new `AppHeader` client component rendered inside `admin/layout.tsx` and `owner/layout.tsx`, next to the existing sidebars (layout changes from a single `sidebar | content` row to `sidebar | (header row above content)`). Theming uses `next-themes` (already a dependency, currently unused) wired up once at the root layout. The account menu is a thin `ui/dropdown-menu.tsx` wrapper around the already-installed `@base-ui/react/menu` primitive, following the same wrapping convention as the existing `ui/button.tsx`/`ui/input.tsx`. The clock string is produced by a small pure helper so it has a real unit test, matching how `lib/*.ts` logic is tested elsewhere in this app.

**Tech Stack:** Next.js App Router, React, `next-themes` (^0.4.6), `@base-ui/react` (^1.7.0), `lucide-react`, Tailwind, Vitest (`environment: 'node'`, no DOM — pure-logic tests only, consistent with the existing `apps/web` test suite).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-29-header-layout-design.md`.
- No new npm dependencies — `next-themes` and `@base-ui/react` are already in `apps/web/package.json`.
- Reuse `GET /api/users/me` (existing endpoint) for the account menu's display name — no backend changes.
- Do not add weather, a notification bell, a floating chat button, or a sidebar-collapse toggle — all explicitly out of scope in the spec §5.
- Admin has no account/settings destination yet — its account menu shows name + role label + logout only, no "Thông tin tài khoản" link.
- All UI copy in Vietnamese, matching the rest of the app.
- No unit/e2e tests for the React components themselves (no jsdom/testing-library in this project's Vitest config — `environment: 'node'`) — verify those with a production build + manual browser check, same convention used for `AdminSidebar`/`OwnerSidebar`.

---

## Task 1: `formatHeaderClock` pure helper

**Files:**
- Create: `apps/web/src/lib/format-datetime.ts`
- Test: `apps/web/src/lib/format-datetime.test.ts`

**Interfaces:**
- Produces: `formatHeaderClock(date: Date): string` — consumed by `AppHeader` in Task 4.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/format-datetime.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatHeaderClock } from './format-datetime';

describe('formatHeaderClock', () => {
  it('formats a Saturday date with a Vietnamese weekday and zero-padded time', () => {
    const date = new Date(2026, 7, 29, 14, 30, 5);
    expect(formatHeaderClock(date)).toBe('Thứ Bảy, 29/08/2026 · 14:30:05');
  });

  it('zero-pads single-digit day, month, hour, minute, and second', () => {
    const date = new Date(2026, 0, 5, 3, 4, 6);
    expect(formatHeaderClock(date)).toBe('Thứ Hai, 05/01/2026 · 03:04:06');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/web`): `npm run test -- format-datetime`
Expected: FAIL — `Cannot find module './format-datetime'` (file does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/format-datetime.ts`:

```ts
const WEEKDAYS = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatHeaderClock(date: Date): string {
  const weekday = WEEKDAYS[date.getDay()];
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = date.getFullYear();
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());
  return `${weekday}, ${day}/${month}/${year} · ${hours}:${minutes}:${seconds}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- format-datetime`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/format-datetime.ts apps/web/src/lib/format-datetime.test.ts
git commit -m "feat(web): add formatHeaderClock helper for the shared header"
```

---

## Task 2: Wire `ThemeProvider` into the root layout

**Files:**
- Modify: `apps/web/src/app/layout.tsx`

**Interfaces:**
- Produces: app-wide light/dark theme via `next-themes`'s `useTheme()` hook — consumed by `AppHeader` in Task 4.

No test for this step (pure wiring, no branching logic) — verified by a production build.

- [ ] **Step 1: Add `ThemeProvider` and `suppressHydrationWarning`**

Edit `apps/web/src/app/layout.tsx` — current content:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pickleball",
  description: "Đặt sân pickleball",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

Replace with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pickleball",
  description: "Đặt sân pickleball",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
```

(`.dark { ... }` overrides already exist in `apps/web/src/app/globals.css:86`, so `attribute="class"` works with the existing color tokens with no CSS changes.)

- [ ] **Step 2: Verify with a production build**

Run (from `apps/web`): `npm run build`
Expected: build succeeds, no hydration-related warnings in the output.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/layout.tsx
git commit -m "feat(web): wire up next-themes ThemeProvider at the root layout"
```

---

## Task 3: `ui/dropdown-menu.tsx` primitive wrapper

**Files:**
- Create: `apps/web/src/components/ui/dropdown-menu.tsx`

**Interfaces:**
- Produces: `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` (named exports) — consumed by `AppHeader` in Task 4.

No test for this step (thin styling wrapper around a third-party primitive, no branching logic of its own) — verified visually once `AppHeader` uses it in Task 4.

- [ ] **Step 1: Create the wrapper**

Create `apps/web/src/components/ui/dropdown-menu.tsx`:

```tsx
"use client";

import type { ComponentProps } from "react";
import { Menu } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";

const DropdownMenu = Menu.Root;
const DropdownMenuTrigger = Menu.Trigger;

function DropdownMenuContent({
  className,
  sideOffset = 8,
  align = "end",
  ...props
}: ComponentProps<typeof Menu.Popup> &
  Pick<ComponentProps<typeof Menu.Positioner>, "sideOffset" | "align">) {
  return (
    <Menu.Portal>
      <Menu.Positioner sideOffset={sideOffset} align={align} className="z-50 outline-none">
        <Menu.Popup
          className={cn(
            "min-w-56 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md outline-none",
            className,
          )}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

function DropdownMenuItem({ className, ...props }: ComponentProps<typeof Menu.Item>) {
  return (
    <Menu.Item
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem };
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/ui/dropdown-menu.tsx
git commit -m "feat(web): add DropdownMenu primitive wrapper (@base-ui/react/menu)"
```

---

## Task 4: `AppHeader` component

**Files:**
- Create: `apps/web/src/components/app-header.tsx`

**Interfaces:**
- Consumes: `formatHeaderClock(date: Date): string` (Task 1), `useTheme()` from `next-themes` (Task 2), `DropdownMenu`/`DropdownMenuTrigger`/`DropdownMenuContent`/`DropdownMenuItem` (Task 3), `GET /api/users/me` (existing endpoint, returns `{ fullName: string; ... }`), `POST /api/auth/logout` (existing endpoint, same call already used in `AdminSidebar`/`OwnerSidebar`).
- Produces: `AppHeader({ accountLabel, accountHref }: { accountLabel: string; accountHref?: string })` (named export) — consumed by `admin/layout.tsx` (Task 5) and `owner/layout.tsx` (Task 6).

No test for this step (React UI, no jsdom in this project's Vitest config) — verified manually once wired into a layout in Task 5/6.

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/app-header.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatHeaderClock } from "@/lib/format-datetime";

interface AppHeaderProps {
  accountLabel: string;
  accountHref?: string;
}

export function AppHeader({ accountLabel, accountHref }: AppHeaderProps) {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(new Date());
  const [fullName, setFullName] = useState("");
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetch("/api/users/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.fullName) setFullName(data.fullName);
      });
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const initial = fullName.trim().charAt(0).toUpperCase() || "?";

  return (
    <header className="flex h-14 items-center justify-between border-b px-4">
      <p className="text-sm text-muted-foreground">{mounted ? formatHeaderClock(now) : ""}</p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Đổi giao diện sáng/tối"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {mounted && theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            {initial}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">{fullName || "..."}</p>
              <p className="text-xs text-muted-foreground">{accountLabel}</p>
            </div>
            <div className="my-1 h-px bg-border" />
            {accountHref ? (
              <DropdownMenuItem render={<Link href={accountHref}>Thông tin tài khoản</Link>} />
            ) : null}
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="size-4" />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/app-header.tsx
git commit -m "feat(web): add shared AppHeader (clock, theme toggle, account menu)"
```

---

## Task 5: Apply `AppHeader` to `/admin/*`, remove sidebar logout

**Files:**
- Modify: `apps/web/src/app/admin/layout.tsx`
- Modify: `apps/web/src/components/admin-sidebar.tsx`

**Interfaces:**
- Consumes: `AppHeader` (Task 4).

No new test — manual browser verification below.

- [ ] **Step 1: Add the header row to the admin layout**

Edit `apps/web/src/app/admin/layout.tsx` — current content:

```tsx
import { AdminSidebar } from "@/components/admin-sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <AdminSidebar />
      <div className="flex-1">{children}</div>
    </div>
  );
}
```

Replace with:

```tsx
import { AdminSidebar } from "@/components/admin-sidebar";
import { AppHeader } from "@/components/app-header";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <AdminSidebar />
      <div className="flex flex-1 flex-col">
        <AppHeader accountLabel="Quản trị viên" />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Remove the sidebar's own logout button**

Edit `apps/web/src/components/admin-sidebar.tsx`:

- Remove the `LogOut` import from the `lucide-react` import line (keep `BarChart3, ClipboardCheck, MessageSquareWarning`).
- Remove the `Button` import (`import { Button } from "@/components/ui/button";`) — no longer used in this file.
- Remove the `handleLogout` function.
- Remove the trailing `<Button variant="outline" ...>Đăng xuất</Button>` element (the last child of `<aside>`, right after the closing `</nav>`).

Resulting file:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardCheck, MessageSquareWarning } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/approvals", label: "Chờ duyệt", icon: ClipboardCheck },
  { href: "/admin/stats", label: "Thống kê", icon: BarChart3 },
  { href: "/admin/disputes", label: "Khiếu nại", icon: MessageSquareWarning },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex w-56 flex-col border-r p-4">
      <p className="mb-6 px-2 text-sm font-semibold text-muted-foreground">
        Quản trị
      </p>
      <nav className="flex flex-1 flex-col gap-1">
        {LINKS.map((link) => {
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
      </nav>
    </aside>
  );
}
```

- [ ] **Step 3: Manual verification**

Run (from `apps/web`): `npm run dev`, log in as an admin account, open `/admin/approvals`, `/admin/stats`, `/admin/disputes`.
Expected on every page: header visible above the content (clock ticking, theme toggle, avatar circle with the account's first initial); avatar menu shows name + "Quản trị viên" and no "Thông tin tài khoản" link (no `accountHref` passed); clicking "Đăng xuất" in the header logs out and redirects to `/login`; the sidebar no longer shows any logout button.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/admin/layout.tsx apps/web/src/components/admin-sidebar.tsx
git commit -m "feat(web): add header to /admin/* layout, move logout out of the sidebar"
```

---

## Task 6: Apply `AppHeader` to `/owner/*`, remove sidebar logout

**Files:**
- Modify: `apps/web/src/app/owner/layout.tsx`
- Modify: `apps/web/src/components/owner-sidebar.tsx`

**Interfaces:**
- Consumes: `AppHeader` (Task 4).

No new test — manual browser verification below.

- [ ] **Step 1: Add the header row to the owner layout**

Edit `apps/web/src/app/owner/layout.tsx` — current content:

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

Replace with:

```tsx
import { OwnerSidebar } from "@/components/owner-sidebar";
import { AppHeader } from "@/components/app-header";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full">
      <OwnerSidebar />
      <div className="flex flex-1 flex-col">
        <AppHeader accountLabel="Chủ sân" accountHref="/owner/settings" />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Remove the sidebar's own logout button**

Edit `apps/web/src/components/owner-sidebar.tsx`:

- Remove `LogOut` from the `lucide-react` import line (keep `Building2, CalendarDays, DollarSign, Eye, Settings, Tag, UserCog, Users`).
- Remove the `Button` import (`import { Button } from "@/components/ui/button";`) — no longer used in this file.
- Remove the `handleLogout` function.
- Remove the trailing `<Button variant="outline" ...>Đăng xuất</Button>` element (the last child of `<aside>`, right after the closing `</nav>`).

Resulting file:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarDays,
  DollarSign,
  Eye,
  Settings,
  Tag,
  UserCog,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    </aside>
  );
}
```

- [ ] **Step 3: Manual verification**

Run (from `apps/web`): `npm run dev`, log in as an owner account, open `/owner`, `/owner/venues/[id]` (an existing venue), and at least one "Sắp ra mắt" stub page (e.g. `/owner/pricing`).
Expected on every page: header visible above the content; avatar menu shows name + "Chủ sân" and a "Thông tin tài khoản" link that navigates to `/owner/settings`; "Đăng xuất" in the header logs out and redirects to `/login`; the sidebar no longer shows any logout button.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/owner/layout.tsx apps/web/src/components/owner-sidebar.tsx
git commit -m "feat(web): add header to /owner/* layout, move logout out of the sidebar"
```

---

## Full-suite check (after Task 6)

Run (from `apps/web`): `npm run test && npm run build`
Expected: all Vitest tests pass (including the 2 new `formatHeaderClock` tests), production build succeeds with no new warnings.
