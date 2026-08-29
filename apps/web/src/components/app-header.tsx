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
