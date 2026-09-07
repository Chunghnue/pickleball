"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Mail, Music2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newsletterSchema, type NewsletterInput } from "@/lib/schemas";
import { getSubmitErrorMessage } from "@/lib/error-message";

// lucide-react (installed: ^1.33.0) no longer ships brand/logo icons —
// Facebook and Youtube were removed upstream (trademark reasons). These
// inline outlines reproduce the same glyphs the older Feather/lucide
// "facebook" and "youtube" icons used (MIT-licensed design), drawn in the
// same 24x24 stroke style as the rest of this file's lucide icons so they
// still line up visually next to Music2 (kept for TikTok, per plan).
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </svg>
  );
}

// Giá trị do chủ dự án cấp; để "" nếu chưa có → mục tương ứng tự ẩn.
const HOTLINE = "0368 886 999";
const SOCIAL: {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { label: "Facebook", href: "https://www.facebook.com", icon: FacebookIcon },
  { label: "TikTok", href: "https://www.tiktok.com", icon: Music2 },
  { label: "YouTube", href: "https://www.youtube.com", icon: YoutubeIcon },
];

export function PublicFooter() {
  const year = new Date().getFullYear();
  const [subscribed, setSubscribed] = useState(false);
  const socials = SOCIAL.filter((s) => s.href);

  const form = useForm<NewsletterInput>({
    resolver: zodResolver(newsletterSchema),
    defaultValues: { email: "" },
  });
  const { errors } = form.formState;

  async function onSubmit(values: NewsletterInput) {
    const response = await fetch("/api/contact/newsletter-subscribers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(getSubmitErrorMessage(response, data));
      return;
    }
    setSubscribed(true);
    form.reset();
  }

  return (
    <footer className="bg-slate-900 px-4 pt-12 pb-6 text-sm text-slate-400">
      <div className="mx-auto grid w-full max-w-7xl gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {/* Thương hiệu + mạng xã hội */}
        <div className="max-w-xs">
          <p className="text-lg font-bold text-white">
            Pickle<span className="text-green-400">ball</span>
          </p>
          <p className="mt-3">
            Nền tảng đặt sân pickleball trực tuyến. Tìm và đặt sân trống gần
            bạn chỉ trong vài giây.
          </p>
          {socials.length > 0 && (
            <div className="mt-4 flex gap-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex size-9 items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:bg-green-600 hover:text-white"
                >
                  <s.icon className="size-4" />
                </a>
              ))}
            </div>
          )}
        </div>

        {/* Khám phá */}
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
            Khám phá
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <Link href="/venues" className="hover:text-green-400">
              Tìm sân
            </Link>
            <Link href="/ban-do" className="hover:text-green-400">
              Bản đồ
            </Link>
            <Link href="/blog" className="hover:text-green-400">
              Blog
            </Link>
          </div>
        </div>

        {/* Hỗ trợ */}
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
            Hỗ trợ
          </p>
          <div className="mt-3 flex flex-col gap-2">
            <Link href="/lien-he" className="hover:text-green-400">
              Câu hỏi thường gặp
            </Link>
            <Link href="/lien-he" className="hover:text-green-400">
              Hướng dẫn đặt sân
            </Link>
            <Link href="/lien-he" className="hover:text-green-400">
              Liên hệ
            </Link>
            <span className="flex items-center gap-1.5 text-slate-600">
              Chính sách hoàn tiền
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px]">
                Sắp có
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              Điều khoản sử dụng
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px]">
                Sắp có
              </span>
            </span>
          </div>
        </div>

        {/* Đăng ký nhận ưu đãi + liên hệ */}
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-300 uppercase">
            Đăng ký nhận ưu đãi
          </p>
          <p className="mt-3">
            Nhận ngay voucher giảm 20% cho lần đặt sân đầu tiên.
          </p>
          {subscribed ? (
            <p className="mt-3 flex items-center gap-2 text-green-400">
              <Mail className="size-4" />
              Đã đăng ký! Bạn sẽ nhận ưu đãi qua email.
            </p>
          ) : (
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="mt-3 flex flex-col gap-2"
              noValidate
            >
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="Email của bạn"
                  aria-invalid={!!errors.email}
                  className="bg-slate-800 text-white placeholder:text-slate-500"
                  {...form.register("email")}
                />
                <Button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={form.formState.isSubmitting}
                >
                  Đăng ký
                </Button>
              </div>
              {errors.email && (
                <p className="text-sm text-red-400">{errors.email.message}</p>
              )}
            </form>
          )}

          <div className="mt-5 flex flex-col gap-2">
            {HOTLINE && (
              <a
                href={`tel:${HOTLINE.replace(/\s/g, "")}`}
                className="flex items-center gap-2 font-semibold text-white hover:text-green-400"
              >
                <Phone className="size-4" />
                {HOTLINE}
              </a>
            )}
            <Link
              href="/lien-he"
              className="w-fit rounded-full bg-slate-800 px-4 py-1.5 font-medium text-white hover:bg-green-600"
            >
              Liên hệ ngay
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-10 flex w-full max-w-7xl flex-col gap-2 border-t border-slate-800 pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p>© {year} Pickleball. All rights reserved.</p>
        <p>
          Đăng ký chủ sân?{" "}
          <Link
            href="/lien-he?tab=dang-ky-chu-san"
            className="font-medium text-green-400 hover:underline"
          >
            Liên hệ ngay
          </Link>
        </p>
      </div>
    </footer>
  );
}
