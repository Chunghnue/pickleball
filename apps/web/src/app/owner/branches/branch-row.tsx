import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, publicUrl } from "./branch-format";
import { BranchActions } from "./branch-actions";
import type { BranchListItem } from "./types";

export function BranchRow({ venue, onSaved }: { venue: BranchListItem; onSaved: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-semibold">{venue.name}</h3>
            {venue.isDefault && (
              <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400">
                MẶC ĐỊNH
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {publicUrl(venue.slug)} · {venue.address || "Chưa có địa chỉ"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-4 text-sm">
          <span>
            <span className="font-semibold">{venue.courtsCount}</span> sân
          </span>
          <span>
            <span className="font-semibold">{venue.bookingsThisMonth}</span> booking
          </span>
          <span className="font-semibold text-blue-600 dark:text-blue-400">
            {formatMoney(venue.revenueThisMonth)}
          </span>
        </div>

        <BranchActions venue={venue} onSaved={onSaved} />
      </CardContent>
    </Card>
  );
}
