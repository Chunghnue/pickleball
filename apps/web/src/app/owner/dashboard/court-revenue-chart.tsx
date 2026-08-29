"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CourtRevenueChartProps {
  revenueByCourt: { courtId: string; courtName: string; revenue: number }[];
}

const currencyFormatter = new Intl.NumberFormat("vi-VN");

export function CourtRevenueChart({ revenueByCourt }: CourtRevenueChartProps) {
  if (revenueByCourt.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">
          Doanh thu theo sân
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ height: Math.max(revenueByCourt.length * 48, 96) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revenueByCourt} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                type="number"
                tickFormatter={(value: number) => currencyFormatter.format(value)}
              />
              <YAxis type="category" dataKey="courtName" width={100} />
              <Tooltip
                formatter={(value) => [
                  `${currencyFormatter.format(Number(value))} đ`,
                  "Doanh thu",
                ]}
              />
              <Bar dataKey="revenue" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
