"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

interface Profile {
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { fullName: "", phone: "", avatarUrl: "" },
  });

  useEffect(() => {
    fetch("/api/users/me")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fme");
          return null;
        }
        return (await res.json()) as Profile;
      })
      .then((data) => {
        if (!data) return;
        setProfile(data);
        form.reset({
          fullName: data.fullName,
          phone: data.phone ?? "",
          avatarUrl: data.avatarUrl ?? "",
        });
      });
  }, [form, router]);

  async function onSubmit(values: UpdateProfileInput) {
    const payload = {
      fullName: values.fullName,
      phone: values.phone,
      avatarUrl: values.avatarUrl === "" ? undefined : values.avatarUrl,
    };
    const response = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã lưu thay đổi");
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (!profile) {
    return (
      <main className="flex flex-1 items-center justify-center p-8">
        <p>Đang tải...</p>
      </main>
    );
  }

  const { errors } = form.formState;

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Hồ sơ của tôi</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">{profile.email}</p>
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
              <Label htmlFor="phone">Số điện thoại</Label>
              <Input id="phone" {...form.register("phone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="avatarUrl">Ảnh đại diện (URL)</Label>
              <Input
                id="avatarUrl"
                aria-invalid={!!errors.avatarUrl}
                {...form.register("avatarUrl")}
              />
              {errors.avatarUrl && (
                <p className="text-sm text-destructive">
                  {errors.avatarUrl.message}
                </p>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              Lưu thay đổi
            </Button>
          </form>
          <Link
            href="/me/bookings"
            className={`${buttonVariants({ variant: "outline" })} mt-4 w-full`}
          >
            Booking của tôi
          </Link>
          <Button variant="outline" className="mt-2 w-full" onClick={handleLogout}>
            Đăng xuất
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
