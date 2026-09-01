import { tierClasses, tierLabel } from "./customer-format";
import type { CustomerTier } from "./types";

export function TierBadge({ tier }: { tier: CustomerTier }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tierClasses(tier)}`}
    >
      {tierLabel(tier)}
    </span>
  );
}
