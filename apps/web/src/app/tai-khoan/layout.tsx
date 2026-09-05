"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, LogOut, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface Profile {
  fullName: string;
  phone: string | null;
}

const NAV_ITEMS = [
  { href: "/tai-khoan/ho-so", label: "Hồ sơ cá nhân", icon: User },
  { href: "/tai-khoan/lich-su", label: "Lịch sử đặt sân", icon: History },
];

export default function TaiKhoanLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    fetch("/api/users/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setProfile(data));
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8 dark:bg-slate-950">
      <div className="mx-auto flex max-w-5xl gap-6">
        <aside className="h-fit w-64 shrink-0 rounded-2xl bg-white p-6 dark:bg-slate-900">
          <div className="flex flex-col items-center gap-1 text-center">
            <User className="size-9 text-green-600 dark:text-green-400" />
            <p className="font-bold">{profile?.fullName ?? "—"}</p>
            <p className="text-sm text-muted-foreground">
              {profile?.phone ?? "—"}
            </p>
          </div>
          <div className="my-4 h-px bg-border" />
          <nav className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
                    isActive
                      ? "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400"
                      : "text-muted-foreground hover:bg-slate-50 dark:hover:bg-slate-800",
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <LogOut className="size-4" />
              Đăng xuất
            </button>
          </nav>
        </aside>
        <section className="flex-1 rounded-2xl bg-white p-6 dark:bg-slate-900">
          {children}
        </section>
      </div>
    </main>
  );
}
