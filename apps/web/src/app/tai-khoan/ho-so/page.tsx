"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Save, UserPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileSchema, type UpdateProfileInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

interface Profile {
  email: string;
  fullName: string;
  phone: string | null;
  address: string | null;
}

type Tier = "new" | "regular" | "vip";

interface Stats {
  totalBookings: number;
  totalSpent: number;
  tier: Tier;
}

const TIER_LABELS: Record<Tier, string> = {
  new: "NEW",
  regular: "THƯỜNG XUYÊN",
  vip: "VIP",
};

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { fullName: "", address: "" },
  });

  useEffect(() => {
    fetch("/api/users/me")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Ftai-khoan%2Fho-so");
          return null;
        }
        return (await res.json()) as Profile;
      })
      .then((data) => {
        if (!data) return;
        setProfile(data);
        form.reset({
          fullName: data.fullName,
          address: data.address ?? "",
        });
      });
  }, [form, router]);

  useEffect(() => {
    fetch("/api/users/me/stats")
      .then((res) => (res.ok ? (res.json() as Promise<Stats>) : null))
      .then((data) => setStats(data));
  }, []);

  async function onSubmit(values: UpdateProfileInput) {
    const payload = {
      fullName: values.fullName,
      address: values.address,
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

  if (!profile) {
    return <p>Đang tải...</p>;
  }

  const { errors } = form.formState;

  return (
    <div className="space-y-6">
      <h1 className="flex items-center gap-2 text-xl font-bold">
        <UserPen className="size-5 text-green-600 dark:text-green-400" />
        Hồ sơ cá nhân
      </h1>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-green-50 p-4 text-center dark:bg-green-950/30">
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">
            {stats ? stats.totalBookings : "—"}
          </p>
          <p className="text-sm text-muted-foreground">Lần đặt sân</p>
        </div>
        <div className="rounded-xl bg-green-50 p-4 text-center dark:bg-green-950/30">
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">
            {stats ? TIER_LABELS[stats.tier] : "—"}
          </p>
          <p className="text-sm text-muted-foreground">Hạng thành viên</p>
        </div>
        <div className="rounded-xl bg-green-50 p-4 text-center dark:bg-green-950/30">
          <p className="text-2xl font-bold text-green-700 dark:text-green-400">
            {stats ? stats.totalSpent.toLocaleString("vi-VN") : "—"}
          </p>
          <p className="text-sm text-muted-foreground">Tổng chi tiêu (VNĐ)</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Họ và tên</Label>
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
            <Label>Số điện thoại</Label>
            <p className="py-2 text-sm">{profile.phone ?? "—"}</p>
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={profile.email} readOnly />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Địa chỉ</Label>
            <Input
              id="address"
              placeholder="Nhập địa chỉ"
              {...form.register("address")}
            />
          </div>
        </div>
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="rounded-full bg-green-600 px-4 font-semibold text-white hover:bg-green-700"
        >
          <Save className="size-4" />
          Lưu thay đổi
        </Button>
      </form>
    </div>
  );
}
