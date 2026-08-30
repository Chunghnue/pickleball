"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Check, Plus, X } from "lucide-react";
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
import { CourtStatusSelect } from "./court-status-select";
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

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

function RequiredMark() {
  return <span className="text-destructive">*</span>;
}

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
  const [pendingImages, setPendingImages] = useState<{ file: File; url: string }[]>([]);

  function addPendingImage(file: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Chỉ chấp nhận ảnh JPG/PNG/WEBP");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Ảnh tối đa 5MB");
      return;
    }
    setPendingImages((previous) => [...previous, { file, url: URL.createObjectURL(file) }]);
  }

  function removePendingImage(index: number) {
    setPendingImages((previous) => {
      const target = previous[index];
      if (target) URL.revokeObjectURL(target.url);
      return previous.filter((_, i) => i !== index);
    });
  }

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

    let savedCourt = data as Court;

    if (!isEdit && pendingImages.length > 0) {
      const uploadedImages: CourtImage[] = [];
      for (const pending of pendingImages) {
        const formData = new FormData();
        formData.append("file", pending.file);
        const uploadResponse = await fetch(
          `/api/venues/mine/${venueId}/courts/${savedCourt.id}/images`,
          { method: "POST", body: formData },
        );
        const uploadData = await uploadResponse.json().catch(() => null);
        if (uploadResponse.ok) {
          uploadedImages.push(uploadData as CourtImage);
        }
      }
      if (uploadedImages.length < pendingImages.length) {
        toast.error(
          `Đã tạo sân nhưng chỉ tải lên được ${uploadedImages.length}/${pendingImages.length} ảnh`,
        );
      }
      savedCourt = { ...savedCourt, images: uploadedImages };
      pendingImages.forEach((pending) => URL.revokeObjectURL(pending.url));
      setPendingImages([]);
    }

    toast.success(isEdit ? "Đã lưu thay đổi" : "Đã thêm sân");
    onSaved(savedCourt);
    if (!isEdit) {
      form.reset();
    }
    setOpen(false);
  }

  const { errors } = form.formState;
  const formId = isEdit ? `court-form-edit-${court!.id}` : "court-form-create";

  return (
    <Dialog open={open} onOpenChange={(next) => setOpen(next)}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg gap-0 p-0">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle className="text-lg font-semibold">
            {isEdit ? "Sửa sân" : "Thêm sân mới"}
          </DialogTitle>
          <DialogClose
            className="text-muted-foreground outline-none hover:text-foreground"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </DialogClose>
        </div>

        <form
          id={formId}
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex max-h-[65vh] flex-col gap-5 overflow-y-auto px-6 py-5"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="court-venue">
                Chi nhánh <RequiredMark />
              </Label>
              <select
                id="court-venue"
                value={venueId}
                onChange={(event) => setVenueId(event.target.value)}
                className={SELECT_CLASS}
              >
                <option value="" disabled>
                  -- Chọn chi nhánh --
                </option>
                {venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="court-name">
                Tên sân <RequiredMark />
              </Label>
              <Input
                id="court-name"
                placeholder="VD: Sân A1"
                aria-invalid={!!errors.name}
                {...form.register("name")}
              />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="court-sport">
              Loại môn thể thao <RequiredMark />
            </Label>
            <select id="court-sport" value="pickleball" disabled className={SELECT_CLASS}>
              <option value="pickleball">Pickleball</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="court-open">
                Giờ mở cửa <RequiredMark />
              </Label>
              <Input id="court-open" type="time" {...form.register("openTime")} />
              {errors.openTime && (
                <p className="text-sm text-destructive">{errors.openTime.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="court-close">
                Giờ đóng cửa <RequiredMark />
              </Label>
              <Input id="court-close" type="time" {...form.register("closeTime")} />
              {errors.closeTime && (
                <p className="text-sm text-destructive">{errors.closeTime.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="court-price">
                Giá/giờ (VNĐ) <RequiredMark />
              </Label>
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
            <div className="space-y-1.5">
              <Label htmlFor="court-slot">
                Độ dài khung giờ (phút) <RequiredMark />
              </Label>
              <Input id="court-slot" type="number" {...form.register("slotDurationMinutes")} />
              {errors.slotDurationMinutes && (
                <p className="text-sm text-destructive">{errors.slotDurationMinutes.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="court-capacity">Sức chứa</Label>
              <Input id="court-capacity" type="number" {...form.register("capacity")} />
              {errors.capacity && (
                <p className="text-sm text-destructive">{errors.capacity.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="court-order">Thứ tự</Label>
              <Input id="court-order" type="number" {...form.register("displayOrder")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="court-status">Trạng thái</Label>
              {isEdit ? (
                <Controller
                  name="status"
                  control={form.control}
                  render={({ field }) => (
                    <CourtStatusSelect
                      id="court-status"
                      value={field.value ?? "active"}
                      onChange={field.onChange}
                    />
                  )}
                />
              ) : (
                <CourtStatusSelect
                  id="court-status"
                  value="active"
                  onChange={() => undefined}
                  disabled
                />
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="court-description">Mô tả sân</Label>
            <textarea
              id="court-description"
              rows={3}
              placeholder="Cỏ nhân tạo, đèn chiếu sáng, sàn gỗ..."
              className="w-full rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none"
              {...form.register("description")}
            />
          </div>

          {isEdit ? (
            <CourtImagesField
              venueId={venueId}
              courtId={court!.id}
              initialImages={court!.images}
            />
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Ảnh sân (tối đa 5MB/ảnh, JPG/PNG/WEBP)</Label>
                <span className="text-xs text-muted-foreground">{pendingImages.length} ảnh</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {pendingImages.map((image, index) => (
                  <div key={image.url} className="relative">
                    <img src={image.url} alt="" className="size-20 rounded-lg object-cover" />
                    <button
                      type="button"
                      onClick={() => removePendingImage(index)}
                      className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground"
                      aria-label="Xóa ảnh"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
                <label className="flex size-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground hover:border-foreground hover:text-foreground">
                  <Plus className="size-5" />
                  <span className="text-xs">Thêm ảnh</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) addPendingImage(file);
                    }}
                    className="hidden"
                  />
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Ảnh sẽ được tải lên ngay sau khi bạn lưu sân.
              </p>
            </div>
          )}
        </form>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="rounded-lg border px-4 py-2 text-sm font-medium">
            Hủy
          </DialogClose>
          <Button
            type="submit"
            form={formId}
            disabled={form.formState.isSubmitting}
            className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
          >
            <Check className="size-4" />
            Lưu sân
          </Button>
        </div>
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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>Ảnh sân (tối đa 5MB/ảnh, JPG/PNG/WEBP)</Label>
        <span className="text-xs text-muted-foreground">{images.length} ảnh</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {images.map((image) => (
          <div key={image.id} className="relative">
            <img src={image.url} alt="" className="size-20 rounded-lg object-cover" />
            <button
              type="button"
              onClick={() => handleRemove(image.id)}
              className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground"
              aria-label="Xóa ảnh"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}
        <label
          className="flex size-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground hover:border-foreground hover:text-foreground"
          aria-disabled={uploading}
        >
          <Plus className="size-5" />
          <span className="text-xs">Thêm ảnh</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}
