"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { useSettingsVenueId } from "./use-settings-venue-id";
import type { Venue } from "../types";

const ALLOWED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export function VenueInfoTab() {
  const router = useRouter();
  const { venueId, resolved } = useSettingsVenueId();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!venueId) return;
    setVenue(null);
    setLoadError(null);
    fetch(`/api/venues/mine/${venueId}`).then(async (res) => {
      if (res.status === 401) {
        router.push("/login?returnTo=%2Fowner%2Fsettings");
        return;
      }
      const data: Venue | null = res.ok ? await res.json() : null;
      if (!data) {
        setLoadError("Không tải được dữ liệu.");
        return;
      }
      setVenue(data);
      setName(data.name);
      setPhone(data.phone ?? "");
      setAddress(data.address);
      setEmail(data.email ?? "");
      setWebsite(data.website ?? "");
      setDescription(data.description ?? "");
      setLogoUrl(data.logoUrl);
    });
  }, [venueId, router]);

  function validateLogoFile(file: File): boolean {
    if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
      toast.error("Chỉ chấp nhận ảnh JPG/PNG/WEBP");
      return false;
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error("Ảnh tối đa 5MB");
      return false;
    }
    return true;
  }

  async function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !venueId || !validateLogoFile(file)) return;
    setUploadingLogo(true);
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`/api/venues/mine/${venueId}/logo`, {
      method: "POST",
      body: formData,
    });
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fowner%2Fsettings");
      return;
    }
    const data = await response.json().catch(() => null);
    setUploadingLogo(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    setLogoUrl(data.logoUrl as string);
  }

  async function handleSubmit() {
    if (!venueId) return;
    if (!name.trim()) {
      toast.error("Vui lòng nhập tên sân");
      return;
    }
    setSubmitting(true);
    const response = await fetch(`/api/venues/mine/${venueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        email: email.trim() || undefined,
        website: website.trim() || undefined,
        description: description.trim() || undefined,
      }),
    });
    if (response.status === 401) {
      router.push("/login?returnTo=%2Fowner%2Fsettings");
      return;
    }
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success("Đã lưu thay đổi");
  }

  if (!resolved) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }
  if (!venueId) {
    return (
      <p className="text-sm text-muted-foreground">
        Chưa có chi nhánh nào, tạo chi nhánh trước ở mục Chi nhánh.
      </p>
    );
  }
  if (loadError) {
    return <p className="text-sm text-muted-foreground">{loadError}</p>;
  }
  if (!venue) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="space-y-1.5">
          <Label className="font-semibold">Logo</Label>
          <div className="flex flex-wrap items-start gap-3">
            <label
              className="flex size-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-dashed text-center text-muted-foreground hover:border-foreground hover:text-foreground"
              aria-disabled={uploadingLogo}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="size-20 object-cover" />
              ) : (
                <>
                  <Upload className="size-5" />
                  <span className="px-1 text-[10px] leading-tight">Bấm hoặc kéo thả ảnh</span>
                </>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleLogoChange}
                disabled={uploadingLogo}
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <label className="inline-flex h-9 w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium hover:bg-muted">
                <Upload className="size-3.5" />
                Đổi logo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleLogoChange}
                  disabled={uploadingLogo}
                />
              </label>
              <p className="text-xs text-muted-foreground">PNG, JPG, WEBP · tối đa 5MB</p>
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="font-semibold">
            Tên sân <span className="text-destructive">*</span>
          </Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className="h-9" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="font-semibold">Số điện thoại</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-semibold">Email</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className="h-9" />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="font-semibold">Địa chỉ</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" className="h-9" />
        </div>

        <div className="space-y-1.5">
          <Label className="font-semibold">Website</Label>
          <Input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            autoComplete="off"
            placeholder="https://..."
            className="h-9"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="font-semibold">Mô tả</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả chung về cơ sở..."
            rows={3}
            className="w-full resize-none rounded-lg border border-input px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
          >
            Lưu thay đổi
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
