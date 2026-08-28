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
