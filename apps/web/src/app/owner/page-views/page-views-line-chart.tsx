"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PageViewsLineChartProps {
  viewsByDay: { date: string; views: number; previousViews: number }[];
  exportHref: string;
}

function shortDate(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  return String(value);
}

export function PageViewsLineChart({ viewsByDay, exportHref }: PageViewsLineChartProps) {
  const [compare, setCompare] = useState(false);
  const hasViews = viewsByDay.some((day) => day.views > 0 || day.previousViews > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Diễn biến theo ngày</CardTitle>
        <CardAction className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-blue-600"
              checked={compare}
              onChange={(e) => setCompare(e.target.checked)}
            />
            So sánh kỳ trước
          </label>
          <a
            href={exportHref}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "gap-1.5 border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400 dark:hover:bg-blue-950/60",
            )}
          >
            <Download className="size-3.5" />
            Xuất CSV
          </a>
        </CardAction>
      </CardHeader>
      <CardContent>
        {!hasViews && (
          <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
            Chưa có dữ liệu
          </p>
        )}
        {hasViews && (
          <div style={{ height: 256 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={viewsByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={shortDate} />
                <YAxis tickFormatter={formatCompact} width={40} />
                <Tooltip
                  labelFormatter={(label) => shortDate(String(label))}
                  formatter={(value, name) => [
                    formatCompact(Number(value)),
                    name === "previousViews" ? "Kỳ trước" : "Lượt xem",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="views"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Lượt xem"
                />
                {compare && (
                  <Line
                    type="monotone"
                    dataKey="previousViews"
                    stroke="#94a3b8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    name="Kỳ trước"
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
