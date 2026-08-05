import {
  PROVISIONAL_MIN_GAMES,
  RANK_TIERS,
  rankTierRatingRange,
  type RankTier,
} from "@/lib/rank-tier";
import { TierBadge } from "@/components/rank-badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// One row of the rank list: the real badge, the window it covers, and the
// blurb. The range is passed in rather than derived here because the
// provisional row is gated on sets played, not rating — it is the absence
// of a tier, which is why it is not a member of RANK_TIERS and why `tier`
// is nullable.
function RankRow({
  tier,
  range,
  children,
}: {
  tier: RankTier | null;
  range: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <TierBadge tier={tier} />
        <span className="text-xs tabular-nums text-muted-foreground">{range}</span>
      </div>
      <p className="mt-1.5 text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

// Every rank a player can hold, highest first, rendered straight off
// RANK_TIERS so a new tier needs no edit here. Deliberately free of any
// heading, dialog, or page markup: whichever surface shows the list owns its
// own framing and its own outer spacing, which is what the className
// pass-through is for.
export function RankTierList({ className }: { className?: string }) {
  return (
    <Card className={cn("divide-y divide-border overflow-hidden py-0", className)}>
      {RANK_TIERS.map((tier) => (
        <RankRow key={tier.name} tier={tier} range={rankTierRatingRange(tier)}>
          {tier.description}
        </RankRow>
      ))}
      <RankRow tier={null} range={`First ${PROVISIONAL_MIN_GAMES} sets`}>
        No rank yet. Ratings swing hardest over your first few sets, so the badge stays neutral
        until yours has had a chance to settle.
      </RankRow>
    </Card>
  );
}
