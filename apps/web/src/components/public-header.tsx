"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, LandPlot, LogIn, LogOut, Map, Search, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";

export function PublicHeader() {
  const [fullName, setFullName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/users/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setFullName(data?.fullName ?? null));
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const initial = fullName?.trim().charAt(0).toUpperCase() || "?";

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-xl font-bold text-green-600 dark:text-green-400">
            Pickleball
          </Link>
          <nav className="flex items-center gap-5">
            <Link
              href="/venues"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-green-600 dark:hover:text-green-400"
            >
              <Search className="size-4" />
              Tìm sân
            </Link>
            <Link
              href="/ban-do"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-green-600 dark:hover:text-green-400"
            >
              <Map className="size-4" />
              Bản đồ
            </Link>
            <Link
              href="/blog"
              className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-green-600 dark:hover:text-green-400"
            >
              <BookOpen className="size-4" />
              Blog
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          {fullName === null ? (
            <>
              <Link
                href="/login"
                className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-green-600 dark:hover:text-green-400"
              >
                <LogIn className="size-4" />
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="text-sm font-medium text-muted-foreground hover:text-green-600 dark:hover:text-green-400"
              >
                Đăng ký
              </Link>
            </>
          ) : null}
          <Link
            href="/register/owner"
            className={buttonVariants({
              className: "gap-1.5 rounded-full bg-green-600 text-white hover:bg-green-700",
            })}
          >
            <LandPlot className="size-4" />
            Chủ Sân
          </Link>
          {fullName !== null ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex size-8 items-center justify-center rounded-full bg-green-600 text-sm font-medium text-white outline-none hover:bg-green-700 focus-visible:ring-3 focus-visible:ring-ring/50">
                {initial}
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  render={
                    <Link href="/me/bookings">
                      <User className="size-4" />
                      Lịch sử đặt sân
                    </Link>
                  }
                />
                <div className="my-1 h-px bg-border" />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-red-600 data-[highlighted]:bg-red-50 data-[highlighted]:text-red-600 dark:text-red-400 dark:data-[highlighted]:bg-red-950/40 dark:data-[highlighted]:text-red-400"
                >
                  <LogOut className="size-4" />
                  Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </header>
  );
}
