import { CheckCircle2, LayoutGrid, Lock, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Court } from "./types";

interface CourtMetricsProps {
  courts: Pick<Court, "status">[];
}

const CARD_STYLES = {
  blue: "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  green: "bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  red: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
} as const;

const VALUE_STYLES = {
  blue: "text-foreground",
  green: "text-green-600 dark:text-green-400",
  amber: "text-amber-600 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
} as const;

function MetricCard({
  icon: Icon,
  color,
  label,
  value,
}: {
  icon: typeof LayoutGrid;
  color: keyof typeof CARD_STYLES;
  label: string;
  value: number;
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
          <p className={`text-2xl font-bold ${VALUE_STYLES[color]}`}>{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function CourtMetrics({ courts }: CourtMetricsProps) {
  const total = courts.length;
  const active = courts.filter((court) => court.status === "active").length;
  const maintenance = courts.filter((court) => court.status === "maintenance").length;
  const closed = courts.filter((court) => court.status === "closed").length;

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <MetricCard icon={LayoutGrid} color="blue" label="Tổng sân" value={total} />
      <MetricCard icon={CheckCircle2} color="green" label="Hoạt động" value={active} />
      <MetricCard icon={Wrench} color="amber" label="Bảo trì" value={maintenance} />
      <MetricCard icon={Lock} color="red" label="Tạm đóng" value={closed} />
    </div>
  );
}
