import { Card, CardContent } from "@/components/ui/card";
import { formatNumber, formatPercent } from "./page-views-format";
import type { PageViewsSummary } from "./types";

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className="text-2xl font-bold">{value}</span>
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </CardContent>
    </Card>
  );
}

export function PageViewsMetrics({ summary }: { summary: PageViewsSummary }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <MetricCard
        label="Tổng lượt xem"
        value={formatNumber(summary.currentPeriod.totalViews)}
      />
      <MetricCard
        label="Khách unique"
        value={formatNumber(summary.currentPeriod.uniqueVisitors)}
      />
      <MetricCard
        label="Khách đã đăng nhập"
        value={formatNumber(summary.currentPeriod.loggedInViews)}
      />
      <MetricCard label="% Mobile" value={formatPercent(summary.currentPeriod.mobilePercent)} />
    </div>
  );
}
