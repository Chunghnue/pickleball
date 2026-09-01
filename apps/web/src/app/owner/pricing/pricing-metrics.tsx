import { Banknote, Repeat, Tag } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatMoney } from "./pricing-format";
import type { PricingSummary } from "./types";

const CARD_STYLES = {
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  purple: "bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
  green: "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400",
} as const;

function MetricCard({
  icon: Icon,
  color,
  label,
  value,
  valueClass,
}: {
  icon: LucideIcon;
  color: keyof typeof CARD_STYLES;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card p-5">
      <div
        className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${CARD_STYLES[color]}`}
      >
        <Icon className="size-5" />
      </div>
      <div>
        <p className={`text-2xl font-bold leading-tight ${valueClass ?? ""}`}>{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function PricingMetrics({ summary }: { summary: PricingSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <MetricCard icon={Tag} color="blue" label="Bảng giá" value={String(summary.pricingRulesCount)} />
      <MetricCard
        icon={Repeat}
        color="purple"
        label="Đặt cố định"
        value={String(summary.activeRecurringSchedulesCount)}
      />
      <MetricCard
        icon={Banknote}
        color="green"
        label="~ Doanh thu cố định/tháng"
        value={formatMoney(summary.estimatedMonthlyRecurringRevenue)}
        valueClass="text-green-600 dark:text-green-400"
      />
    </div>
  );
}
