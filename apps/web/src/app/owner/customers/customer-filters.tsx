import { Search, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CustomerTier } from "./types";

const TABS: { value: CustomerTier | "all"; label: string; icon?: LucideIcon; iconClass?: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "vip", label: "VIP", icon: Star, iconClass: "fill-amber-400 text-amber-400" },
  { value: "regular", label: "Thường xuyên" },
  { value: "new", label: "Mới" },
];

export function CustomerFilters({
  tier,
  search,
  onTierChange,
  onSearchChange,
}: {
  tier: CustomerTier | "all";
  search: string;
  onTierChange: (tier: CustomerTier | "all") => void;
  onSearchChange: (search: string) => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tier === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => onTierChange(t.value)}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium",
                  active
                    ? "bg-blue-600 text-white"
                    : "border text-muted-foreground hover:bg-muted",
                )}
              >
                {Icon && (
                  <Icon
                    className={cn("size-3.5", active ? "fill-white text-white" : t.iconClass)}
                  />
                )}
                {t.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-input px-2.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm tên, SĐT..."
            className="h-9 w-56 border-0 px-0 focus-visible:ring-0"
          />
        </div>
      </CardContent>
    </Card>
  );
}
