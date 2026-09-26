import { PROVISIONAL_GAMES_THRESHOLD } from "@/lib/rank-tier";
import type { Lang } from "@/lib/i18n";

// Stands in wherever a player's rating would be shown while they're still
// provisional (see isRatingVisible). Reads "Provisional" to echo the tier badge
// shown alongside it (see TierBadge) — at this stage a player has no tier and no
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
    ? lang === "es"
      ? "Clasificación de práctica"
      : "Practice rating"
    : lang === "es"
      ? "Clasificación"
      : "Rating";
  const rule =
    lang === "es"
      ? `${noun} se muestra después de ${PROVISIONAL_GAMES_THRESHOLD} partidas`
      : `${noun} is shown after ${PROVISIONAL_GAMES_THRESHOLD} sets`;
  return (
    <span className={className} title={rule}>
      Provisional ({progress})
    </span>
  );
}
