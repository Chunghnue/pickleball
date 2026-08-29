# Sidebar Collapse/Expand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `≡` button to `AppHeader` that fully hides/shows `AdminSidebar`/`OwnerSidebar`, remembered across reloads via `localStorage`, on both `/admin/*` and `/owner/*`. Along the way, restyle the header's clock to two stacked lines (date, then time in blue) to match the sanbong.vn reference screenshot.

**Architecture:** A new `AppShell` client component owns the `collapsed` boolean (the only thing shared between the sidebar and the header's toggle button, which are siblings). `admin/layout.tsx`/`owner/layout.tsx` stay server components and just hand their sidebar element + account props to `AppShell`. `AppHeader` gets a new `onToggleSidebar` prop for the `≡` button and a restyled two-line clock (date/time split into two pure helper functions instead of one combined string).

**Tech Stack:** Next.js App Router, React, Tailwind, `lucide-react` (`Menu` icon, already installed), `localStorage` (no new dependency).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-29-sidebar-collapse-design.md`.
- Collapse behavior is "hide entirely", not an icon-only rail — no CSS transition/animation.
- No responsive/breakpoint auto-collapse — the `≡` button is the only way to toggle.
- Blue (`blue-600`/`blue-400`) is applied only to the clock's time line and the avatar circle — do not change any global theme token in `globals.css`.
- `AdminSidebar`/`OwnerSidebar` themselves are not modified — they're rendered conditionally from the outside.
- No new npm dependencies.

---

## Task 1: Split the clock helper, restyle `AppHeader`

**Files:**
- Modify: `apps/web/src/lib/format-datetime.ts`
- Modify: `apps/web/src/lib/format-datetime.test.ts`
- Modify: `apps/web/src/components/app-header.tsx`

**Interfaces:**
- Produces: `formatHeaderDate(date: Date): string`, `formatHeaderTime(date: Date): string` (replace `formatHeaderClock`) — consumed by `AppHeader` in this task.
- `AppHeader` gains a new required prop `onToggleSidebar: () => void` — consumed by `AppShell` in Task 2.

- [ ] **Step 1: Write the failing test for the two new helpers**

Replace the contents of `apps/web/src/lib/format-datetime.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatHeaderDate, formatHeaderTime } from './format-datetime';

describe('formatHeaderDate', () => {
  it('formats a Saturday date with a Vietnamese weekday', () => {
    const date = new Date(2026, 7, 29, 14, 30, 5);
    expect(formatHeaderDate(date)).toBe('Thứ Bảy, 29/08/2026');
  });

  it('zero-pads single-digit day and month', () => {
    const date = new Date(2026, 0, 5, 3, 4, 6);
    expect(formatHeaderDate(date)).toBe('Thứ Hai, 05/01/2026');
  });
});

