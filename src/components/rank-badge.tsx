import { RANK_TIERS, getRankTier, type RankTier } from "@/lib/rank-tier";
import { Badge } from "@/components/ui/badge";

// Renders a tier exactly as it reads everywhere else on the site, including
// the null case — a player without a tier yet shows "Provisional" rather
// than an empty gap. Split out from RankBadge so surfaces that already hold
// a RankTier (the Info popup's rank list) can render the real badge instead of
// inventing a rating just to derive one, which would put the tier names and
// colors in a second place.
export function TierBadge({ tier, className }: { tier: RankTier | null; className?: string }) {
  if (!tier) {
    return (
      <Badge variant="outline" className={className}>
        Provisional
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={[tier.className, className].filter(Boolean).join(" ")}>
      {tier.name}
    </Badge>
  );
}

// tiers defaults to the current ladder; pass rankTiersFor(season.algorithm) on a
// past season's standings so those ratings are tiered the way that season was.
export function RankBadge({
  rating,
  gamesPlayed,
  className,
  tiers = RANK_TIERS,
}: {
  rating: number;
  gamesPlayed: number;
  className?: string;
  tiers?: readonly RankTier[];
}) {
  return <TierBadge tier={getRankTier(rating, gamesPlayed, tiers)} className={className} />;
}
