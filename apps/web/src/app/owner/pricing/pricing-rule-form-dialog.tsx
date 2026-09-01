"use client";

import { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Check, X } from "lucide-react";
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
  createPricingRuleSchema,
  updatePricingRuleSchema,
  type CreatePricingRuleInput,
  type UpdatePricingRuleInput,
} from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";
import { DAY_LABELS } from "./pricing-format";
import type { PricingRule } from "./types";

interface CreateProps {
  mode: "create";
  trigger: React.ReactElement;
  venueId: string;
  courtId: string;
  onSaved: (rule: PricingRule) => void;
}

interface EditProps {
  mode: "edit";
  trigger: React.ReactElement;
  venueId: string;
  courtId: string;
  rule: PricingRule;
  onSaved: (rule: PricingRule) => void;
}

function RequiredMark() {
  return <span className="text-destructive">*</span>;
}

const SELECT_CLASS =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

const EMPTY_VALUES = {
  name: "",
  daysOfWeek: [] as number[],
  startTime: "17:00",
  endTime: "22:00",
  price: undefined,
  priority: undefined,
  advanceBookingHours: undefined,
  advancePrice: undefined,
  validFrom: "",
  validTo: "",
};

function valuesFromRule(rule: PricingRule) {
  return {
    name: rule.name,
    daysOfWeek: rule.daysOfWeek,
    startTime: rule.startTime,
    endTime: rule.endTime,
    price: rule.price,
    priority: rule.priority,
    advanceBookingHours: rule.advanceBookingHours ?? undefined,
    advancePrice: rule.advancePrice ?? undefined,
    validFrom: rule.validFrom ?? "",
    validTo: rule.validTo ?? "",
  };
}

export function PricingRuleFormDialog(props: CreateProps | EditProps) {
  const { trigger, venueId, courtId, onSaved, mode } = props;
  const isEdit = mode === "edit";
  const rule = props.mode === "edit" ? props.rule : undefined;
  const [open, setOpen] = useState(false);

  const form = useForm<
    z.input<typeof createPricingRuleSchema | typeof updatePricingRuleSchema>,
    unknown,
    CreatePricingRuleInput | UpdatePricingRuleInput
  >({
    resolver: zodResolver(isEdit ? updatePricingRuleSchema : createPricingRuleSchema),
    defaultValues: isEdit ? valuesFromRule(rule!) : EMPTY_VALUES,
  });

  useEffect(() => {
    if (open) {
      form.reset(isEdit ? valuesFromRule(rule!) : EMPTY_VALUES);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function onSubmit(values: CreatePricingRuleInput | UpdatePricingRuleInput) {
    const url = isEdit
      ? `/api/venues/mine/${venueId}/courts/${courtId}/pricing-rules/${rule!.id}`
      : `/api/venues/mine/${venueId}/courts/${courtId}/pricing-rules`;
    const response = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        priority: values.priority || undefined,
        advanceBookingHours: values.advanceBookingHours || undefined,
        advancePrice: values.advancePrice || undefined,
        validFrom: values.validFrom || undefined,
        validTo: values.validTo || undefined,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    toast.success(isEdit ? "Đã lưu thay đổi" : "Đã thêm khung giá");
    onSaved(data as PricingRule);
    setOpen(false);
  }

  const { errors } = form.formState;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-w-lg gap-0 p-0">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <DialogTitle className="text-lg font-semibold">
            {isEdit ? "Sửa bảng giá" : "Thêm bảng giá"}
          </DialogTitle>
          <DialogClose
            className="text-muted-foreground outline-none hover:text-foreground"
            aria-label="Đóng"
          >
            <X className="size-5" />
          </DialogClose>
        </div>

        <form
          id={isEdit ? `pricing-rule-form-${rule!.id}` : "pricing-rule-form-create"}
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-6 py-5"
        >
          <div className="space-y-1.5">
            <Label htmlFor="rule-name">
              Tên khung giá <RequiredMark />
            </Label>
            <Input id="rule-name" placeholder="VD: Buổi tối (17h-22h)" {...form.register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>
              Áp dụng ngày <RequiredMark />
            </Label>
            <Controller
              name="daysOfWeek"
              control={form.control}
              render={({ field }) => (
                <div className="flex flex-wrap gap-2">
                  {DAY_LABELS.map((label, day) => {
                    const current = (field.value ?? []) as number[];
                    const checked = current.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() =>
                          field.onChange(
                            checked ? current.filter((d) => d !== day) : [...current, day],
                          )
                        }
                        className={cn(
                          "flex size-9 items-center justify-center rounded-lg border text-sm font-medium",
                          checked
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-input text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            />
            {errors.daysOfWeek && (
              <p className="text-sm text-destructive">{errors.daysOfWeek.message as string}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rule-start">
                Giờ bắt đầu <RequiredMark />
              </Label>
              <Input id="rule-start" type="time" {...form.register("startTime")} />
              {errors.startTime && (
                <p className="text-sm text-destructive">{errors.startTime.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-end">
                Giờ kết thúc <RequiredMark />
              </Label>
              <Input id="rule-end" type="time" {...form.register("endTime")} />
              {errors.endTime && (
                <p className="text-sm text-destructive">{errors.endTime.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rule-price">
                Giá (đ) <RequiredMark />
              </Label>
              <Input
                id="rule-price"
                type="number"
                step="1000"
                placeholder="300000"
                {...form.register("price")}
              />
              {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-unit">Đơn vị</Label>
              <select id="rule-unit" value="hour" disabled className={SELECT_CLASS}>
                <option value="hour">Giờ</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-priority">Ưu tiên</Label>
              <Input id="rule-priority" type="number" {...form.register("priority")} />
              {errors.priority && (
                <p className="text-sm text-destructive">{errors.priority.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="rule-advance-hours">Đặt trước (giờ)</Label>
              <Input
                id="rule-advance-hours"
                type="number"
                placeholder="0"
                {...form.register("advanceBookingHours")}
              />
              {errors.advanceBookingHours && (
                <p className="text-sm text-destructive">{errors.advanceBookingHours.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rule-advance-price">Giá đặt trước (đ)</Label>
              <Input
                id="rule-advance-price"
                type="number"
                step="1000"
                placeholder="0"
                {...form.register("advancePrice")}
              />
              {errors.advancePrice && (
                <p className="text-sm text-destructive">{errors.advancePrice.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              Khoảng áp dụng (tùy chọn – bỏ trống nếu áp dụng mãi mãi)
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="rule-from">Từ ngày</Label>
                <Input id="rule-from" type="date" {...form.register("validFrom")} />
                {errors.validFrom && (
                  <p className="text-sm text-destructive">{errors.validFrom.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-to">Đến ngày</Label>
                <Input id="rule-to" type="date" {...form.register("validTo")} />
                {errors.validTo && (
                  <p className="text-sm text-destructive">{errors.validTo.message}</p>
                )}
              </div>
            </div>
          </div>
        </form>

        <div className="flex justify-end gap-2 border-t px-6 py-4">
          <DialogClose className="rounded-lg border px-4 py-2 text-sm font-medium">Hủy</DialogClose>
          <Button
            type="submit"
            form={isEdit ? `pricing-rule-form-${rule!.id}` : "pricing-rule-form-create"}
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
