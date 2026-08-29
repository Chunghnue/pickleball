"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CloudSun, LogOut, Menu, Moon, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatHeaderDate, formatHeaderTime } from "@/lib/format-datetime";

interface AppHeaderProps {
  accountHref?: string;
  onToggleSidebar: () => void;
}

export function AppHeader({ accountHref, onToggleSidebar }: AppHeaderProps) {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(new Date());
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");
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
        if (data?.role) setRole(data.role);
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
          <span className="flex items-center gap-1">
            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              {mounted ? formatHeaderTime(now) : ""}
            </span>
            <CloudSun className="size-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">--°C</span>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Đổi giao diện sáng/tối"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground outline-none hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:text-blue-400 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {mounted && theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Thông báo"
            className="relative flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground outline-none hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:text-blue-400 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Bell className="size-4" />
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-red-500" />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">Chưa có thông báo</div>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger className="flex size-8 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white outline-none hover:bg-blue-700 focus-visible:ring-3 focus-visible:ring-ring/50">
            {initial}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <div className="px-3 py-2">
              <p className="text-sm font-semibold">{fullName || "..."}</p>
              <p className="text-xs font-medium text-muted-foreground">{role.toUpperCase()}</p>
            </div>
            <div className="my-1 h-px bg-border" />
            {accountHref ? (
              <>
                <DropdownMenuItem
                  render={
                    <Link href={accountHref}>
                      <User className="size-4" />
                      Thông tin tài khoản
                    </Link>
                  }
                />
                <div className="my-1 h-px bg-border" />
              </>
            ) : null}
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-red-600 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-600 dark:text-red-400 dark:data-[highlighted]:bg-red-950/40 dark:data-[highlighted]:text-red-400"
            >
              <LogOut className="size-4" />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
