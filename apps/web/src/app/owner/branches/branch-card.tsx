import { Mail, MapPin, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney, publicUrl } from "./branch-format";
import { BranchActions } from "./branch-actions";
import type { BranchListItem } from "./types";

export function BranchCard({ venue, onSaved }: { venue: BranchListItem; onSaved: () => void }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{venue.name}</h3>
              {venue.isDefault && (
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400">
                  MẶC ĐỊNH
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{publicUrl(venue.slug)}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2 text-center text-xs">
          <div>
            <p className="font-semibold">{venue.courtsCount}</p>
            <p className="text-muted-foreground">Sân</p>
          </div>
          <div>
            <p className="font-semibold">{venue.bookingsThisMonth}</p>
            <p className="text-muted-foreground">Booking tháng</p>
          </div>
          <div>
            <p className="font-semibold">{formatMoney(venue.revenueThisMonth)}</p>
            <p className="text-muted-foreground">DT tháng</p>
          </div>
        </div>

        <div className="flex flex-col gap-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            {venue.address || "Chưa có địa chỉ"}
          </span>
          <span className="flex items-center gap-1.5">
            <Phone className="size-3.5 shrink-0" />
            {venue.phone || "Chưa có SĐT"}
          </span>
          {venue.email && (
            <span className="flex items-center gap-1.5">
              <Mail className="size-3.5 shrink-0" />
              {venue.email}
            </span>
          )}
        </div>

        <BranchActions venue={venue} onSaved={onSaved} />
      </CardContent>
    </Card>
  );
}
