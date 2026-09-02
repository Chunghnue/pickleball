"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Check, MapPin, Store, X } from "lucide-react";
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
  }, [open, venue]);

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
    const commonBody = {
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      description: description.trim() || undefined,
      slug: slug.trim() || undefined,
      district: district.trim() || undefined,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      email: email.trim() || undefined,
    };
    const body = isEdit ? { ...commonBody, phone: phone.trim() || undefined, isHidden } : commonBody;

    const response = await fetch(isEdit ? `/api/venues/mine/${venue!.id}` : "/api/venues", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    setSubmitting(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

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
            <Store className="size-5 text-white" />
            {isEdit ? "Sửa chi nhánh" : "Thêm chi nhánh mới"}
          </DialogTitle>
          <DialogClose className="text-white/80 outline-none hover:text-white" aria-label="Đóng">
            <X className="size-5" />
          </DialogClose>
        </div>

        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">
                Tên chi nhánh <span className="text-destructive">*</span>
              </Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Đường dẫn (slug)</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                autoComplete="off"
                placeholder="Để trống để tự sinh"
                className="h-9"
              />
              {isEdit && (
                <p className="text-xs text-muted-foreground">Đổi tối đa 3 lần/180 ngày, cách nhau tối thiểu 60 ngày.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {isEdit && (
              <div className="space-y-1.5">
                <Label className="font-semibold">Số điện thoại</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="off" className="h-9" />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="font-semibold">Email</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className="h-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold">
              Địa chỉ <span className="text-destructive">*</span>
            </Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" className="h-9" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="font-semibold">
                Tỉnh/Thành phố <span className="text-destructive">*</span>
              </Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} autoComplete="off" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="font-semibold">Quận/Huyện</Label>
              <Input value={district} onChange={(e) => setDistrict(e.target.value)} autoComplete="off" className="h-9" />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="font-semibold">Vị trí trên bản đồ</Label>
              <button
                type="button"
                onClick={handleUseMyLocation}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                <MapPin className="size-3.5" />
                Vị trí của tôi
              </button>
            </div>
            <BranchLocationMap
              latitude={latitude}
              longitude={longitude}
              onChange={(lat, lng) => {
                setLatitude(lat);
                setLongitude(lng);
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="font-semibold">Mô tả</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} autoComplete="off" className="h-9" />
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
            {isEdit ? "Cập nhật" : "Tạo chi nhánh"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
