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
