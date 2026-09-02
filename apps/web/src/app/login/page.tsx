"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { loginSchema, type LoginInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

const ROLE_HOME: Record<string, string> = {
  customer: "/me",
  owner: "/owner/dashboard",
  admin: "/admin/approvals",
};

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
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Đăng nhập</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="identifier">Email hoặc số điện thoại</Label>
              <Input
                id="identifier"
                type="text"
                aria-invalid={!!errors.identifier}
                {...form.register("identifier")}
              />
              {errors.identifier && (
                <p className="text-sm text-destructive">
                  {errors.identifier.message}
                </p>
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
              Đăng nhập
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Quên mật khẩu?{" "}
            <Link href="/forgot-password" className="underline">
              Đặt lại tại đây
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