describe('formatHeaderTime', () => {
  it('zero-pads single-digit hour, minute, and second', () => {
    const date = new Date(2026, 0, 5, 3, 4, 6);
    expect(formatHeaderTime(date)).toBe('03:04:06');
  });

  it('formats a time with double-digit components unchanged', () => {
    const date = new Date(2026, 7, 29, 14, 30, 5);
    expect(formatHeaderTime(date)).toBe('14:30:05');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/web`): `npm run test -- format-datetime`
Expected: FAIL — `formatHeaderDate`/`formatHeaderTime` are not exported by `./format-datetime` yet.

- [ ] **Step 3: Replace the implementation**

Replace the contents of `apps/web/src/lib/format-datetime.ts`:

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

export function formatHeaderDate(date: Date): string {
  const weekday = WEEKDAYS[date.getDay()];
  const day = pad2(date.getDate());
  const month = pad2(date.getMonth() + 1);
  const year = date.getFullYear();
  return `${weekday}, ${day}/${month}/${year}`;
}

export function formatHeaderTime(date: Date): string {
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());
  return `${hours}:${minutes}:${seconds}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- format-datetime`
Expected: PASS (4 tests).

- [ ] **Step 5: Update `AppHeader`**

Replace the contents of `apps/web/src/components/app-header.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatHeaderDate, formatHeaderTime } from "@/lib/format-datetime";

interface AppHeaderProps {
  accountLabel: string;
  accountHref?: string;
  onToggleSidebar: () => void;
}

export function AppHeader({ accountLabel, accountHref, onToggleSidebar }: AppHeaderProps) {
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
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Ẩn/hiện thanh điều hướng"
          onClick={onToggleSidebar}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Menu className="size-4" />
        </button>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">{mounted ? formatHeaderDate(now) : ""}</span>
          <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
            {mounted ? formatHeaderTime(now) : ""}
          </span>
        </div>
      </div>
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
          <DropdownMenuTrigger className="flex size-8 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white outline-none hover:bg-blue-700 focus-visible:ring-3 focus-visible:ring-ring/50">
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

- [ ] **Step 6: Type-check**

Run (from `apps/web`): `npx tsc --noEmit -p .`
Expected: exits 0. (This step intentionally leaves `AppHeader` with an unused-until-Task-2 `onToggleSidebar` prop requirement — that's fine, TypeScript only checks the component's own definition here; nothing calls `<AppHeader />` without it yet since Task 2 updates the only caller.)

Note: at this point `admin/layout.tsx` and `owner/layout.tsx` still call `<AppHeader accountLabel="..." />` without `onToggleSidebar` — **this will fail type-check** until Task 2/3/4 land. Run Steps 1-6 above, then continue directly into Task 2 before committing (see Task 2's own commit step, which stages all of this task's files too).

- [ ] **Step 7: Commit (together with Task 2)**

Do not commit yet — continue to Task 2, then commit both together.

---

## Task 2: `AppShell` component, apply to both layouts

**Files:**
- Create: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/src/app/admin/layout.tsx`
- Modify: `apps/web/src/app/owner/layout.tsx`

**Interfaces:**
- Consumes: `AppHeader` with its new `onToggleSidebar` prop (Task 1).
- Produces: `AppShell({ sidebar, accountLabel, accountHref, children })` (named export) — consumed by both layouts in this task.

- [ ] **Step 1: Create `AppShell`**

Create `apps/web/src/components/app-shell.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app-header";

const STORAGE_KEY = "sidebar-collapsed";

interface AppShellProps {
  sidebar: React.ReactNode;
  accountLabel: string;
  accountHref?: string;
  children: React.ReactNode;
}

export function AppShell({ sidebar, accountLabel, accountHref, children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "1") {
      setCollapsed(true);
    }
  }, []);

  function toggleSidebar() {
    setCollapsed((previous) => {
      const next = !previous;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div className="flex min-h-full">
      {!collapsed && sidebar}
      <div className="flex flex-1 flex-col">
        <AppHeader
          accountLabel={accountLabel}
          accountHref={accountHref}
          onToggleSidebar={toggleSidebar}
        />
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update the admin layout**

Replace the contents of `apps/web/src/app/admin/layout.tsx`:

```tsx
import { AdminSidebar } from "@/components/admin-sidebar";
import { AppShell } from "@/components/app-shell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell sidebar={<AdminSidebar />} accountLabel="Quản trị viên">
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 3: Update the owner layout**

Replace the contents of `apps/web/src/app/owner/layout.tsx`:

```tsx
import { OwnerSidebar } from "@/components/owner-sidebar";
import { AppShell } from "@/components/app-shell";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell sidebar={<OwnerSidebar />} accountLabel="Chủ sân" accountHref="/owner/settings">
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 4: Type-check and build**

Run (from `apps/web`): `npx tsc --noEmit -p . && npm run test && npm run build`
Expected: type-check exits 0, all Vitest tests pass, production build succeeds.

- [ ] **Step 5: Manual verification**

Run (from `apps/web`): `npm run dev` (or use the already-running dev server), log in as an owner and separately as an admin.
Expected on `/owner` and `/admin/approvals`: header shows the `≡` button, then a two-line clock (date on top, time in blue below); avatar circle is blue. Click `≡` → sidebar disappears entirely, content stretches full width. Click `≡` again → sidebar reappears. Reload the page (F5) while the sidebar is hidden → sidebar stays hidden (read from `localStorage`). Reload while shown → stays shown.

- [ ] **Step 6: Commit (Task 1 + Task 2 together)**

```bash
git add apps/web/src/lib/format-datetime.ts apps/web/src/lib/format-datetime.test.ts apps/web/src/components/app-header.tsx apps/web/src/components/app-shell.tsx apps/web/src/app/admin/layout.tsx apps/web/src/app/owner/layout.tsx
git commit -m "feat(web): add sidebar collapse/expand toggle, two-line header clock"
```

---

## Full-suite check (after Task 2)

Run (from `apps/web`): `npm run test && npx tsc --noEmit -p . && npm run build`
Expected: all Vitest tests pass, type-check exits 0, production build succeeds with no new warnings.
