"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Building2, Headset } from "lucide-react";
import { PublicHeader } from "@/components/public-header";
import { PublicFooter } from "@/components/public-footer";
import { cn } from "@/lib/utils";
import { SupportTab } from "./support-tab";
import { PartnerTab } from "./partner-tab";

type TabKey = "ho-tro" | "dang-ky-chu-san";

export default function LienHePage() {
  return (
    <>
      <PublicHeader />
      <Suspense>
        <LienHeContent />
      </Suspense>
      <PublicFooter />
    </>
  );
}

function LienHeContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<TabKey>(
    searchParams.get("tab") === "dang-ky-chu-san" ? "dang-ky-chu-san" : "ho-tro",
  );

  return (
    <main className="flex flex-1 flex-col bg-slate-50 dark:bg-slate-950">
      <section className="w-full bg-gradient-to-r from-neutral-950 via-green-900 to-green-600 px-4 pt-12 pb-10 text-center text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2">
          <h1 className="flex items-center gap-3 text-3xl font-extrabold sm:text-4xl">
            <Headset className="size-7 sm:size-8" />
            Liên hệ & Hợp tác
          </h1>
          <p className="text-white/70">
            Hỗ trợ đặt sân hoặc đăng ký trở thành đối tác chủ sân
          </p>
        </div>
      </section>

      <div className="mx-auto w-full max-w-6xl px-4 pt-6">
        <div className="inline-flex gap-1 rounded-xl bg-slate-100 p-1.5 dark:bg-slate-800/60">
          <button
            type="button"
            onClick={() => setTab("ho-tro")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              tab === "ho-tro"
                ? "bg-white text-green-700 shadow-sm dark:bg-slate-900 dark:text-green-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Headset className="size-4" />
            Hỗ trợ
          </button>
          <button
            type="button"
            onClick={() => setTab("dang-ky-chu-san")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors",
              tab === "dang-ky-chu-san"
                ? "bg-white text-green-700 shadow-sm dark:bg-slate-900 dark:text-green-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Building2 className="size-4" />
            Đăng ký chủ sân
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {tab === "ho-tro" ? <SupportTab /> : <PartnerTab />}
      </div>
    </main>
  );
}
