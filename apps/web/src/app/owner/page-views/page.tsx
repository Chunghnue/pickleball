"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ALL_BRANCHES_ID, useBranch } from "@/lib/branch-context";
import { PageViewsFilterBar } from "./page-views-filter-bar";
import { PageViewsMetrics } from "./page-views-metrics";
import { PageViewsLineChart } from "./page-views-line-chart";
import { PageViewsHeatmap } from "./page-views-heatmap";
import { PageViewsConversionTable } from "./page-views-conversion-table";
import { PageViewsTopSources } from "./page-views-top-sources";
import { PageViewsTopVenues } from "./page-views-top-venues";
import { buildPageViewsQuery, defaultDateRange } from "./page-views-format";
import type { DateRange, PageViewsSummary } from "./types";

export default function OwnerPageViewsPage() {
  const router = useRouter();
  const { selectedVenueId } = useBranch();

  const [appliedRange, setAppliedRange] = useState<DateRange>(() => defaultDateRange());
  const [data, setData] = useState<PageViewsSummary | null>(null);
  const [error, setError] = useState(false);

  const venueParam = selectedVenueId === ALL_BRANCHES_ID ? undefined : selectedVenueId;

  const loadReport = useCallback(() => {
    const qs = buildPageViewsQuery({
      venueId: venueParam,
      from: appliedRange.from,
      to: appliedRange.to,
    });
    fetch(`/api/reports/page-views?${qs}`)
      .then((res) => {
        if (res.status === 401) {
          router.push("/login?returnTo=%2Fowner%2Fpage-views");
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

  const exportQs = buildPageViewsQuery({
    venueId: venueParam,
    from: appliedRange.from,
    to: appliedRange.to,
  });

  return (
    <main className="flex w-full flex-1 flex-col gap-6 bg-muted/30 p-8">
      <div>
        <h1 className="text-2xl font-bold">Lượt xem trang</h1>
        <p className="text-sm text-muted-foreground">
          Phân tích lưu lượng truy cập trang đặt sân công khai
        </p>
      </div>

      <PageViewsFilterBar appliedRange={appliedRange} onApply={setAppliedRange} />

      {error && (
        <p className="text-sm text-destructive">Không tải được dữ liệu. Vui lòng thử lại.</p>
      )}

      {data && (
        <>
          <PageViewsMetrics summary={data} />
          <PageViewsLineChart
            viewsByDay={data.viewsByDay}
            exportHref={`/api/reports/page-views/export?${exportQs}`}
          />
          <PageViewsHeatmap heatmap={data.heatmap} />
          <PageViewsConversionTable conversion={data.conversion} />
          <div className="grid gap-4 sm:grid-cols-2">
            <PageViewsTopSources topSources={data.topSources} />
            <PageViewsTopVenues topVenues={data.topVenues} />
          </div>
        </>
      )}
    </main>
  );
}
