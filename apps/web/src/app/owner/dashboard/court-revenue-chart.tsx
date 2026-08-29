"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { PieChart as PieChartIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CourtRevenueChartProps {
  revenueByCourt: { courtId: string; courtName: string; revenue: number }[];
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");
const COURT_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#0891b2"];

export function CourtRevenueChart({ revenueByCourt }: CourtRevenueChartProps) {
  if (revenueByCourt.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <PieChartIcon className="size-4" />
          Doanh thu theo sân
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={revenueByCourt}
                dataKey="revenue"
                nameKey="courtName"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {revenueByCourt.map((entry, index) => (
                  <Cell
                    key={entry.courtId}
                    fill={COURT_COLORS[index % COURT_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [
                  `${currencyFormatter.format(Number(value))} đ`,
                  "Doanh thu",
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2">
          {revenueByCourt.map((court, index) => (
            <div key={court.courtId} className="flex items-center gap-1.5 text-sm">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: COURT_COLORS[index % COURT_COLORS.length] }}
              />
              <span className="text-muted-foreground">{court.courtName}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
