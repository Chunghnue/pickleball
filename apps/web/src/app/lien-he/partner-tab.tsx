"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import {
  BarChart3,
  CalendarClock,
  HeartHandshake,
  LayoutDashboard,
  Rocket,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  partnerApplicationSchema,
  partnerSportTypeValues,
  type PartnerApplicationInput,
} from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

const BENEFITS = [
  { icon: TrendingUp, label: "Tiếp cận hàng ngàn khách hàng đặt sân mỗi ngày" },
  { icon: CalendarClock, label: "Quản lý lịch đặt sân, doanh thu trực tuyến 24/7" },
  { icon: BarChart3, label: "Giảm tình trạng sân trống, tăng doanh thu đến 40%" },
  { icon: HeartHandshake, label: "Hỗ trợ kỹ thuật và vận hành miễn phí" },
  { icon: LayoutDashboard, label: "Có Dashboard quản lý chuyên nghiệp trên SanBong App" },
];

const SPORT_TYPE_LABELS: Record<(typeof partnerSportTypeValues)[number], string> = {
  "bong-da": "Bóng đá",
  tennis: "Tennis",
  "cau-long": "Cầu lông",
  pickleball: "Pickleball",
  "bong-ban": "Bóng bàn",
  "bong-ro": "Bóng rổ",
  khac: "Khác",
};

interface Province {
  code: number;
  name: string;
}

interface Ward {
  code: number;
  name: string;
}

