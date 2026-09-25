import { PROVISIONAL_GAMES_THRESHOLD } from "@/lib/rank-tier";
import type { Lang } from "@/lib/i18n";

// Stands in wherever a player's rating would be shown while they're still
// provisional (see isRatingVisible). States the rule instead of leaving a bare
// dash, so the missing number reads as intentional rather than broken, and so
// the player knows exactly how many more sets they need. Rendered in the same
// slot the rating occupies on each surface, so layouts don't shift between the
// hidden and shown states.
//
// `practice` picks the wording for the separate practice track, which is gated
// on its own games count (practiceGamesPlayed) but shares the same threshold.
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
  const hidden = lang === "es" ? "oculta" : "hidden";
  const rule =
    lang === "es"
      ? `${noun} se muestra después de ${PROVISIONAL_GAMES_THRESHOLD} partidas`
      : `${noun} is shown after ${PROVISIONAL_GAMES_THRESHOLD} sets`;
  return (
    <span className={className} title={rule}>
      {noun} {hidden} ({progress})
    </span>
  );
}
