"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  CalendarDays,
  Eye,
  EyeOff,
  History,
  Lock,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Trophy,
  User,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerFormSchema, type RegisterFormInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { getPasswordStrength } from "@/lib/password-strength";
import { PasswordStrengthMeter } from "@/components/password-strength-meter";

const FEATURES = [
  { icon: MapPin, label: "Tìm sân theo khu vực" },
  { icon: CalendarDays, label: "Đặt lịch trực tuyến nhanh chóng" },
  { icon: History, label: "Lưu lịch sử đặt sân" },
  { icon: User, label: "Quản lý hồ sơ cá nhân" },
];

export default function RegisterPage() {
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<RegisterFormInput>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { email: "", password: "", confirmPassword: "", fullName: "", phone: "" },
  });
  const password = form.watch("password");
  const strength = useMemo(() => getPasswordStrength(password), [password]);

  async function onSubmit(values: RegisterFormInput) {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        phone: values.phone,
      }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    setSubmitted(true);
  }

  const { errors } = form.formState;

  return (
    <main className="flex min-h-svh flex-1">
      <div className="relative hidden w-1/2 flex-col justify-center overflow-hidden bg-gradient-to-br from-green-950 via-green-800 to-green-500 p-10 text-white lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
              <Trophy className="size-6" />
            </div>
            <div>
              <p className="text-lg leading-tight font-bold">Pickleball</p>
              <p className="text-sm leading-tight text-green-100">Đặt sân thể thao</p>
            </div>
          </div>

          <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium">
            <span className="size-1.5 rounded-full bg-green-300" />
            Đăng ký miễn phí, sử dụng ngay
          </div>

          <h1 className="mt-6 text-4xl font-bold leading-tight">
            Đặt sân thể thao
            <br />
            <span className="bg-gradient-to-r from-lime-300 to-green-200 bg-clip-text text-transparent">
              nhanh chóng & tiện lợi
            </span>
          </h1>
          <p className="mt-4 max-w-md text-sm text-green-100">
            Tìm sân, đặt lịch và theo dõi lịch sử đặt sân của bạn chỉ trong vài bước.
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
          {submitted ? (
            <>
              <h2 className="text-2xl font-bold">Kiểm tra email của bạn</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Chúng tôi đã gửi link xác thực tới email bạn vừa đăng ký.
              </p>
              <Link
                href="/login"
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-green-600 hover:underline dark:text-green-400"
              >
                Quay lại đăng nhập
              </Link>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-400">
                <UserPlus className="size-3.5" />
                TẠO TÀI KHOẢN KHÁCH HÀNG
              </span>
              <h2 className="mt-3 text-2xl font-bold">Tham gia cùng chúng tôi 🎾</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Tạo tài khoản để bắt đầu đặt sân dễ dàng
              </p>

              <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Họ và tên</Label>
                  <div className="relative">
                    <User className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="fullName"
                      className="h-10 pl-9"
                      placeholder="Nguyễn Văn A"
                      aria-invalid={!!errors.fullName}
                      {...form.register("fullName")}
                    />
                  </div>
                  {errors.fullName && (
                    <p className="text-sm text-destructive">{errors.fullName.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Số điện thoại</Label>
                    <div className="relative">
                      <Phone className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="phone"
                        className="h-10 pl-9"
                        placeholder="0901 234 567"
                        aria-invalid={!!errors.phone}
                        {...form.register("phone")}
                      />
                    </div>
                    {errors.phone && (
                      <p className="text-sm text-destructive">{errors.phone.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        className="h-10 pl-9"
                        placeholder="email@example.com"
                        aria-invalid={!!errors.email}
                        {...form.register("email")}
                      />
                    </div>
                    {errors.email && (
                      <p className="text-sm text-destructive">{errors.email.message}</p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Mật khẩu</Label>
                  <div className="relative">
                    <Lock className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      className="h-10 px-9"
                      placeholder="Tối thiểu 8 ký tự"
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
                  <PasswordStrengthMeter strength={strength} />
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
                  <div className="relative">
                    <Lock className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      className="h-10 pl-9"
                      placeholder="Nhập lại mật khẩu"
                      aria-invalid={!!errors.confirmPassword}
                      {...form.register("confirmPassword")}
                    />
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full gap-2 bg-green-600 hover:bg-green-700"
                  disabled={form.formState.isSubmitting}
                >
                  <UserPlus className="size-4" />
                  Đăng ký
                </Button>
              </form>

              <div className="mt-6 rounded-xl bg-muted/50 p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Là chủ sân?{" "}
                  <Link
                    href="/register/owner"
                    className="font-medium text-green-600 hover:underline dark:text-green-400"
                  >
                    Đăng ký tại đây
                  </Link>
                </p>
              </div>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Đã có tài khoản?{" "}
                <Link
                  href="/login"
                  className="font-medium text-green-600 hover:underline dark:text-green-400"
                >
                  Đăng nhập ngay
                </Link>
              </p>
            </>
          )}

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" />
            Bảo mật bởi Pickleball
          </p>
        </div>
      </div>
    </main>
  );
}
