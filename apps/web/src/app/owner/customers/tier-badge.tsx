import { Repeat, Sparkles, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CustomerTier } from "./types";

const TIER_META: Record<CustomerTier, { label: string; icon: LucideIcon; cls: string; fill?: boolean }> = {
  new: {
    label: "Mới",
    icon: Sparkles,
    cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  regular: {
    label: "Thường xuyên",
    icon: Repeat,
    cls: "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400",
  },
  vip: {
    label: "VIP",
    icon: Star,
    cls: "bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
    fill: true,
  },
};

export function TierBadge({ tier }: { tier: CustomerTier }) {
  const meta = TIER_META[tier];
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.cls}`}
    >
      <Icon className={`size-3 ${meta.fill ? "fill-current" : ""}`} />
      {meta.label}
    </span>
  );
}
