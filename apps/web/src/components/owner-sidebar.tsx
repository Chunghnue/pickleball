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
