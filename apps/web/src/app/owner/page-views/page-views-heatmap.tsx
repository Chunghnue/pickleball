import { Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { DAY_LABELS, DISPLAY_ORDER } from "@/app/owner/settings/operating-hours-format";

interface PageViewsHeatmapProps {
  heatmap: { dayOfWeek: number; hour: number; views: number }[];
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function bucketClass(views: number, max: number): string {
  if (views === 0) return "bg-muted/40";
  const ratio = views / max;
  if (ratio <= 0.2) return "bg-blue-100 dark:bg-blue-950/40";
  if (ratio <= 0.4) return "bg-blue-200 dark:bg-blue-900/60";
  if (ratio <= 0.6) return "bg-blue-300 dark:bg-blue-800/70";
  if (ratio <= 0.8) return "bg-blue-500 dark:bg-blue-600";
  return "bg-blue-700 dark:bg-blue-400";
}

export function PageViewsHeatmap({ heatmap }: PageViewsHeatmapProps) {
  const cellByKey = new Map(heatmap.map((c) => [`${c.dayOfWeek}-${c.hour}`, c.views]));
  const max = Math.max(1, ...heatmap.map((c) => c.views));
  const hasViews = heatmap.some((c) => c.views > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Giờ cao điểm</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasViews && (
          <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            Chưa có dữ liệu
          </p>
        )}
        {hasViews && (
          <div className="overflow-x-auto">
            <div
              className="inline-grid items-center gap-[2px]"
              style={{ gridTemplateColumns: "44px repeat(24, 18px)" }}
            >
              <div />
              {HOURS.map((hour) => (
                <div key={hour} className="text-center text-[9px] text-muted-foreground">
                  {hour % 3 === 0 ? hour : ""}
                </div>
              ))}
              {DISPLAY_ORDER.map((dayOfWeek) => (
                <Fragment key={dayOfWeek}>
                  <div className="text-xs text-muted-foreground">{DAY_LABELS[dayOfWeek]}</div>
                  {HOURS.map((hour) => {
                    const views = cellByKey.get(`${dayOfWeek}-${hour}`) ?? 0;
                    return (
                      <div
                        key={hour}
                        title={`${DAY_LABELS[dayOfWeek]} ${hour}:00 — ${views} lượt xem`}
                        className={cn("aspect-square rounded-sm", bucketClass(views, max))}
                      />
                    );
                  })}
                </Fragment>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>Ít</span>
              <span className="size-3 rounded-sm bg-blue-100 dark:bg-blue-950/40" />
              <span className="size-3 rounded-sm bg-blue-200 dark:bg-blue-900/60" />
              <span className="size-3 rounded-sm bg-blue-300 dark:bg-blue-800/70" />
              <span className="size-3 rounded-sm bg-blue-500 dark:bg-blue-600" />
              <span className="size-3 rounded-sm bg-blue-700 dark:bg-blue-400" />
              <span>Nhiều</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
