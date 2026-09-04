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
    <header className="flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-6">
        <Link href="/" className="text-lg font-bold">
          Pickleball
        </Link>
        <Link
          href="/venues"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Tìm sân
        </Link>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/register/owner"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Đăng ký chủ sân
        </Link>
        {fullName === null ? (
          <>
            <Link
              href="/login"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Đăng nhập
            </Link>
            <Link href="/register" className={buttonVariants({ size: "sm" })}>
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
