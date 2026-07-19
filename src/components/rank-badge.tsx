import { getRankTier } from "@/lib/rank-tier";
import { Badge } from "@/components/ui/badge";

export function RankBadge({ rating, gamesPlayed }: { rating: number; gamesPlayed: number }) {
  const tier = getRankTier(rating, gamesPlayed);

  if (!tier) {
    return <Badge variant="outline">Provisional</Badge>;
  }

  return (
    <Badge variant="outline" className={tier.className}>
      {tier.name}
    </Badge>
  );
}
