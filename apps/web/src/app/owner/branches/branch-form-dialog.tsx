"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Check, CirclePlus, Lightbulb, MapPin, MousePointerClick, Pencil, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { BranchListItem } from "./types";

const BranchLocationMap = dynamic(() => import("./branch-location-map"), { ssr: false });

// Phải khớp SLUG_PATTERN ở apps/api/src/courts/slug.util.ts — validate sớm ở
// client, backend vẫn là nguồn sự thật cuối cùng.
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ALLOWED_LOGO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

interface CreateProps {
  mode: "create";
  trigger: React.ReactElement;
  onSaved: () => void;
}
interface EditProps {
  mode: "edit";
  venue: BranchListItem;
  trigger: React.ReactElement;
  onSaved: () => void;
}

export function BranchFormDialog(props: CreateProps | EditProps) {
  const { trigger, onSaved, mode } = props;
  const isEdit = mode === "edit";
  const venue = props.mode === "edit" ? props.venue : undefined;

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [description, setDescription] = useState("");
  const [isHidden, setIsHidden] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(venue?.name ?? "");
    setSlug(venue?.slug ?? "");
    setEmail(venue?.email ?? "");
    setPhone(venue?.phone ?? "");
    setAddress(venue?.address ?? "");
    setCity(venue?.city ?? "");
    setDistrict(venue?.district ?? "");
    setDescription(venue?.description ?? "");
    setIsHidden(venue?.isHidden ?? false);
    setLatitude(venue?.latitude ?? null);
    setLongitude(venue?.longitude ?? null);
    setLogoFile(null);
    setLogoPreviewUrl(venue?.logoUrl ?? null);
  }, [open, venue]);

  const handleMapChange = useCallback((lat: number, lng: number) => {
    setLatitude(lat);
    setLongitude(lng);
  }, []);

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      toast.error("Trình duyệt không hỗ trợ định vị");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
      },
      () => toast.error("Không thể lấy vị trí, vui lòng cho phép truy cập vị trí"),
    );
  }

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

  async function uploadLogoNow(file: File, venueId: string) {
    setUploadingLogo(true);
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`/api/venues/mine/${venueId}/logo`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json().catch(() => null);
    setUploadingLogo(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    setLogoPreviewUrl(data.logoUrl as string);
  }

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !validateLogoFile(file)) return;
    if (isEdit) {
      void uploadLogoNow(file, venue!.id);
    } else {
      setLogoFile(file);
      setLogoPreviewUrl(URL.createObjectURL(file));
    }
  }

  async function handleSubmit() {
    if (!name.trim() || !address.trim() || !city.trim()) {
      toast.error("Vui lòng nhập tên chi nhánh, địa chỉ và tỉnh/thành phố");
      return;
    }
    if (slug.trim() && !SLUG_PATTERN.test(slug.trim())) {
      toast.error("Đường dẫn chỉ được chứa chữ thường, số và dấu gạch ngang");
      return;
    }

    setSubmitting(true);
    const body = {
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      description: description.trim() || undefined,
      slug: slug.trim() || undefined,
      district: district.trim() || undefined,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      ...(isEdit ? { isHidden } : {}),
    };

    const response = await fetch(isEdit ? `/api/venues/mine/${venue!.id}` : "/api/venues", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setSubmitting(false);
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    if (!isEdit && logoFile && data?.id) {
      await uploadLogoNow(logoFile, data.id as string);
    }
    setSubmitting(false);

    toast.success(isEdit ? "Đã cập nhật chi nhánh" : "Đã tạo chi nhánh, đang chờ admin duyệt");
    onSaved();
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-800 to-blue-500 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-white">
            {isEdit ? <Pencil className="size-5 text-white" /> : <CirclePlus className="size-5 text-white" />}
            {isEdit ? "Sửa chi nhánh" : "Thêm chi nhánh"}
          </DialogTitle>
          <DialogClose className="text-white/80 outline-none hover:text-white" aria-label="Đóng">
            <X className="size-5" />
          </DialogClose>
        </div>

        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-6 py-5">
          <div className="space-y-1.5">
            <Label className="font-semibold">Logo chi nhánh</Label>
            <div className="flex flex-wrap items-start gap-3">
              <label
                className="flex size-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-lg border border-dashed text-center text-muted-foreground hover:border-foreground hover:text-foreground"
                aria-disabled={uploadingLogo}
              >
                {logoPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoPreviewUrl} alt="" className="size-20 object-cover" />
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
                  Chọn ảnh
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handleLogoChange}
                    disabled={uploadingLogo}
                  />
                </label>
                <p className="text-xs text-muted-foreground">PNG, JPG, WEBP · tối đa 5MB · vuông 1:1 hiển thị đẹp nhất</p>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold">
              Tên chi nhánh <span className="text-destructive">*</span>
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              placeholder="VD: Sân Quận 1, Chi nhánh Hà Đông..."
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-1">
              <Label className="font-semibold">Đường dẫn (slug)</Label>
              <span className="text-xs text-muted-foreground">
                URL: sanbong.vn/&lt;môn-thể-thao&gt;/
                <span className="font-medium text-blue-600 dark:text-blue-400">tự-sinh-từ-tên</span>
              </span>
            </div>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              autoComplete="off"
              placeholder="vd: san-bong-hai-dang"
              className="h-9 font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Chỉ chữ thường a-z, số 0-9 và dấu &apos;-&apos;. Để trống = tự sinh từ tên.
            </p>
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <Lightbulb className="size-4 shrink-0" />
              <p>
                <span className="font-semibold">Mẹo:</span> chọn slug ngắn gọn, dễ nhớ vì SAU KHI tạo mỗi lần đổi slug bị
                giới hạn (3 lần/180 ngày, cooldown 60 ngày) để giữ SEO.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">Số điện thoại</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="off"
                placeholder="0901 234 567"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Email</Label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="off"
                placeholder="branch@sanbong.vn"
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold">
              Địa chỉ <span className="text-destructive">*</span>
            </Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoComplete="off"
              placeholder="Số 123, đường ABC..."
              className="h-9"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">
                Tỉnh/Thành phố <span className="text-destructive">*</span>
              </Label>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                autoComplete="off"
                placeholder="VD: Hà Nội"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Quận/Huyện</Label>
              <Input
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                autoComplete="off"
                placeholder="VD: Cầu Giấy"
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold">Vị trí trên bản đồ</Label>
            <div className="relative overflow-hidden rounded-lg">
              <div className="pointer-events-none absolute left-3 top-3 z-[1000] flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium shadow-md dark:bg-slate-800">
                <MousePointerClick className="size-3.5" />
                Bấm vào bản đồ để chọn vị trí
              </div>
              <BranchLocationMap latitude={latitude} longitude={longitude} onChange={handleMapChange} />
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="font-semibold">Latitude</Label>
              <Input
                value={latitude !== null ? String(latitude) : ""}
                placeholder="Chưa chọn"
                readOnly
                className="h-9 bg-muted/40"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label className="font-semibold">Longitude</Label>
              <Input
                value={longitude !== null ? String(longitude) : ""}
                placeholder="Chưa chọn"
                readOnly
                className="h-9 bg-muted/40"
              />
            </div>
            <button
              type="button"
              onClick={handleUseMyLocation}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-input px-3 text-sm font-medium hover:bg-muted"
            >
              <MapPin className="size-3.5" />
              Vị trí của tôi
            </button>
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold">Mô tả</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ghi chú về chi nhánh, dịch vụ đặc biệt..."
              rows={3}
              className="w-full resize-none rounded-lg border border-input px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isHidden}
                onChange={(e) => setIsHidden(e.target.checked)}
                className="size-4 rounded border-input"
              />
              Ẩn chi nhánh này khỏi trang đặt sân công khai
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="h-10 rounded-xl border border-input px-4 text-sm font-medium hover:bg-muted">
            Hủy
          </DialogClose>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="h-10 gap-1.5 rounded-xl bg-blue-600 px-4 font-medium text-white hover:bg-blue-700"
          >
            <Check className="size-4" />
            {isEdit ? "Cập nhật" : "Lưu chi nhánh"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
