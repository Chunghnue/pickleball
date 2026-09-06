"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mail,
  MapPin,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginSchema, type LoginInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

const ROLE_HOME: Record<string, string> = {
  customer: "/tai-khoan/ho-so",
  // Staff accounts (manager/cashier/staff) share the owner's /owner/*
  // section — there's no separate staff area.
  staff: "/owner/dashboard",
  owner: "/owner/dashboard",
  admin: "/admin/approvals",
};

const FEATURES = [
  { icon: CalendarDays, label: "Đặt lịch online, tránh trùng sân" },
  { icon: BarChart3, label: "Báo cáo doanh thu chi tiết" },
  { icon: Users, label: "Quản lý khách & lịch cố định" },
  { icon: MapPin, label: "Hỗ trợ nhiều chi nhánh" },
];

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justLoggedOut = searchParams.get("logout") === "true";
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: "", password: "" },
  });

  async function onSubmit(values: LoginInput) {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    const returnTo = searchParams.get("returnTo");
    router.push(returnTo ?? ROLE_HOME[data.role] ?? "/");
    router.refresh();
  }

  const { errors } = form.formState;

  return (
    <main className="flex min-h-svh flex-1">
      <div className="relative hidden w-1/2 flex-col justify-center overflow-hidden bg-gradient-to-br from-blue-950 via-blue-800 to-blue-500 p-10 text-white lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
              <Trophy className="size-6" />
            </div>
            <div>
              <p className="text-lg leading-tight font-bold">Pickleball</p>
              <p className="text-sm leading-tight text-blue-100">Quản lý sân thể thao</p>
            </div>
          </div>

          <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium">
            <span className="size-1.5 rounded-full bg-green-400" />
            Hệ thống đang hoạt động ổn định
          </div>

          <h1 className="mt-6 text-4xl font-bold leading-tight">
            Quản lý sân thể thao
            <br />
            <span className="bg-gradient-to-r from-cyan-300 to-blue-200 bg-clip-text text-transparent">
              chuyên nghiệp & hiệu quả
            </span>
          </h1>
          <p className="mt-4 max-w-md text-sm text-blue-100">
            Quản lý đặt lịch, khách hàng, doanh thu và bảng giá trên một nền tảng duy nhất — mọi
            lúc, mọi nơi.
          </p>

          <div className="mt-8 grid grid-cols-2 gap-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.label}
                className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-medium backdrop-blur"
              >
                <feature.icon className="size-4 shrink-0" />
                {feature.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col items-center justify-center p-8 lg:w-1/2">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-bold">Chào mừng trở lại 👋</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Đăng nhập để tiếp tục đặt sân và quản lý tài khoản của bạn
          </p>

          {justLoggedOut && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2.5 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-400">
              <CheckCircle2 className="size-4 shrink-0" />
              Bạn đã đăng xuất thành công.
            </div>
          )}

          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Email hoặc số điện thoại</Label>
              <div className="relative">
                <Mail className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="identifier"
                  type="text"
                  className="h-10 pl-9"
                  aria-invalid={!!errors.identifier}
                  {...form.register("identifier")}
                />
              </div>
              {errors.identifier && (
                <p className="text-sm text-destructive">{errors.identifier.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mật khẩu</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  Quên mật khẩu?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="h-10 px-9"
                  aria-invalid={!!errors.password}
                  {...form.register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full gap-2 bg-blue-600 hover:bg-blue-700"
              disabled={form.formState.isSubmitting}
            >
              <LogIn className="size-4" />
              Đăng nhập
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            HOẶC
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="rounded-xl bg-muted/50 p-4 text-center">
            <p className="text-sm text-muted-foreground">Chưa có tài khoản?</p>
            <Link
              href="/register"
              className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/60"
            >
              Đăng ký miễn phí
            </Link>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Bảo mật bởi Pickleball
          </p>
        </div>
      </div>
    </main>
  );
}