export function PartnerTab() {
  const [submitted, setSubmitted] = useState(false);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [provinceCode, setProvinceCode] = useState("");
  const [wardCode, setWardCode] = useState("");

  const form = useForm<
    z.input<typeof partnerApplicationSchema>,
    unknown,
    PartnerApplicationInput
  >({
    resolver: zodResolver(partnerApplicationSchema),
    defaultValues: {
      ownerFullName: "",
      ownerPhone: "",
      ownerEmail: "",
      venueName: "",
      address: "",
      province: "",
      ward: "",
      sportTypes: [],
      courtCount: 1,
      website: "",
      note: "",
    },
  });
  const { errors } = form.formState;
  const sportTypes = form.watch("sportTypes");

  useEffect(() => {
    fetch("/api/locations/provinces")
      .then((res) => res.json())
      .then((data) => setProvinces(Array.isArray(data) ? data : []))
      .catch(() => {
        toast.error("Không tải được danh sách tỉnh/thành phố, vui lòng thử lại.");
      });
  }, []);

  async function handleProvinceChange(code: string) {
    setProvinceCode(code);
    setWardCode("");
    setWards([]);
    form.setValue("ward", "");
    const province = provinces.find((p) => String(p.code) === code);
    form.setValue("province", province?.name ?? "", { shouldValidate: true });
    if (!code) return;

    try {
      const response = await fetch(`/api/locations/provinces/${code}`);
      const data = await response.json();
      setWards(Array.isArray(data?.wards) ? data.wards : []);
    } catch {
      toast.error("Không tải được danh sách phường/xã, vui lòng thử lại.");
      setWards([]);
    }
  }

  function handleWardChange(code: string) {
    setWardCode(code);
    const ward = wards.find((w) => String(w.code) === code);
    form.setValue("ward", ward?.name ?? "");
  }

  function toggleSportType(value: (typeof partnerSportTypeValues)[number]) {
    const next = sportTypes.includes(value)
      ? sportTypes.filter((v) => v !== value)
      : [...sportTypes, value];
    form.setValue("sportTypes", next, { shouldValidate: true });
  }

  async function onSubmit(values: PartnerApplicationInput) {
    const response = await fetch("/api/contact/partner-applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        ward: values.ward || undefined,
        website: values.website || undefined,
        note: values.note || undefined,
      }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border bg-card py-12 text-center">
        <Rocket className="size-9 text-green-600 dark:text-green-400" />
        <p className="text-lg font-semibold">Đã gửi đăng ký!</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Đội ngũ SanBong.vn sẽ liên hệ và kích hoạt tài khoản quản lý cho bạn trong thời
          gian sớm nhất.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-3">
        {BENEFITS.map((benefit) => (
          <div
            key={benefit.label}
            className="flex items-start gap-3 rounded-2xl border bg-card p-4"
          >
            <benefit.icon className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-400" />
            <p className="text-sm font-medium">{benefit.label}</p>
          </div>
        ))}
      </div>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5 rounded-2xl border bg-card p-5"
      >
        <div className="flex flex-col gap-3">
          <p className="font-semibold">Thông tin chủ sân</p>
          <div className="space-y-2">
            <Label htmlFor="ownerFullName">Họ tên chủ sân</Label>
            <Input
              id="ownerFullName"
              aria-invalid={!!errors.ownerFullName}
              {...form.register("ownerFullName")}
            />
            {errors.ownerFullName && (
              <p className="text-sm text-destructive">{errors.ownerFullName.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="ownerPhone">Số điện thoại</Label>
              <Input
                id="ownerPhone"
                aria-invalid={!!errors.ownerPhone}
                {...form.register("ownerPhone")}
              />
              {errors.ownerPhone && (
                <p className="text-sm text-destructive">{errors.ownerPhone.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerEmail">Email</Label>
              <Input
                id="ownerEmail"
                type="email"
                aria-invalid={!!errors.ownerEmail}
                {...form.register("ownerEmail")}
              />
              {errors.ownerEmail && (
                <p className="text-sm text-destructive">{errors.ownerEmail.message}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4">
          <p className="font-semibold">Thông tin cơ sở</p>
          <div className="space-y-2">
            <Label htmlFor="venueName">Tên cơ sở</Label>
            <Input
              id="venueName"
              aria-invalid={!!errors.venueName}
              {...form.register("venueName")}
            />
            {errors.venueName && (
              <p className="text-sm text-destructive">{errors.venueName.message}</p>
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
              <p className="text-sm text-destructive">{errors.address.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="province">Tỉnh/Thành phố</Label>
              <select
                id="province"
                value={provinceCode}
                onChange={(event) => handleProvinceChange(event.target.value)}
                className="h-9 w-full rounded-lg border px-2.5 text-sm"
              >
                <option value="">Chọn tỉnh/thành phố</option>
                {provinces.map((province) => (
                  <option key={province.code} value={province.code}>
                    {province.name}
                  </option>
                ))}
              </select>
              {errors.province && (
                <p className="text-sm text-destructive">{errors.province.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ward">Phường/Xã</Label>
              <select
                id="ward"
                value={wardCode}
                onChange={(event) => handleWardChange(event.target.value)}
                disabled={!provinceCode}
                className="h-9 w-full rounded-lg border px-2.5 text-sm disabled:opacity-50"
              >
                <option value="">Chọn phường/xã</option>
                {wards.map((ward) => (
                  <option key={ward.code} value={ward.code}>
                    {ward.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t pt-4">
          <p className="font-semibold">Thông tin sân</p>
          <div className="space-y-2">
            <Label>Loại sân</Label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {partnerSportTypeValues.map((value) => (
                <label key={value} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={sportTypes.includes(value)}
                    onChange={() => toggleSportType(value)}
                    className="size-4 rounded border-input"
                  />
                  {SPORT_TYPE_LABELS[value]}
                </label>
              ))}
            </div>
            {errors.sportTypes && (
              <p className="text-sm text-destructive">{errors.sportTypes.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="courtCount">Số lượng sân</Label>
            <Input
              id="courtCount"
              type="number"
              min={1}
              aria-invalid={!!errors.courtCount}
              {...form.register("courtCount")}
            />
            {errors.courtCount && (
              <p className="text-sm text-destructive">{errors.courtCount.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website/Facebook (tuỳ chọn)</Label>
            <Input id="website" {...form.register("website")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">Ghi chú thêm</Label>
            <textarea
              id="note"
              rows={3}
              className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:border-neutral-700 dark:bg-neutral-800/50"
              {...form.register("note")}
            />
          </div>
        </div>

        <Button
          type="submit"
          className="gap-2 bg-green-600 hover:bg-green-700"
          disabled={form.formState.isSubmitting}
        >
          <Rocket className="size-4" />
          Gửi đăng ký
        </Button>
      </form>
    </div>
  );
}
