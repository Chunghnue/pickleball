"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createVenueSchema, type CreateVenueInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

export default function NewVenuePage() {
  const router = useRouter();
  const form = useForm<CreateVenueInput>({
    resolver: zodResolver(createVenueSchema),
    defaultValues: { name: "", address: "", city: "", description: "" },
  });

  async function onSubmit(values: CreateVenueInput) {
    const response = await fetch("/api/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    toast.success("Đã tạo địa điểm, đang chờ admin duyệt");
    router.push(`/owner/venues/${data.id}`);
  }

  const { errors } = form.formState;

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Thêm sân mới</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Tên địa điểm</Label>
              <Input
                id="name"
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
              <Label htmlFor="description">Mô tả (tuỳ chọn)</Label>
              <Input id="description" {...form.register("description")} />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={form.formState.isSubmitting}
            >
              Tạo địa điểm
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
