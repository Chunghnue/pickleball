import { Card, CardContent } from "@/components/ui/card";
import type { Court } from "./types";

interface CourtMetricsProps {
  courts: Pick<Court, "status">[];
}

export function CourtMetrics({ courts }: CourtMetricsProps) {
  const total = courts.length;
  const active = courts.filter((court) => court.status === "active").length;
  const maintenance = courts.filter((court) => court.status === "maintenance").length;
  const closed = courts.filter((court) => court.status === "closed").length;

  const items = [
    { label: "Tổng sân", value: total },
    { label: "Hoạt động", value: active },
    { label: "Bảo trì", value: maintenance },
    { label: "Tạm đóng", value: closed },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardContent className="flex flex-col gap-1 p-4">
            <span className="text-sm text-muted-foreground">{item.label}</span>
            <span className="text-2xl font-bold">{item.value}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
