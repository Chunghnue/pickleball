"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Clock, Mail, MapPin, MessageCircle, Phone, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supportMessageSchema, type SupportMessageInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

const CHANNELS = [
  { icon: Phone, title: "Hotline", detail: "081 22 88 111 (miễn phí, 7:00–22:00)" },
  { icon: Mail, title: "Email", detail: "support@sanbong.vn (phản hồi trong 2 giờ)" },
  { icon: MessageCircle, title: "Chat", detail: "Qua Zalo/Messenger" },
  { icon: MapPin, title: "Văn phòng", detail: "Tầng 8, 123 Lê Văn Lương, Hà Nội" },
];

const SUPPORT_HOURS = [
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
  "Chủ nhật",
].map((day) => ({ day, hours: "7:00 – 22:00" }));

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
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col gap-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {CHANNELS.map((channel) => (
            <div
              key={channel.title}
              className="flex items-start gap-3 rounded-2xl border bg-card p-4"
            >
              <channel.icon className="mt-0.5 size-5 shrink-0 text-green-600 dark:text-green-400" />
              <div>
                <p className="font-semibold">{channel.title}</p>
                <p className="text-sm text-muted-foreground">{channel.detail}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-2 font-semibold">
            <Clock className="size-4 text-green-600 dark:text-green-400" />
            Giờ hỗ trợ
          </p>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {SUPPORT_HOURS.map((row) => (
                <tr key={row.day} className="border-t first:border-t-0">
                  <td className="py-1.5 text-muted-foreground">{row.day}</td>
                  <td className="py-1.5 text-right font-medium">{row.hours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border bg-card p-4">
          <p className="font-semibold">Câu hỏi thường gặp</p>
          <div className="mt-2 flex flex-col divide-y">
            {FAQS.map((faq) => (
              <details key={faq.question} className="py-2">
                <summary className="cursor-pointer list-none text-sm font-medium">
                  {faq.question}
                </summary>
                <p className="mt-1.5 text-sm text-muted-foreground">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </div>

      <div className="h-fit rounded-2xl border bg-card p-5">
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
            <p className="font-semibold">Gửi tin nhắn hỗ trợ</p>
            <div className="space-y-2">
              <Label htmlFor="fullName">Họ và tên</Label>
              <Input
                id="fullName"
                aria-invalid={!!errors.fullName}
                {...form.register("fullName")}
              />
              {errors.fullName && (
                <p className="text-sm text-destructive">{errors.fullName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Số điện thoại</Label>
              <Input id="phone" aria-invalid={!!errors.phone} {...form.register("phone")} />
              {errors.phone && (
                <p className="text-sm text-destructive">{errors.phone.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                aria-invalid={!!errors.email}
                {...form.register("email")}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Nội dung</Label>
              <textarea
                id="message"
                rows={4}
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
    </div>
  );
}
