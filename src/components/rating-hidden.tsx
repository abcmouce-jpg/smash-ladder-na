import { PROVISIONAL_GAMES_THRESHOLD } from "@/lib/rank-tier";
import type { Lang } from "@/lib/i18n";
import { tr } from "@/lib/lang";
import { PROVISIONAL_LABEL } from "@/components/rank-badge";

// Stands in wherever a player's rating would be shown while they're still
// provisional (see isRatingVisible). Reads PROVISIONAL_LABEL to echo the tier
// badge shown alongside it (see TierBadge) — at this stage a player has no tier and no
// public rating — followed by the sets remaining until the rating appears, so
// the placeholder reads as intentional rather than broken and the player knows
// how much further they have to go. Rendered in the same slot the rating occupies
// on each surface, so layouts don't shift between the hidden and shown states.
//
// `practice` only picks the hover-tooltip wording, for the separate practice
// track (gated on practiceGamesPlayed but sharing the same threshold).
export function RatingHidden({
  gamesPlayed,
  lang = "en",
  className,
  practice = false,
}: {
  gamesPlayed: number;
  lang?: Lang;
  className?: string;
  practice?: boolean;
}) {
  const progress = `${gamesPlayed}/${PROVISIONAL_GAMES_THRESHOLD}`;
  const noun = practice
    ? tr(lang, { en: "Practice rating", es: "Clasificación de práctica", ja: "練習レート" })
    : tr(lang, { en: "Rating", es: "Clasificación", ja: "レート" });
  const rule = tr(lang, {
    en: `${noun} is shown after ${PROVISIONAL_GAMES_THRESHOLD} sets`,
    es: `${noun} se muestra después de ${PROVISIONAL_GAMES_THRESHOLD} partidas`,
    ja: `${noun}は${PROVISIONAL_GAMES_THRESHOLD}セット後に表示されます`,
  });
  return (
    <span className={className} title={rule}>
      {tr(lang, PROVISIONAL_LABEL)} ({progress})
    </span>
  );
}
