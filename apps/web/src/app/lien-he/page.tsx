"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LandPlot, LifeBuoy } from "lucide-react";
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
    <main className="flex flex-1 flex-col">
      <section className="bg-gradient-to-br from-green-950 via-green-900 to-emerald-950 px-4 pt-10 pb-8 text-white">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
          <h1 className="text-3xl font-extrabold sm:text-4xl">Liên hệ</h1>
          <p className="text-white/70">
            Hỗ trợ người chơi và đồng hành cùng chủ sân thể thao
          </p>
        </div>
      </section>

      <div className="relative z-10 mx-auto -mt-6 w-full max-w-4xl px-4">
        <div className="flex gap-2 rounded-2xl bg-card p-2 shadow-md ring-1 ring-foreground/10">
          <button
            type="button"
            onClick={() => setTab("ho-tro")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
              tab === "ho-tro"
                ? "bg-green-600 text-white"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <LifeBuoy className="size-4" />
            Hỗ trợ
          </button>
          <button
            type="button"
            onClick={() => setTab("dang-ky-chu-san")}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
              tab === "dang-ky-chu-san"
                ? "bg-green-600 text-white"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            <LandPlot className="size-4" />
            Đăng ký chủ sân
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        {tab === "ho-tro" ? <SupportTab /> : <PartnerTab />}
      </div>
    </main>
  );
}
