import { CalendarCheck, MapPin, Users, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardsProps {
  todayBookingsCount: number;
  todayRevenue: number;
  courts: { active: number; total: number };
  newCustomersThisMonth: number;
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

const CARD_STYLES = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  green: "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  pink: "bg-pink-50 text-pink-600 dark:bg-pink-950/40 dark:text-pink-400",
} as const;

function StatCard({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: typeof CalendarCheck;
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

export function StatCards({
  todayBookingsCount,
  todayRevenue,
  courts,
  newCustomersThisMonth,
}: StatCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard
        icon={CalendarCheck}
        color="blue"
        label="Đơn đặt hôm nay"
        value={String(todayBookingsCount)}
      />
      <StatCard
        icon={Wallet}
        color="green"
        label="Doanh thu hôm nay"
        value={`${currencyFormatter.format(todayRevenue)} đ`}
      />
      <StatCard
        icon={MapPin}
        color="amber"
        label="Sân hoạt động"
        value={`${courts.active}/${courts.total}`}
      />
      <StatCard
        icon={Users}
        color="pink"
        label="Khách mới tháng này"
        value={String(newCustomersThisMonth)}
      />
    </div>
  );
}
