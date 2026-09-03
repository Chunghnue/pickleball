"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ALL_BRANCHES_ID, useBranch } from "@/lib/branch-context";
import { RevenueFilterBar } from "./revenue-filter-bar";
import { RevenueMetrics } from "./revenue-metrics";
import { RevenueLineChart } from "./revenue-line-chart";
import { RevenueTransactionsTable } from "./revenue-transactions-table";
import { buildRevenueQuery, defaultDateRange } from "./revenue-format";
import type { DateRange, RevenueSummary } from "./types";

export default function OwnerRevenuePage() {
  const router = useRouter();
  const { selectedVenueId } = useBranch();

  const [appliedRange, setAppliedRange] = useState<DateRange>(() => defaultDateRange());
  const [data, setData] = useState<RevenueSummary | null>(null);
  const [error, setError] = useState(false);

  const venueParam = selectedVenueId === ALL_BRANCHES_ID ? undefined : selectedVenueId;

  const loadReport = useCallback(() => {
    const qs = buildRevenueQuery({
      venueId: venueParam,
      from: appliedRange.from,
      to: appliedRange.to,
    });
    fetch(`/api/reports/revenue?${qs}`)
      .then((res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner%2Frevenue");
          return null;
        }
        if (!res.ok) {
          setError(true);
          return null;
        }
        setError(false);
        return res.json();
      })
      .then((json) => json && setData(json))
      .catch(() => setError(true));
  }, [venueParam, appliedRange, router]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const exportQs = buildRevenueQuery({
    venueId: venueParam,
    from: appliedRange.from,
    to: appliedRange.to,
  });

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Báo cáo doanh thu</h1>
          <p className="text-sm text-muted-foreground">Thống kê tài chính chi tiết</p>
        </div>
        <a
          href={`/api/reports/revenue/export?${exportQs}`}
          className={buttonVariants({ variant: "outline", className: "gap-2" })}
        >
          <Download className="size-4" />
          Xuất báo cáo
        </a>
      </div>

      <RevenueFilterBar appliedRange={appliedRange} onApply={setAppliedRange} />

      {error && (
        <p className="text-sm text-destructive">Không tải được dữ liệu. Vui lòng thử lại.</p>
      )}

      {data && (
        <>
          <RevenueMetrics summary={data} />
          <RevenueLineChart revenueByDay={data.revenueByDay} />
          <RevenueTransactionsTable transactions={data.transactions} />
        </>
      )}
    </main>
  );
}
