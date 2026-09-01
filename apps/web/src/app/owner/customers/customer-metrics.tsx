import { CalendarCheck, Star, Users, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CustomerSummary } from "./types";

const currencyFormatter = new Intl.NumberFormat("vi-VN");

const CARD_STYLES = {
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  amber: "bg-amber-100 text-amber-500 dark:bg-amber-950/40 dark:text-amber-400",
  green: "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  pink: "bg-pink-100 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400",
} as const;

function MetricCard({
  icon: Icon,
  iconFill,
  color,
  label,
  value,
  valueClass,
}: {
  icon: LucideIcon;
  iconFill?: boolean;
  color: keyof typeof CARD_STYLES;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <div
          className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${CARD_STYLES[color]}`}
        >
          <Icon className={`size-5 ${iconFill ? "fill-current" : ""}`} />
        </div>
        <div>
          <p className={`text-2xl font-bold leading-tight ${valueClass ?? ""}`}>{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function CustomerMetrics({ summary }: { summary: CustomerSummary }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <MetricCard icon={Users} color="blue" label="Tổng khách" value={String(summary.totalCustomers)} />
      <MetricCard
        icon={Star}
        iconFill
        color="amber"
        label="Khách VIP"
        value={String(summary.vipCustomers)}
      />
      <MetricCard
        icon={CalendarCheck}
        color="green"
        label="Tổng lượt đặt"
        value={String(summary.totalBookings)}
      />
      <MetricCard
        icon={Wallet}
        color="pink"
        label="Tổng doanh thu"
        value={`${currencyFormatter.format(summary.totalSpent)}đ`}
        valueClass="text-pink-600 dark:text-pink-400"
      />
    </div>
  );
}
