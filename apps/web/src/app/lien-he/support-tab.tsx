"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ChevronRight,
  Clock,
  HelpCircle,
  Mail,
  MapPin,
  MessagesSquare,
  Phone,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supportMessageSchema, type SupportMessageInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";
import { cn } from "@/lib/utils";

const CARD_CLASS =
  "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900";

const CHANNELS = [
  { icon: Phone, title: "Hotline", value: "081 22 88 111", detail: "Miễn phí, 7:00–22:00" },
  { icon: Mail, title: "Email", value: "support@sanbong.vn", detail: "Phản hồi trong 2 giờ" },
  { icon: MessagesSquare, title: "Chat", value: "Zalo / Messenger", detail: "Chat trực tiếp ngay" },
  { icon: MapPin, title: "Văn phòng", value: "Tầng 8, 123 Lê Văn Lương", detail: "Hà Nội" },
];

const SUPPORT_HOURS = [
  { label: "Thứ 2 - 6", hours: "08:00 – 22:00" },
  { label: "Thứ 7", hours: "08:00 – 21:00" },
  { label: "Chủ nhật", hours: "09:00 – 18:00" },
];

const FAQS = [
  {
    question: "Tôi có thể hủy đặt sân không?",
    answer:
      "Có. Vào mục Lịch sử đặt sân trong tài khoản của bạn để hủy lịch trước giờ nhận sân, theo chính sách hủy của từng cơ sở.",
  },
  {
    question: "Thanh toán có an toàn không?",
    answer:
      "Mọi giao dịch trên SanBong.vn được xử lý qua cổng thanh toán uy tín và mã hóa, đảm bảo an toàn cho khách hàng.",
  },
  {
    question: "Làm sao để đăng ký sân?",
    answer:
      'Chủ sân điền form ở tab "Đăng ký chủ sân" bên cạnh — đội ngũ SanBong.vn sẽ liên hệ và kích hoạt tài khoản quản lý.',
  },
];

export function SupportTab() {
  const [submitted, setSubmitted] = useState(false);
  const form = useForm<SupportMessageInput>({
    resolver: zodResolver(supportMessageSchema),
    defaultValues: { fullName: "", phone: "", email: "", message: "" },
  });
  const { errors } = form.formState;

  async function onSubmit(values: SupportMessageInput) {
    const response = await fetch("/api/contact/support-messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, email: values.email || undefined }),
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }

    setSubmitted(true);
    form.reset();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {CHANNELS.map((channel) => (
          <div key={channel.title} className={cn(CARD_CLASS, "flex flex-col items-center gap-1 text-center")}>
            <channel.icon className="size-6 text-green-600 dark:text-green-400" />
            <p className="mt-1 font-semibold">{channel.title}</p>
            <p className="font-semibold text-green-700 dark:text-green-400">{channel.value}</p>
            <p className="text-sm text-muted-foreground">{channel.detail}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className={cn(CARD_CLASS, "lg:col-span-2")}>
          {submitted ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Send className="size-8 text-green-600 dark:text-green-400" />
              <p className="font-semibold">Đã gửi tin nhắn!</p>
              <p className="text-sm text-muted-foreground">
                Đội ngũ hỗ trợ sẽ phản hồi bạn trong thời gian sớm nhất.
              </p>
              <Button type="button" variant="outline" onClick={() => setSubmitted(false)}>
                Gửi tin nhắn khác
              </Button>
            </div>
          ) : (
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
              <div>
                <p className="flex items-center gap-2 font-semibold">
                  <Send className="size-4 text-green-600 dark:text-green-400" />
                  Gửi tin nhắn
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Mô tả vấn đề bạn cần hỗ trợ, chúng tôi sẽ phản hồi sớm nhất
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">
                    Họ và tên <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="fullName"
                    placeholder="Nguyễn Văn A"
                    aria-invalid={!!errors.fullName}
                    {...form.register("fullName")}
                  />
                  {errors.fullName && (
                    <p className="text-sm text-destructive">{errors.fullName.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">
                    Số điện thoại <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="phone"
                    placeholder="0901234567"
                    aria-invalid={!!errors.phone}
                    {...form.register("phone")}
                  />
                  {errors.phone && (
                    <p className="text-sm text-destructive">{errors.phone.message}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="email@example.com"
                  aria-invalid={!!errors.email}
                  {...form.register("email")}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="message">
                  Nội dung <span className="text-destructive">*</span>
                </Label>
                <textarea
                  id="message"
                  rows={4}
                  placeholder="Mô tả chi tiết vấn đề cần hỗ trợ..."
                  className="w-full resize-y rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:border-neutral-700 dark:bg-neutral-800/50"
                  aria-invalid={!!errors.message}
                  {...form.register("message")}
                />
                {errors.message && (
                  <p className="text-sm text-destructive">{errors.message.message}</p>
                )}
              </div>
              <Button
                type="submit"
                className="gap-2 bg-green-600 hover:bg-green-700"
                disabled={form.formState.isSubmitting}
              >
                <Send className="size-4" />
                Gửi tin nhắn
              </Button>
            </form>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <div className={CARD_CLASS}>
            <p className="flex items-center gap-2 font-semibold">
              <Clock className="size-4 text-green-600 dark:text-green-400" />
              Giờ hỗ trợ
            </p>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              {SUPPORT_HOURS.map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span>{row.label}</span>
                  <span className="font-semibold">{row.hours}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={CARD_CLASS}>
            <p className="flex items-center gap-2 font-semibold">
              <HelpCircle className="size-4 text-green-600 dark:text-green-400" />
              FAQ
            </p>
            <div className="mt-2 flex flex-col">
              {FAQS.map((faq) => (
                <details key={faq.question} className="group py-1.5">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium marker:content-none">
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                    {faq.question}
                  </summary>
                  <p className="mt-1.5 pl-6 text-sm text-muted-foreground">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
