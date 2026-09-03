"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Check, KeyRound, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  const [saving, setSaving] = useState(false);

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

  async function saveProfile(): Promise<boolean> {
    const response = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: fullName.trim(), phone: phone.trim() || undefined }),
    });
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fowner%2Fsettings");
      return false;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return false;
    }
    return true;
  }

  async function onChangePassword(values: ChangePasswordInput): Promise<boolean> {
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
      return false;
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      if (response.status === 400) {
        passwordForm.setError("currentPassword", { message: getSubmitErrorMessage(response, data) });
      } else {
        toast.error(getSubmitErrorMessage(response, data));
      }
      return false;
    }
    passwordForm.reset({ currentPassword: "", newPassword: "", confirmPassword: "" });
    return true;
  }

  // One "Lưu" button covers both sections, matching the reference. The two
  // backend calls stay separate (PATCH /users/me vs POST /auth/change-password
  // — different auth/validation semantics), this just orchestrates them:
  // profile always saves, password only attempts if the owner actually typed
  // into those fields (they're optional on this combined form).
  async function handleSaveAll() {
    if (!fullName.trim()) {
      toast.error("Vui lòng nhập họ và tên");
      return;
    }
    const { currentPassword, newPassword, confirmPassword } = passwordForm.getValues();
    const attemptingPasswordChange = Boolean(currentPassword || newPassword || confirmPassword);

    setSaving(true);
    const profileOk = await saveProfile();
    if (!profileOk) {
      setSaving(false);
      return;
    }

    if (!attemptingPasswordChange) {
      setSaving(false);
      toast.success("Đã lưu thay đổi");
      return;
    }

    const validPassword = await passwordForm.trigger();
    if (!validPassword) {
      setSaving(false);
      return;
    }
    const passwordOk = await onChangePassword(passwordForm.getValues());
    setSaving(false);
    if (passwordOk) {
      toast.success("Đã lưu thay đổi và đổi mật khẩu");
    }
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Thông tin tài khoản</CardTitle>
        <CardDescription>Cập nhật thông tin cá nhân và mật khẩu</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3.5">
          {profile.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.avatarUrl} alt="" className="size-11 shrink-0 rounded-full object-cover" />
          ) : (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-blue-600 text-base font-semibold text-white">
              {profile.fullName.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-semibold">{profile.fullName}</p>
            <p className="text-sm text-muted-foreground">{roleLabel(profile)}</p>
          </div>
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

        <div className="space-y-1.5">
          <Label className="font-semibold">Email</Label>
          <Input value={profile.email} readOnly disabled className="h-9" />
        </div>

        <div className="flex flex-col gap-4 border-t pt-4">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <KeyRound className="size-4" />
            Đổi mật khẩu
          </h3>
          <div className="grid grid-cols-3 gap-4">
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
              {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            type="button"
            onClick={handleSaveAll}
            disabled={saving}
            className="h-10 gap-1.5 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
          >
            <Check className="size-4" />
            Lưu
          </Button>
          <Button
            type="button"
            onClick={handleLogout}
            className="h-10 gap-1.5 rounded-xl bg-red-600 px-4 font-medium text-white hover:bg-red-700"
          >
            <LogOut className="size-4" />
            Đăng xuất
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
