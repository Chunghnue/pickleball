"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { registerSchema, type RegisterInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

export default function RegisterOwnerPage() {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", fullName: "", phone: "" },
  });

  async function onSubmit(values: RegisterInput) {
    const response = await fetch("/api/auth/register/owner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Kiểm tra email của bạn</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Chúng tôi đã gửi link xác thực tới email bạn vừa đăng ký. Sau khi
              xác thực, tài khoản của bạn sẽ chờ admin duyệt trước khi có thể
              đăng nhập.
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  const { errors } = form.formState;

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Đăng ký chủ sân</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Họ tên</Label>
              <Input
                id="fullName"
                aria-invalid={!!errors.fullName}
                {...form.register("fullName")}
              />
              {errors.fullName && (
                <p className="text-sm text-destructive">
                  {errors.fullName.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                aria-invalid={!!errors.email}
                {...form.register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                aria-invalid={!!errors.password}
                {...form.register("password")}
              />
              {errors.password && (
                <p className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              Đăng ký
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Là khách hàng?{" "}
            <Link href="/register" className="underline">
              Đăng ký tại đây
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
