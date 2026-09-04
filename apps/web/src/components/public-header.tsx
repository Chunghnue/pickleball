"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogOut, User } from "lucide-react";
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
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-xl font-bold text-blue-600 dark:text-blue-400">
          Pickleball
        </Link>
        <Link
          href="/venues"
          className="text-sm font-medium text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400"
        >
          Tìm sân
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/register/owner"
          className={buttonVariants({
            variant: "outline",
            size: "sm",
            className:
              "rounded-full border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/60",
          })}
        >
          Đăng ký chủ sân
        </Link>
        {fullName === null ? (
          <>
            <Link
              href="/login"
              className={buttonVariants({
                variant: "ghost",
                size: "sm",
                className: "hover:text-blue-600 dark:hover:text-blue-400",
              })}
            >
              Đăng nhập
            </Link>
            <Link
              href="/register"
              className={buttonVariants({
                size: "sm",
                className: "bg-blue-600 text-white hover:bg-blue-700",
              })}
            >
              Đăng ký
            </Link>
          </>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger className="flex size-8 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white outline-none hover:bg-blue-700 focus-visible:ring-3 focus-visible:ring-ring/50">
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
        )}
      </div>
    </header>
  );
}
