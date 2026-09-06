"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Clock,
  KeyRound,
  Mail,
  MailCheck,
  Send,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/schemas";

const STEPS = [
  {
    title: "Nhập email đăng ký",
    description: "Email bạn đã dùng khi đăng ký tài khoản",
  },
  {
    title: "Kiểm tra hộp thư",
    description: 'Mở email từ Pickleball và bấm vào nút "Đặt lại mật khẩu"',
  },
  {
    title: "Đặt mật khẩu mới",
    description: "Tạo mật khẩu mới và đăng nhập trở lại",
  },
];

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!response.ok) {
      toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      return;
    }

    setSubmitted(true);
  }

  const { errors } = form.formState;

  return (
    <main className="flex min-h-svh flex-1">
      <div className="relative hidden w-1/2 flex-col justify-center overflow-hidden bg-gradient-to-br from-indigo-950 via-purple-800 to-fuchsia-500 p-10 text-white lg:flex">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur">
              <KeyRound className="size-6" />
            </div>
            <div>
              <p className="text-lg leading-tight font-bold">Pickleball</p>
              <p className="text-sm leading-tight text-purple-100">Khôi phục tài khoản</p>
            </div>
          </div>

          <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium">
            <Clock className="size-3.5" />
            Link đặt lại qua email · hiệu lực 1 giờ
          </div>

          <h1 className="mt-6 text-4xl font-bold leading-tight">
            Quên mật khẩu?
            <br />
            <span className="bg-gradient-to-r from-pink-300 to-cyan-200 bg-clip-text text-transparent">
              Đừng lo, chúng tôi sẽ giúp bạn
            </span>
          </h1>
          <p className="mt-4 max-w-md text-sm text-purple-100">
            Chỉ với 3 bước đơn giản, link đặt lại sẽ được gửi đến email của bạn để khôi phục
            tài khoản nhanh chóng.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                className="flex items-start gap-3 rounded-xl bg-white/10 px-4 py-3 backdrop-blur"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">
                  {index + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold">{step.title}</p>
                  <p className="text-xs text-purple-100">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col items-center justify-center p-8 lg:w-1/2">
        <div className="w-full max-w-sm">
          {!submitted && (
            <Link
              href="/login"
              className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-4" />
              Quay lại đăng nhập
            </Link>
          )}

          {submitted ? (
            <>
              <div className="flex size-11 items-center justify-center rounded-xl bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400">
                <MailCheck className="size-6" />
              </div>
              <h2 className="mt-4 text-2xl font-bold">Kiểm tra email của bạn</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-6 w-full"
                onClick={() => setSubmitted(false)}
              >
                Gửi lại / Đổi email
              </Button>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                <Link
                  href="/login"
                  className="font-medium text-purple-600 hover:underline dark:text-purple-400"
                >
                  Quay lại đăng nhập
                </Link>
              </p>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 dark:bg-purple-950/40 dark:text-purple-400">
                <ShieldCheck className="size-3.5" />
                KHÔI PHỤC MẬT KHẨU
              </span>
              <h2 className="mt-3 text-2xl font-bold">Quên mật khẩu? 🔑</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Nhập email đã đăng ký, chúng tôi sẽ gửi link đặt lại mật khẩu cho bạn.
              </p>

              <form onSubmit={form.handleSubmit(onSubmit)} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email đăng ký</Label>
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
                <Button
                  type="submit"
                  className="w-full gap-2 bg-purple-600 hover:bg-purple-700"
                  disabled={form.formState.isSubmitting}
                >
                  <Send className="size-4" />
                  Gửi link đặt lại qua email
                </Button>
              </form>

              <div className="mt-6 rounded-xl bg-muted/50 p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Nhớ ra mật khẩu rồi?{" "}
                  <Link
                    href="/login"
                    className="font-medium text-purple-600 hover:underline dark:text-purple-400"
                  >
                    Đăng nhập ngay
                  </Link>
                </p>
              </div>
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
