# Admin Sidebar Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin section's top horizontal nav with a persistent left sidebar (nav + logout), applied to all `/admin/*` pages via one Next.js nested layout instead of per-page wiring.

**Architecture:** A new `AdminSidebar` client component (icons + labels, active-route highlight, logout button) rendered by a new `apps/web/src/app/admin/layout.tsx` server layout that wraps every page under `/admin`. The existing `AdminNav` component and each page's own `<AdminNav />` usage (plus the approvals page's duplicated logout button) are removed — this also fixes the pre-existing bug where Stats/Disputes pages had no logout button at all.

**Tech Stack:** Next.js App Router nested layouts, React, Tailwind, `lucide-react` (already installed) for icons.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-29-admin-sidebar-layout-design.md`.
- Pure navigation/layout change — no page content, no API, no color/theme changes.
- No responsive/collapsible behavior in this pass (fixed-width sidebar, always visible).
- Each page keeps its own `<main>` wrapper and width (`max-w-2xl` for approvals/disputes, `max-w-3xl` for stats) — the layout only adds the sidebar alongside it.

---

## Task 1: `AdminSidebar` component + `admin` layout

**Files:**
- Create: `apps/web/src/components/admin-sidebar.tsx`
- Create: `apps/web/src/app/admin/layout.tsx`

**Interfaces:**
- Produces: `AdminSidebar` (default export from `admin-sidebar.tsx`, no props) — consumed by `apps/web/src/app/admin/layout.tsx` in this task, and indirectly by every page under `/admin/*` once Next.js applies the layout automatically.

There's no unit test for this — it's verified by a production build (catches type/import errors) and a manual browser check at the end of Task 2, once the old nav is fully removed and the sidebar is the only chrome left to look at.

- [ ] **Step 1: Create the sidebar component**

Create `apps/web/src/components/admin-sidebar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ClipboardCheck, LogOut, MessageSquareWarning } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/admin/approvals", label: "Chờ duyệt", icon: ClipboardCheck },
  { href: "/admin/stats", label: "Thống kê", icon: BarChart3 },
  { href: "/admin/disputes", label: "Khiếu nại", icon: MessageSquareWarning },
];

export function AdminSidebar() {
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

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
      <Button variant="outline" className="justify-start gap-2" onClick={handleLogout}>
        <LogOut className="size-4" />
        Đăng xuất
      </Button>
    </aside>
  );
}
```

- [ ] **Step 2: Create the admin layout**

Create `apps/web/src/app/admin/layout.tsx`:

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

- [ ] **Step 3: Run the production build to verify no type/import errors**

Run (from `apps/web`): `npm run build`
Expected: build succeeds, route table still lists `/admin/approvals`, `/admin/stats`, `/admin/disputes`. At this point each page still renders its own (now-redundant) `<AdminNav />` on top of the new sidebar — that's expected and gets cleaned up in Task 2, not a bug to fix here.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/admin-sidebar.tsx apps/web/src/app/admin/layout.tsx
git commit -m "feat(web): add AdminSidebar and admin section layout"
```

---

## Task 2: Migrate pages off `AdminNav`, remove the old component

**Files:**
- Modify: `apps/web/src/app/admin/approvals/page.tsx`
- Modify: `apps/web/src/app/admin/stats/page.tsx`
- Modify: `apps/web/src/app/admin/disputes/page.tsx`
- Delete: `apps/web/src/components/admin-nav.tsx`

**Interfaces:**
- Consumes: `AdminSidebar` via `apps/web/src/app/admin/layout.tsx` (Task 1) — applied automatically by Next.js, no import needed in the pages themselves.

- [ ] **Step 1: Update `approvals/page.tsx`**

This page is the only one with its own logout button/handler (now redundant — it lives in the sidebar). Replace the file's contents with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PendingOwnerRow {
  type: "owner";
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  submittedAt: string;
}

interface PendingVenueRow {
  type: "venue";
  id: string;
  name: string;
  address: string;
  city: string;
  submittedAt: string;
  owner: {
    id: string;
    fullName: string;
    status: string;
  };
}

type ApprovalRow = PendingOwnerRow | PendingVenueRow;

const OWNER_STATUS_LABELS: Record<string, string> = {
  pending_verification: "Chưa xác thực email",
  pending_approval: "Chờ duyệt",
  active: "Đã duyệt",
  rejected: "Đã từ chối",
  suspended: "Đã khoá",
};

export default function AdminApprovalsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ApprovalRow[] | null>(null);

  async function loadPending() {
    const response = await fetch("/api/admin/approvals");
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fadmin%2Fapprovals");
      return;
    }
    const data = await response.json().catch(() => []);
    setRows(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    loadPending();
  }, []);

  async function handleDecision(row: ApprovalRow, action: "approve" | "reject") {
    let reason: string | undefined;
    if (action === "reject") {
      const input = window.prompt("Lý do từ chối (không bắt buộc):");
      if (input === null) return;
      reason = input.trim() || undefined;
    }

    const basePath = row.type === "owner" ? "/api/admin/owners" : "/api/admin/venues";
    const response = await fetch(`${basePath}/${row.id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (!response.ok) {
      toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      return;
    }
    toast.success(action === "approve" ? "Đã duyệt" : "Đã từ chối");
    loadPending();
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">Chờ duyệt</h1>

      {rows === null && <p>Đang tải...</p>}
      {rows !== null && rows.length === 0 && (
        <p className="text-muted-foreground">Không có gì đang chờ duyệt.</p>
      )}

      <div className="flex flex-col gap-4">
        {rows?.map((row) => (
          <Card key={`${row.type}-${row.id}`}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium uppercase text-muted-foreground">
                  {row.type === "owner" ? "Chủ sân" : "Chi nhánh"}
                </span>
                {row.type === "owner" ? row.fullName : row.name}
                {row.type === "venue" && (
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Chủ sân: {OWNER_STATUS_LABELS[row.owner.status] ?? row.owner.status}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {row.type === "owner" ? row.email : `${row.address}, ${row.city}`}
              </span>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleDecision(row, "approve")}>
                  Duyệt
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleDecision(row, "reject")}
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

- [ ] **Step 2: Update `stats/page.tsx`**

Remove the `AdminNav` import and its usage. Change:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminNav } from "@/components/admin-nav";
```

to:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
```

And change:

```tsx
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 p-8">
      <AdminNav />
      <h1 className="text-2xl font-bold">Thống kê nền tảng</h1>
```

to:

```tsx
    <main className="mx-auto flex max-w-3xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">Thống kê nền tảng</h1>
```

- [ ] **Step 3: Update `disputes/page.tsx`**

Remove the `AdminNav` import and its usage. Change:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdminNav } from "@/components/admin-nav";
import { getSubmitErrorMessage } from "@/lib/error-message";
```

to:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSubmitErrorMessage } from "@/lib/error-message";
```

And change:

```tsx
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <AdminNav />
      <h1 className="text-2xl font-bold">Khiếu nại</h1>
```

to:

```tsx
    <main className="mx-auto flex max-w-2xl flex-1 flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold">Khiếu nại</h1>
```

- [ ] **Step 4: Delete the old nav component**

Delete `apps/web/src/components/admin-nav.tsx`. Confirm nothing else references it:

Run: `grep -rn "admin-nav" apps/web/src`
Expected: no output (no remaining references).

- [ ] **Step 5: Run the production build**

Run (from `apps/web`): `npm run build`
Expected: build succeeds, no TypeScript errors, no unused-import warnings for `AdminNav`.

- [ ] **Step 6: Run the web unit test suite**

Run (from `apps/web`): `npm test`
Expected: PASS (49 tests — this change touches no logic these tests cover, just confirms nothing else broke).

- [ ] **Step 7: Manually verify against the running app**

With the web dev server running (and an admin session available), for each of `/admin/approvals`, `/admin/stats`, `/admin/disputes`:
1. Sidebar renders on the left with all 3 links and no duplicate/old top nav.
2. The link matching the current page is visually highlighted (background), the other two are not.
3. Clicking each link navigates correctly and the highlight moves with it.
4. "Đăng xuất" is present and visible on all 3 pages (previously missing on Stats/Disputes) and logs out correctly (redirects to `/login`).

Report the result of each of these 4 checks before proceeding to commit.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/app/admin/approvals/page.tsx apps/web/src/app/admin/stats/page.tsx apps/web/src/app/admin/disputes/page.tsx
git rm apps/web/src/components/admin-nav.tsx
git commit -m "feat(web): migrate admin pages to the new sidebar layout"
```

---

## Self-Review Notes

- **Spec coverage:** §3 sidebar component incl. icons/active-highlight/logout (Task 1), §4 layout + per-page cleanup incl. dropping approvals' duplicated logout (Task 2), §5 out-of-scope items (responsive/collapse, shared header, theme changes) correctly absent from both tasks, §6 testing — build + manual walkthrough covering the exact bug this fixes (missing logout on Stats/Disputes) (Task 2 Step 7).
- **Type consistency:** `AdminSidebar` has no props in both its definition (Task 1) and its only call site in `layout.tsx` (Task 1). Route/label/icon set in Task 1's `LINKS` matches the 3 existing page routes exactly (`/admin/approvals`, `/admin/stats`, `/admin/disputes`).
- **Placeholder scan:** no TBD/TODO; every step has runnable code and exact commands.
