"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateVenueSchema, type UpdateVenueInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";
import type { Venue } from "../../types";

interface VenueInfoSectionProps {
  venue: Venue;
  onUpdated: (venue: Venue) => void;
}

export function VenueInfoSection({ venue, onUpdated }: VenueInfoSectionProps) {
  const form = useForm<UpdateVenueInput>({
    resolver: zodResolver(updateVenueSchema),
    defaultValues: {
      name: venue.name,
      address: venue.address,
      city: venue.city,
      description: venue.description ?? "",
      phone: venue.phone ?? "",
    },
  });

  async function onSubmit(values: UpdateVenueInput) {
    const response = await fetch(`/api/venues/mine/${venue.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã lưu thay đổi");
    onUpdated({ ...venue, ...(data as Venue) });
  }

  const { errors } = form.formState;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thông tin địa điểm</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {venue.status === "rejected" && (
          <Alert variant="destructive">
            <AlertTitle>Địa điểm này đã bị admin từ chối.</AlertTitle>
          </Alert>
        )}
        {venue.status === "pending_approval" && (
          <Alert>
            <AlertTitle>Địa điểm đang chờ admin duyệt.</AlertTitle>
          </Alert>
        )}
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Tên địa điểm</Label>
            <Input
              id="name"
              aria-invalid={!!errors.name}
              {...form.register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Địa chỉ</Label>
            <Input
              id="address"
              aria-invalid={!!errors.address}
              {...form.register("address")}
            />
            {errors.address && (
              <p className="text-sm text-destructive">
                {errors.address.message}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">Thành phố</Label>
            <Input
              id="city"
              aria-invalid={!!errors.city}
              {...form.register("city")}
            />
            {errors.city && (
              <p className="text-sm text-destructive">{errors.city.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Mô tả</Label>
            <Input id="description" {...form.register("description")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Số điện thoại</Label>
            <Input id="phone" {...form.register("phone")} />
          </div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            Lưu thay đổi
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
