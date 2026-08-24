"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createCourtSchema,
  updateCourtSchema,
  type CreateCourtInput,
  type UpdateCourtInput,
} from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { Court } from "./types";

interface CourtsSectionProps {
  venueId: string;
  courts: Court[];
  onCourtsChanged: (courts: Court[]) => void;
}

export function CourtsSection({
  venueId,
  courts,
  onCourtsChanged,
}: CourtsSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Danh sách sân</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {courts.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có sân nào.</p>
        )}
        <div className="flex flex-col gap-4">
          {courts.map((court) => (
            <CourtCard
              key={court.id}
              venueId={venueId}
              court={court}
              onUpdated={(updated) =>
                onCourtsChanged(
                  courts.map((c) => (c.id === updated.id ? updated : c)),
                )
              }
            />
          ))}
        </div>
        <AddCourtForm
          venueId={venueId}
          onCreated={(created) => onCourtsChanged([...courts, created])}
        />
      </CardContent>
    </Card>
  );
}

function CourtCard({
  venueId,
  court,
  onUpdated,
}: {
  venueId: string;
  court: Court;
  onUpdated: (court: Court) => void;
}) {
  const [editing, setEditing] = useState(false);
  const form = useForm<
    z.input<typeof updateCourtSchema>,
    unknown,
    UpdateCourtInput
  >({
    resolver: zodResolver(updateCourtSchema),
    defaultValues: {
      name: court.name,
      pricePerHour: court.pricePerHour,
      openTime: court.openTime.slice(0, 5),
      closeTime: court.closeTime.slice(0, 5),
      slotDurationMinutes: court.slotDurationMinutes,
      isActive: court.isActive,
    },
  });

  async function onSubmit(values: UpdateCourtInput) {
    const response = await fetch(
      `/api/venues/mine/${venueId}/courts/${court.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      },
    );
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã lưu thay đổi");
    onUpdated(data as Court);
    setEditing(false);
  }

  const { errors } = form.formState;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{court.name}</CardTitle>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? "Đóng" : "Sửa"}
        </Button>
      </CardHeader>
      <CardContent>
        {!editing && (
          <p className="text-sm text-muted-foreground">
            {court.pricePerHour.toLocaleString("vi-VN")}đ/giờ ·{" "}
            {court.openTime.slice(0, 5)}–{court.closeTime.slice(0, 5)} ·{" "}
            {court.isActive ? "Đang hoạt động" : "Đã tắt"}
          </p>
        )}
        {editing && (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`name-${court.id}`}>Tên sân</Label>
              <Input
                id={`name-${court.id}`}
                aria-invalid={!!errors.name}
                {...form.register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor={`price-${court.id}`}>Giá/giờ (VNĐ)</Label>
              <Input
                id={`price-${court.id}`}
                type="number"
                step="1000"
                aria-invalid={!!errors.pricePerHour}
                {...form.register("pricePerHour")}
              />
              {errors.pricePerHour && (
                <p className="text-sm text-destructive">
                  {errors.pricePerHour.message}
                </p>
              )}
            </div>
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <Label htmlFor={`open-${court.id}`}>Giờ mở cửa</Label>
                <Input
                  id={`open-${court.id}`}
                  type="time"
                  aria-invalid={!!errors.openTime}
                  {...form.register("openTime")}
                />
                {errors.openTime && (
                  <p className="text-sm text-destructive">
                    {errors.openTime.message}
                  </p>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor={`close-${court.id}`}>Giờ đóng cửa</Label>
                <Input
                  id={`close-${court.id}`}
                  type="time"
                  aria-invalid={!!errors.closeTime}
                  {...form.register("closeTime")}
                />
                {errors.closeTime && (
                  <p className="text-sm text-destructive">
                    {errors.closeTime.message}
                  </p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`slot-${court.id}`}>
                Độ dài khung giờ (phút)
              </Label>
              <Input
                id={`slot-${court.id}`}
                type="number"
                aria-invalid={!!errors.slotDurationMinutes}
                {...form.register("slotDurationMinutes")}
              />
              {errors.slotDurationMinutes && (
                <p className="text-sm text-destructive">
                  {errors.slotDurationMinutes.message}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                id={`active-${court.id}`}
                type="checkbox"
                {...form.register("isActive")}
              />
              <Label htmlFor={`active-${court.id}`}>Đang hoạt động</Label>
            </div>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              Lưu
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function AddCourtForm({
  venueId,
  onCreated,
}: {
  venueId: string;
  onCreated: (court: Court) => void;
}) {
  const defaultValues: CreateCourtInput = {
    name: "",
    pricePerHour: 0,
    openTime: "08:00",
    closeTime: "20:00",
    slotDurationMinutes: 60,
  };
  const form = useForm<
    z.input<typeof createCourtSchema>,
    unknown,
    CreateCourtInput
  >({
    resolver: zodResolver(createCourtSchema),
    defaultValues,
  });

  async function onSubmit(values: CreateCourtInput) {
    const response = await fetch(`/api/venues/mine/${venueId}/courts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã thêm sân");
    onCreated(data as Court);
    form.reset(defaultValues);
  }

  const { errors } = form.formState;

  return (
    <div className="border-t pt-4">
      <h3 className="mb-4 text-sm font-medium">Thêm sân mới</h3>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-court-name">Tên sân</Label>
          <Input
            id="new-court-name"
            aria-invalid={!!errors.name}
            {...form.register("name")}
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-court-price">Giá/giờ (VNĐ)</Label>
          <Input
            id="new-court-price"
            type="number"
            step="1000"
            aria-invalid={!!errors.pricePerHour}
            {...form.register("pricePerHour")}
          />
          {errors.pricePerHour && (
            <p className="text-sm text-destructive">
              {errors.pricePerHour.message}
            </p>
          )}
        </div>
        <div className="flex gap-4">
          <div className="flex-1 space-y-2">
            <Label htmlFor="new-court-open">Giờ mở cửa</Label>
            <Input
              id="new-court-open"
              type="time"
              aria-invalid={!!errors.openTime}
              {...form.register("openTime")}
            />
            {errors.openTime && (
              <p className="text-sm text-destructive">
                {errors.openTime.message}
              </p>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <Label htmlFor="new-court-close">Giờ đóng cửa</Label>
            <Input
              id="new-court-close"
              type="time"
              aria-invalid={!!errors.closeTime}
              {...form.register("closeTime")}
            />
            {errors.closeTime && (
              <p className="text-sm text-destructive">
                {errors.closeTime.message}
              </p>
            )}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-court-slot">Độ dài khung giờ (phút)</Label>
          <Input
            id="new-court-slot"
            type="number"
            aria-invalid={!!errors.slotDurationMinutes}
            {...form.register("slotDurationMinutes")}
          />
          {errors.slotDurationMinutes && (
            <p className="text-sm text-destructive">
              {errors.slotDurationMinutes.message}
            </p>
          )}
        </div>
        <Button type="submit" disabled={form.formState.isSubmitting}>
          Thêm sân
        </Button>
      </form>
    </div>
  );
}
