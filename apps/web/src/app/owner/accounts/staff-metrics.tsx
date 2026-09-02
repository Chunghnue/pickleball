import { Shield, Users, UsersRound, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AccountRole } from "./types";

const CARD_STYLES = {
  red: "bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400",
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  green: "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  gray: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
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
  value: number;
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

export function StaffMetrics({ counts }: { counts: Record<AccountRole, number> }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <MetricCard icon={Shield} color="red" label="Chủ sân" value={counts.owner} />
      <MetricCard icon={UsersRound} color="blue" label="Quản lý" value={counts.manager} />
      <MetricCard icon={Wallet} color="green" label="Thu ngân" value={counts.cashier} />
      <MetricCard icon={Users} color="gray" label="Nhân viên" value={counts.staff} />
    </div>
  );
}
