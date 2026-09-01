import { CalendarCheck, Crown, Users, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { CustomerSummary } from "./types";

const currencyFormatter = new Intl.NumberFormat("vi-VN");

const CARD_STYLES = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  green: "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  pink: "bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400",
} as const;

function MetricCard({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: typeof Users;
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
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function CustomerMetrics({ summary }: { summary: CustomerSummary }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <MetricCard icon={Users} color="blue" label="Tổng khách" value={String(summary.totalCustomers)} />
      <MetricCard icon={Crown} color="amber" label="Khách VIP" value={String(summary.vipCustomers)} />
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
        value={`${currencyFormatter.format(summary.totalSpent)} đ`}
      />
    </div>
  );
}
