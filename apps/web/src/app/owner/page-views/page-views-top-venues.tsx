import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "./page-views-format";
import type { PageViewsSummary } from "./types";

export function PageViewsTopVenues({
  topVenues,
}: {
  topVenues: PageViewsSummary["topVenues"];
}) {
  const max = Math.max(1, ...topVenues.map((v) => v.views));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top cơ sở xem nhiều</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {topVenues.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có dữ liệu.</p>
        )}
        {topVenues.map((row, index) => (
          <div key={row.venueId} className="flex items-center gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              {index + 1}
            </span>
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{row.venueName}</span>
                <span className="text-muted-foreground">{formatNumber(row.views)}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${Math.max(4, (row.views / max) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
