"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  updateRecurringScheduleSchema,
  type UpdateRecurringScheduleInput,
} from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { DAY_LABELS, formatMoney, minutesBetween, sessionPriceAfterDiscount } from "./pricing-format";
import type { RecurringScheduleListItem } from "./types";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

function valuesFromSchedule(schedule: RecurringScheduleListItem) {
  return {
    pricePerSession: schedule.pricePerSession,
    discountPercent: schedule.discountPercent ?? undefined,
    validTo: schedule.validTo,
    note: schedule.note ?? "",
    autoRenew: schedule.autoRenew,
  };
}

export function RecurringScheduleEditDialog({
  trigger,
  venueId,
  courtName,
  schedule,
  onSaved,
}: {
  trigger: React.ReactElement;
  venueId: string;
  courtName: string;
  schedule: RecurringScheduleListItem;
  onSaved: (schedule: RecurringScheduleListItem) => void;
}) {
  const [open, setOpen] = useState(false);

  const form = useForm<
    z.input<typeof updateRecurringScheduleSchema>,
    unknown,
    UpdateRecurringScheduleInput
  >({
    resolver: zodResolver(updateRecurringScheduleSchema),
    defaultValues: valuesFromSchedule(schedule),
  });

  useEffect(() => {
    if (open) {
      form.reset(valuesFromSchedule(schedule));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { errors } = form.formState;
  const pricePerSession = form.watch("pricePerSession");
  const discountPercent = form.watch("discountPercent");
  const duration = minutesBetween(schedule.startTime, schedule.endTime);

  async function onSubmit(values: UpdateRecurringScheduleInput) {
    const response = await fetch(
      `/api/venues/mine/${venueId}/recurring-schedules/${schedule.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          discountPercent: values.discountPercent ?? undefined,
          note: values.note || undefined,
        }),
      },
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success("Đã lưu thay đổi");
    onSaved({ ...schedule, ...(data as RecurringScheduleListItem) });
    setOpen(false);
  }

  const customerIdDisplay = schedule.customerId ?? schedule.customerContactId ?? "";
  const customerNameDisplay = schedule.customerPhone
    ? `${schedule.customerName} (${schedule.customerPhone})`
    : schedule.customerName;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-gradient-to-r from-violet-600 to-purple-500 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-white">
            <Pencil className="size-5 text-white" />
            Sửa lịch: {schedule.customerName}
          </DialogTitle>
          <DialogClose className="text-white/80 outline-none hover:text-white" aria-label="Đóng">
            <X className="size-5" />
          </DialogClose>
        </div>

        <form
          id={`recurring-schedule-edit-form-${schedule.id}`}
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-6 py-5"
        >
          <div className="grid grid-cols-2 items-start gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={`edit-customer-${schedule.id}`}>
                Tên khách hàng <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`edit-customer-${schedule.id}`}
                value={customerNameDisplay}
                readOnly
                className="cursor-not-allowed bg-muted/40 text-muted-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-customer-id-${schedule.id}`}>ID Khách hàng</Label>
              <Input
                id={`edit-customer-id-${schedule.id}`}
                value={customerIdDisplay}
                readOnly
                className="cursor-not-allowed bg-muted/40 text-muted-foreground"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`edit-court-${schedule.id}`}>
              Sân <span className="text-destructive">*</span>
            </Label>
            <select id={`edit-court-${schedule.id}`} disabled className={SELECT_CLASS}>
              <option>🎾 {courtName}</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={`edit-day-${schedule.id}`}>
                Thứ <span className="text-destructive">*</span>
              </Label>
              <select
                id={`edit-day-${schedule.id}`}
                disabled
                className={SELECT_CLASS}
                value={schedule.dayOfWeek}
              >
                {DAY_LABELS.map((label, day) => (
                  <option key={day} value={day}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-start-${schedule.id}`}>
                Bắt đầu <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`edit-start-${schedule.id}`}
                type="time"
                value={schedule.startTime}
                disabled
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-end-${schedule.id}`}>
                Kết thúc <span className="text-destructive">*</span>
              </Label>
              <Input id={`edit-end-${schedule.id}`} type="time" value={schedule.endTime} disabled />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={`edit-price-${schedule.id}`}>
                Giá/buổi (đ) <span className="text-destructive">*</span>
              </Label>
              <Input
                id={`edit-price-${schedule.id}`}
                type="number"
                step="1000"
                {...form.register("pricePerSession")}
              />
              {errors.pricePerSession && (
                <p className="text-sm text-destructive">{errors.pricePerSession.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-discount-${schedule.id}`}>Giảm %</Label>
              <Input
                id={`edit-discount-${schedule.id}`}
                type="number"
                step="1"
                {...form.register("discountPercent")}
              />
              {errors.discountPercent && (
                <p className="text-sm text-destructive">{errors.discountPercent.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-duration-${schedule.id}`}>Phút/buổi</Label>
              <Input
                id={`edit-duration-${schedule.id}`}
                value={duration ?? ""}
                readOnly
                placeholder="—"
                className="cursor-not-allowed bg-muted/40 text-muted-foreground"
              />
            </div>
          </div>

          {Number(pricePerSession) > 0 && (
            <p className="text-sm text-muted-foreground">
              Giá sau giảm:{" "}
              <span className="font-medium text-foreground">
                {formatMoney(
                  sessionPriceAfterDiscount(
                    Number(pricePerSession),
                    discountPercent ? Number(discountPercent) : null,
                  ),
                )}
              </span>
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={`edit-from-${schedule.id}`}>Từ ngày</Label>
              <Input
                id={`edit-from-${schedule.id}`}
                type="date"
                value={schedule.validFrom}
                disabled
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`edit-to-${schedule.id}`}>
                Đến ngày <span className="text-destructive">*</span>
              </Label>
              <Input id={`edit-to-${schedule.id}`} type="date" {...form.register("validTo")} />
              {errors.validTo && (
                <p className="text-sm text-destructive">{errors.validTo.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`edit-note-${schedule.id}`}>Ghi chú</Label>
            <textarea
              id={`edit-note-${schedule.id}`}
              rows={2}
              placeholder="VD: Đội bóng Anh Tuấn – T3+T5 hàng tuần"
              className="w-full rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none"
              {...form.register("note")}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" {...form.register("autoRenew")} />
            Tự động gia hạn tháng sau
          </label>
        </form>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="rounded-lg border px-4 py-2 text-sm font-medium">Hủy</DialogClose>
          <Button
            type="submit"
            form={`recurring-schedule-edit-form-${schedule.id}`}
            disabled={form.formState.isSubmitting}
            className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
          >
            <Check className="size-4" />
            Cập nhật
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
