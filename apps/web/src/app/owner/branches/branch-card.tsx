import { Eye, Mail, MapPin, Phone, Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatMoney } from "./branch-format";
import { BranchActions } from "./branch-actions";
import type { BranchListItem } from "./types";

export function BranchCard({ venue, onSaved }: { venue: BranchListItem; onSaved: () => void }) {
  return (
    <Card className={cn(venue.isDefault && "ring-2 ring-green-500")}>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          {venue.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={venue.logoUrl} alt="" className="size-10 shrink-0 rounded-xl object-cover" />
          ) : (
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl text-white",
                venue.isDefault ? "bg-green-500" : "bg-blue-500",
              )}
            >
              {venue.isDefault ? <Star className="size-5" /> : <MapPin className="size-5" />}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{venue.name}</h3>
              {venue.isDefault && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-400">
                  <Star className="size-3" />
                  MẶC ĐỊNH
                </span>
              )}
            </div>
            <p className="truncate text-xs text-muted-foreground">{venue.slug ? `/${venue.slug}` : "Chưa có đường dẫn"}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <p className="text-base font-bold">{venue.courtsCount}</p>
            <p className="text-muted-foreground">SÂN</p>
          </div>
          <div>
            <p className="text-base font-bold">{venue.bookingsThisMonth}</p>
            <p className="text-muted-foreground">BOOKING THÁNG</p>
          </div>
          <div>
            <p className="text-base font-bold text-blue-600 dark:text-blue-400">{formatMoney(venue.revenueThisMonth)}</p>
            <p className="text-muted-foreground">DT THÁNG</p>
          </div>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Eye className="size-3.5" />
          0 LƯỢT XEM 7D
        </p>

        <div className="flex flex-col gap-1.5 border-t pt-3 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            <span className={cn(!venue.address && "italic")}>{venue.address || "Chưa có địa chỉ"}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Phone className="size-3.5 shrink-0" />
            <span className={cn(!venue.phone && "italic")}>{venue.phone || "Chưa có SĐT"}</span>
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
