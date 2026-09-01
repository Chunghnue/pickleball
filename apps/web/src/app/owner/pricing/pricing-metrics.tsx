import { Repeat, Tag, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "./pricing-format";
import type { PricingSummary } from "./types";

const CARD_STYLES = {
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  green: "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  amber: "bg-amber-100 text-amber-500 dark:bg-amber-950/40 dark:text-amber-400",
} as const;

function MetricCard({
  icon: Icon,
  color,
  label,
  value,
  caption,
}: {
  icon: LucideIcon;
  color: keyof typeof CARD_STYLES;
  label: string;
  value: string;
  caption?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${CARD_STYLES[color]}`}
        >
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-2xl font-bold leading-tight">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
          {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function PricingMetrics({ summary }: { summary: PricingSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <MetricCard icon={Tag} color="blue" label="Bảng giá" value={String(summary.pricingRulesCount)} />
      <MetricCard
        icon={Repeat}
        color="green"
        label="Đặt cố định"
        value={String(summary.activeRecurringSchedulesCount)}
      />
      <MetricCard
        icon={TrendingUp}
        color="amber"
        label="Doanh thu cố định/tháng"
        value={formatMoney(summary.estimatedMonthlyRecurringRevenue)}
        caption="Số ước tính"
      />
    </div>
  );
}
