"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Check, Repeat, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  createRecurringScheduleSchema,
  type CreateRecurringScheduleInput,
} from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { DAY_LABELS, formatMoney, minutesBetween, sessionPriceAfterDiscount } from "./pricing-format";
import { CustomerSelector, type CustomerSelection } from "./customer-selector";
import type { CourtWithVenueName } from "../types";
import type { CreateRecurringScheduleResult } from "./types";

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

function RequiredMark() {
  return <span className="text-destructive">*</span>;
}

function customerIdDisplay(customer: CustomerSelection | null): string {
  if (!customer) return "";
  if ("customerId" in customer.payload) return customer.payload.customerId;
  return customer.payload.customerContactId;
}

function defaultValues(defaultCourtId: string | null) {
  return {
    courtId: defaultCourtId ?? "",
    dayOfWeek: 0,
    startTime: "18:00",
    endTime: "19:00",
    pricePerSession: 0,
    discountPercent: undefined,
    validFrom: "",
    validTo: "",
    note: "",
    autoRenew: false,
  };
}

export function RecurringScheduleFormDialog({
  trigger,
  venueId,
  courtsInVenue,
  defaultCourtId,
  onCreated,
}: {
  trigger: React.ReactElement;
  venueId: string;
  courtsInVenue: CourtWithVenueName[];
  defaultCourtId: string | null;
  onCreated: (result: CreateRecurringScheduleResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState<CustomerSelection | null>(null);

  const form = useForm<
    z.input<typeof createRecurringScheduleSchema>,
    unknown,
    CreateRecurringScheduleInput
  >({
    resolver: zodResolver(createRecurringScheduleSchema),
    defaultValues: defaultValues(defaultCourtId),
  });

  useEffect(() => {
    if (open) {
      form.reset(defaultValues(defaultCourtId));
      setCustomer(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultCourtId]);

  const { errors } = form.formState;
  const pricePerSession = form.watch("pricePerSession");
  const discountPercent = form.watch("discountPercent");
  const startTime = form.watch("startTime");
  const endTime = form.watch("endTime");
  const duration = minutesBetween(startTime, endTime);

  async function onSubmit(values: CreateRecurringScheduleInput) {
    if (!customer) {
      toast.error("Vui lòng chọn khách hàng");
      return;
    }
    const response = await fetch(`/api/venues/mine/${venueId}/recurring-schedules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        discountPercent: values.discountPercent || undefined,
        note: values.note || undefined,
        ...customer.payload,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    const result = data as CreateRecurringScheduleResult;
    if (result.conflictingDates.length > 0) {
      toast.success(
        `Đã tạo lịch, ${result.generatedCount} buổi được sinh, ${result.conflictingDates.length} buổi bị trùng lịch (${result.conflictingDates.join(", ")}) đã bỏ qua`,
      );
    } else {
      toast.success(`Đã tạo lịch cố định, ${result.generatedCount} buổi được sinh`);
    }
    onCreated(result);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg gap-0 overflow-hidden p-0">
        <div className="flex items-center justify-between bg-gradient-to-r from-violet-600 to-purple-500 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-white">
            <Repeat className="size-5 text-white" />
            Thêm lịch cố định
          </DialogTitle>
          <DialogClose className="text-white/80 outline-none hover:text-white" aria-label="Đóng">
            <X className="size-5" />
          </DialogClose>
        </div>

        <form
          id="recurring-schedule-form"
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-6 py-5"
        >
          <div className="grid grid-cols-2 items-start gap-4">
            <div className="space-y-1.5">
              <Label>
                Tên khách hàng <RequiredMark />
              </Label>
              <CustomerSelector value={customer} onChange={setCustomer} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-customer-id">ID Khách hàng</Label>
              <Input
                id="schedule-customer-id"
                value={customerIdDisplay(customer)}
                readOnly
                placeholder="Tự điền khi chọn"
                className="cursor-not-allowed bg-muted/40 text-muted-foreground"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="schedule-court">
              Sân <RequiredMark />
            </Label>
            <select id="schedule-court" className={SELECT_CLASS} {...form.register("courtId")}>
              <option value="" disabled>
                -- Chọn sân --
              </option>
              {courtsInVenue.map((court) => (
                <option key={court.id} value={court.id}>
                  🎾 {court.name}
                </option>
              ))}
            </select>
            {errors.courtId && <p className="text-sm text-destructive">{errors.courtId.message}</p>}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-day">
                Thứ <RequiredMark />
              </Label>
              <select id="schedule-day" className={SELECT_CLASS} {...form.register("dayOfWeek")}>
                {DAY_LABELS.map((label, day) => (
                  <option key={day} value={day}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-start">
                Bắt đầu <RequiredMark />
              </Label>
              <Input id="schedule-start" type="time" {...form.register("startTime")} />
              {errors.startTime && (
                <p className="text-sm text-destructive">{errors.startTime.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-end">
                Kết thúc <RequiredMark />
              </Label>
              <Input id="schedule-end" type="time" {...form.register("endTime")} />
              {errors.endTime && <p className="text-sm text-destructive">{errors.endTime.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="schedule-price">
                Giá/buổi (đ) <RequiredMark />
              </Label>
              <Input id="schedule-price" type="number" step="1000" {...form.register("pricePerSession")} />
              {errors.pricePerSession && (
                <p className="text-sm text-destructive">{errors.pricePerSession.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-discount">Giảm %</Label>
              <Input id="schedule-discount" type="number" step="1" {...form.register("discountPercent")} />
              {errors.discountPercent && (
                <p className="text-sm text-destructive">{errors.discountPercent.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-duration">Phút/buổi</Label>
              <Input
                id="schedule-duration"
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
              <Label htmlFor="schedule-from">
                Từ ngày <RequiredMark />
              </Label>
              <Input id="schedule-from" type="date" {...form.register("validFrom")} />
              {errors.validFrom && (
                <p className="text-sm text-destructive">{errors.validFrom.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="schedule-to">
                Đến ngày <RequiredMark />
              </Label>
              <Input id="schedule-to" type="date" {...form.register("validTo")} />
              {errors.validTo && <p className="text-sm text-destructive">{errors.validTo.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="schedule-note">Ghi chú</Label>
            <textarea
              id="schedule-note"
              rows={2}
              placeholder="VD: Đội bóng Anh Tuấn – T3+T5 hàng tuần"
              className="w-full rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none"
              {...form.register("note")}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" {...form.register("autoRenew")} />
            <Repeat className="size-3.5 text-muted-foreground" />
            Tự động gia hạn tháng sau
          </label>
        </form>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="rounded-lg border px-4 py-2 text-sm font-medium">Hủy</DialogClose>
          <Button
            type="submit"
            form="recurring-schedule-form"
            disabled={form.formState.isSubmitting}
            className="gap-1.5 bg-blue-600 text-white hover:bg-blue-700"
          >
            <Check className="size-4" />
            Lưu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
