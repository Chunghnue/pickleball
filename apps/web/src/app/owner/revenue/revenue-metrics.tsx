import { ArrowLeftRight, Receipt, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatChangePercent, formatMoney } from "./revenue-format";
import type { RevenueSummary } from "./types";

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
  badge,
}: {
  icon: typeof Wallet;
  color: keyof typeof CARD_STYLES;
  label: string;
  value: string;
  badge?: { text: string; positive: boolean };
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${CARD_STYLES[color]}`}
        >
          <Icon className="size-5" />
        </div>
        {badge && (
          <span
            className={
              badge.positive
                ? "text-xs font-semibold text-green-600 dark:text-green-400"
                : "text-xs font-semibold text-red-600 dark:text-red-400"
            }
          >
            {badge.text}
          </span>
        )}
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-xl font-bold">{value}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export function RevenueMetrics({ summary }: { summary: RevenueSummary }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <MetricCard
        icon={Wallet}
        color="green"
        label="Doanh thu kỳ này"
        value={formatMoney(summary.currentPeriod.revenue)}
        badge={{
          text: formatChangePercent(summary.changePercent),
          positive: summary.changeAmount >= 0,
        }}
      />
      <MetricCard
        icon={Receipt}
        color="blue"
        label="Số giao dịch"
        value={String(summary.currentPeriod.transactionCount)}
      />
      <MetricCard
        icon={TrendingUp}
        color="amber"
        label="Trung bình/giao dịch"
        value={formatMoney(summary.currentPeriod.avgPerTransaction)}
      />
      <MetricCard
        icon={ArrowLeftRight}
        color="pink"
        label="So kỳ trước"
        value={formatMoney(summary.changeAmount)}
      />
    </div>
  );
}
