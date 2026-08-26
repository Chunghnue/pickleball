"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin/approvals", label: "Chờ duyệt" },
  { href: "/admin/stats", label: "Thống kê" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 border-b pb-2">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "text-sm font-medium text-muted-foreground hover:text-foreground",
            pathname === link.href && "text-foreground underline",
          )}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
