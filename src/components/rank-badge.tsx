import { RANK_TIERS, getRankTier, type RankTier } from "@/lib/rank-tier";
import { Badge } from "@/components/ui/badge";
import type { Lang } from "@/lib/lang";
import { tr } from "@/lib/lang";

// The tier names themselves (Legend, Fighter, …) are the ladder's own labels
// and stay in English in every language, the way a rank name does. The
// no-tier-yet case is not a name but a sentence about state, so it reads in
// the visitor's language — "Provisional" tells a Japanese player nothing.
export const PROVISIONAL_LABEL: Record<Lang, string> = {
  en: "Provisional",
  es: "Provisional",
  ja: "判定中",
};

// Renders a tier exactly as it reads everywhere else on the site, including
// the null case — a player without a tier yet shows PROVISIONAL_LABEL rather
// than an empty gap. Split out from RankBadge so surfaces that already hold
// a RankTier (the Info popup's rank list) can render the real badge instead of
// inventing a rating just to derive one, which would put the tier names and
// colors in a second place.
export function TierBadge({
  tier,
  className,
  lang = "en",
}: {
  tier: RankTier | null;
  className?: string;
  lang?: Lang;
}) {
  if (!tier) {
    return (
      <Badge variant="outline" className={className}>
        {tr(lang, PROVISIONAL_LABEL)}
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
  lang = "en",
}: {
  rating: number;
  gamesPlayed: number;
  className?: string;
  tiers?: readonly RankTier[];
  lang?: Lang;
}) {
  return <TierBadge tier={getRankTier(rating, gamesPlayed, tiers)} className={className} lang={lang} />;
}
