import { Globe, Link2, Search, Share2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "./page-views-format";
import type { PageViewsSummary } from "./types";

const SOURCE_META: Record<string, { label: string; icon: typeof Globe }> = {
  direct: { label: "Truy cập trực tiếp", icon: Link2 },
  social: { label: "Mạng xã hội", icon: Share2 },
  search: { label: "Tìm kiếm", icon: Search },
  referral: { label: "Trang giới thiệu", icon: Globe },
};

export function PageViewsTopSources({
  topSources,
}: {
  topSources: PageViewsSummary["topSources"];
}) {
  const max = Math.max(1, ...topSources.map((s) => s.views));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="size-4" />
          Top nguồn truy cập
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {topSources.length === 0 && (
          <p className="py-2 text-center text-sm text-muted-foreground">Chưa có dữ liệu nguồn.</p>
        )}
        {topSources.map((row) => {
          const meta = SOURCE_META[row.source] ?? { label: row.source, icon: Globe };
          const Icon = meta.icon;
          return (
            <div key={row.source} className="flex items-center gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <Icon className="size-4" />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{meta.label}</span>
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
          );
        })}
      </CardContent>
    </Card>
  );
}
