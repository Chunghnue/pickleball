"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/schemas";
import { roleLabel } from "../accounts/staff-format";

interface Profile {
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: "owner" | "staff";
  staffRole: "manager" | "cashier" | "staff" | null;
}

export function AccountTab() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const passwordForm = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  useEffect(() => {
    fetch("/api/users/me")
      .then(async (res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner%2Fsettings");
          return null;
        }
        return res.ok ? ((await res.json()) as Profile) : null;
      })
      .then((data) => {
        if (!data) return;
        setProfile(data);
        setFullName(data.fullName);
        setPhone(data.phone ?? "");
      });
  }, [router]);

  async function handleSaveProfile() {
    if (!fullName.trim()) {
      toast.error("Vui lòng nhập họ và tên");
      return;
    }
    setSavingProfile(true);
    const response = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: fullName.trim(), phone: phone.trim() || undefined }),
    });
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fowner%2Fsettings");
      return;
    }
    const data = await response.json().catch(() => null);
    setSavingProfile(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success("Đã lưu thay đổi");
  }

  async function onChangePassword(values: ChangePasswordInput) {
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      }),
    });
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fowner%2Fsettings");
      return;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 400) {
        passwordForm.setError("currentPassword", { message: getSubmitErrorMessage(response, data) });
      } else {
        toast.error(getSubmitErrorMessage(response, data));
      }
      return;
    }
    toast.success("Đã đổi mật khẩu");
    passwordForm.reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (!profile) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }

  const { errors } = passwordForm.formState;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" className="size-14 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
                {profile.fullName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-semibold">{profile.fullName}</p>
              <p className="text-sm text-muted-foreground">{roleLabel(profile)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold">Email</Label>
            <Input value={profile.email} readOnly disabled className="h-9" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">Họ và tên</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="off" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Số điện thoại</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" className="h-9" />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="h-10 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
            >
              Lưu
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h3 className="mb-4 font-semibold">Đổi mật khẩu</h3>
          <form onSubmit={passwordForm.handleSubmit(onChangePassword)} className="flex flex-col gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">Mật khẩu hiện tại</Label>
              <Input
                type="password"
                aria-invalid={!!errors.currentPassword}
                {...passwordForm.register("currentPassword")}
                className="h-9"
              />
              {errors.currentPassword && <p className="text-sm text-destructive">{errors.currentPassword.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="font-semibold">Mật khẩu mới</Label>
                <Input
                  type="password"
                  aria-invalid={!!errors.newPassword}
                  {...passwordForm.register("newPassword")}
                  className="h-9"
                />
                {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="font-semibold">Xác nhận lại</Label>
                <Input
                  type="password"
                  aria-invalid={!!errors.confirmPassword}
                  {...passwordForm.register("confirmPassword")}
                  className="h-9"
                />
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={passwordForm.formState.isSubmitting}
                className="h-10 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
              >
                Lưu
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Button type="button" variant="outline" onClick={handleLogout} className="w-fit">
        Đăng xuất
      </Button>
    </div>
  );
}
