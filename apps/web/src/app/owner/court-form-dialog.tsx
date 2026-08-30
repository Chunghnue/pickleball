"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createCourtSchema,
  updateCourtSchema,
  type CreateCourtInput,
  type UpdateCourtInput,
} from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { Court, CourtImage } from "./types";

interface VenueOption {
  id: string;
  name: string;
}

interface CourtFormDialogProps {
  venues: VenueOption[];
  trigger: React.ReactElement;
  onSaved: (court: Court) => void;
  mode: "create";
  defaultVenueId?: string;
}

interface CourtFormDialogEditProps {
  venues: VenueOption[];
  trigger: React.ReactElement;
  onSaved: (court: Court) => void;
  mode: "edit";
  court: Court;
}

const STATUS_OPTIONS: { value: Court["status"]; label: string }[] = [
  { value: "active", label: "Hoạt động" },
  { value: "maintenance", label: "Bảo trì" },
  { value: "closed", label: "Tạm đóng" },
];

export function CourtFormDialog(
  props: CourtFormDialogProps | CourtFormDialogEditProps,
) {
  const { venues, trigger, onSaved, mode } = props;
  const [open, setOpen] = useState(false);
  const isEdit = mode === "edit";
  // Narrow on `props.mode` directly (not the extracted `isEdit`) so TypeScript
  // can prove which union member `props` is in each branch.
  const court = props.mode === "edit" ? props.court : undefined;
  const defaultVenueId = props.mode === "create" ? props.defaultVenueId : undefined;

  const form = useForm<
    z.input<typeof createCourtSchema | typeof updateCourtSchema>,
    unknown,
    CreateCourtInput | UpdateCourtInput
  >({
    resolver: zodResolver(isEdit ? updateCourtSchema : createCourtSchema),
    defaultValues: isEdit
      ? {
          name: court!.name,
          pricePerHour: court!.pricePerHour,
          openTime: court!.openTime.slice(0, 5),
          closeTime: court!.closeTime.slice(0, 5),
          slotDurationMinutes: court!.slotDurationMinutes,
          description: court!.description ?? "",
          capacity: court!.capacity ?? undefined,
          displayOrder: court!.displayOrder,
          status: court!.status,
        }
      : {
          name: "",
          pricePerHour: 0,
          openTime: "08:00",
          closeTime: "20:00",
          slotDurationMinutes: 60,
          capacity: 10,
          displayOrder: 0,
        },
  });
  const [venueId, setVenueId] = useState(
    isEdit ? court!.venueId : defaultVenueId ?? "",
  );

  async function onSubmit(values: CreateCourtInput | UpdateCourtInput) {
    if (!venueId) {
      toast.error("Vui lòng chọn chi nhánh");
      return;
    }
    const url = isEdit
      ? `/api/venues/mine/${venueId}/courts/${court!.id}`
      : `/api/venues/mine/${venueId}/courts`;
    const response = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success(isEdit ? "Đã lưu thay đổi" : "Đã thêm sân");
    onSaved(data as Court);
    if (!isEdit) {
      form.reset();
    }
    setOpen(false);
  }

  const { errors } = form.formState;

  return (
    <Dialog open={open} onOpenChange={(next) => setOpen(next)}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-md">
        <DialogTitle>{isEdit ? "Sửa sân" : "Thêm sân mới"}</DialogTitle>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="mt-4 flex max-h-[70vh] flex-col gap-4 overflow-y-auto"
        >
          <div className="space-y-2">
            <Label htmlFor="court-venue">Chi nhánh</Label>
            <select
              id="court-venue"
              value={venueId}
              onChange={(event) => setVenueId(event.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
            >
              <option value="" disabled>
                Chọn chi nhánh
              </option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="court-name">Tên sân</Label>
            <Input id="court-name" aria-invalid={!!errors.name} {...form.register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="court-price">Giá/giờ (VNĐ)</Label>
            <Input
              id="court-price"
              type="number"
              step="1000"
              aria-invalid={!!errors.pricePerHour}
              {...form.register("pricePerHour")}
            />
            {errors.pricePerHour && (
              <p className="text-sm text-destructive">{errors.pricePerHour.message}</p>
            )}
          </div>
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="court-open">Giờ mở cửa</Label>
              <Input id="court-open" type="time" {...form.register("openTime")} />
              {errors.openTime && (
                <p className="text-sm text-destructive">{errors.openTime.message}</p>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="court-close">Giờ đóng cửa</Label>
              <Input id="court-close" type="time" {...form.register("closeTime")} />
              {errors.closeTime && (
                <p className="text-sm text-destructive">{errors.closeTime.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="court-slot">Độ dài khung giờ (phút)</Label>
            <Input id="court-slot" type="number" {...form.register("slotDurationMinutes")} />
            {errors.slotDurationMinutes && (
              <p className="text-sm text-destructive">{errors.slotDurationMinutes.message}</p>
            )}
          </div>
          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="court-capacity">Sức chứa</Label>
              <Input id="court-capacity" type="number" {...form.register("capacity")} />
              {errors.capacity && (
                <p className="text-sm text-destructive">{errors.capacity.message}</p>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="court-order">Thứ tự</Label>
              <Input id="court-order" type="number" {...form.register("displayOrder")} />
            </div>
          </div>
          {isEdit && (
            <div className="space-y-2">
              <Label htmlFor="court-status">Trạng thái</Label>
              <select
                id="court-status"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
                {...form.register("status")}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="court-description">Mô tả sân</Label>
            <textarea
              id="court-description"
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none"
              {...form.register("description")}
            />
          </div>
          {isEdit && (
            <CourtImagesField
              venueId={venueId}
              courtId={court!.id}
              initialImages={court!.images}
            />
          )}
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose className="rounded-lg border px-2.5 py-1.5 text-sm">
              Hủy
            </DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Lưu sân
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface CourtImagesFieldProps {
  venueId: string;
  courtId: string;
  initialImages: CourtImage[];
}

function CourtImagesField({ venueId, courtId, initialImages }: CourtImagesFieldProps) {
  const [images, setImages] = useState<CourtImage[]>(initialImages ?? []);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(
      `/api/venues/mine/${venueId}/courts/${courtId}/images`,
      { method: "POST", body: formData },
    );
    const data = await response.json().catch(() => null);
    setUploading(false);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    setImages((previous) => [...previous, data as CourtImage]);
    toast.success("Đã thêm ảnh");
  }

  async function handleRemove(imageId: string) {
    const response = await fetch(
      `/api/venues/mine/${venueId}/courts/${courtId}/images/${imageId}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      toast.error("Không thể xoá ảnh, vui lòng thử lại.");
      return;
    }
    setImages((previous) => previous.filter((image) => image.id !== imageId));
  }

  return (
    <div className="space-y-2">
      <Label>Ảnh sân</Label>
      {images.length === 0 && (
        <p className="text-sm text-muted-foreground">Chưa có ảnh nào.</p>
      )}
      <ul className="flex flex-wrap gap-2">
        {images.map((image) => (
          <li key={image.id} className="relative">
            <img src={image.url} alt="" className="size-16 rounded object-cover" />
            <button
              type="button"
              onClick={() => handleRemove(image.id)}
              className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground"
              aria-label="Xóa ảnh"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleUpload}
        disabled={uploading}
      />
    </div>
  );
}
