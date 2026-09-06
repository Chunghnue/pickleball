import { Eye, Smartphone, UserCheck, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatNumber, formatPercent } from "./page-views-format";
import type { PageViewsSummary } from "./types";

const CARD_STYLES = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  green: "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  pink: "bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400",
} as const;

function MetricCard({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: typeof Eye;
  color: keyof typeof CARD_STYLES;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${CARD_STYLES[color]}`}
        >
          <Icon className="size-5" />
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-xl font-bold">{value}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function PageViewsMetrics({ summary }: { summary: PageViewsSummary }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <MetricCard
        icon={Eye}
        color="blue"
        label="Tổng lượt xem"
        value={formatNumber(summary.currentPeriod.totalViews)}
      />
      <MetricCard
        icon={Users}
        color="green"
        label="Khách unique"
        value={formatNumber(summary.currentPeriod.uniqueVisitors)}
      />
      <MetricCard
        icon={UserCheck}
        color="amber"
        label="Khách đã đăng nhập"
        value={formatNumber(summary.currentPeriod.loggedInViews)}
      />
      <MetricCard
        icon={Smartphone}
        color="pink"
        label="% Mobile"
        value={formatPercent(summary.currentPeriod.mobilePercent)}
      />
    </div>
  );
}
