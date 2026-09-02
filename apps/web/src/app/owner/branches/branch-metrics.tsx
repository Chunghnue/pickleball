import { Building2, CalendarCheck, LayoutGrid, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "./branch-format";
import type { BranchListItem } from "./types";

const CARD_STYLES = {
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  purple: "bg-purple-100 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400",
  green: "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
} as const;

function MetricCard({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: LucideIcon;
  color: keyof typeof CARD_STYLES;
  label: string;
  value: string;
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
        </div>
      </CardContent>
    </Card>
  );
}

export function BranchMetrics({ items }: { items: BranchListItem[] }) {
  const totalCourts = items.reduce((sum, v) => sum + v.courtsCount, 0);
  const totalBookings = items.reduce((sum, v) => sum + v.bookingsThisMonth, 0);
  const totalRevenue = items.reduce((sum, v) => sum + v.revenueThisMonth, 0);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <MetricCard icon={Building2} color="blue" label="Chi nhánh" value={String(items.length)} />
      <MetricCard icon={LayoutGrid} color="purple" label="Tổng sân" value={String(totalCourts)} />
      <MetricCard
        icon={CalendarCheck}
        color="green"
        label="Booking tháng này"
        value={String(totalBookings)}
      />
      <MetricCard icon={Wallet} color="amber" label="Doanh thu tháng" value={formatMoney(totalRevenue)} />
    </div>
  );
}
