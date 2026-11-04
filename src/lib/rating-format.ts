import type { RatingTrack } from "@/lib/rating-track";

// Ratings are stored as floats so a Glicko-2 season can keep full precision
// between matches (see lib/glicko2.ts), but the fractional part is noise to a
// player — every surface that shows a rating to a person shows a whole number.
// Funnelled through this one helper so the rounding rule can't drift between
// the leaderboard, profiles, stream overlays, the CSV export, and achievement
// text. (Rating values themselves, and anything that plots them on a chart,
// stay on the raw float.)
export function formatRating(rating: number): number {
  return Math.round(rating);
}

/**
 * A rating with its ladder made explicit: R1600 on the randitto track, P1700
 * on the practice one. Main-ladder numbers stay bare — the ladder the site is
 * built around has no ambiguity to resolve, and prefixing it would make every
 * ordinary rating read as a special case.
 *
 * Use this wherever numbers from different tracks appear together or next to a
 * label that only names one of them; `formatRating` remains the plain number
 * for arithmetic and single-track surfaces.
 */
export function formatTrackRating(rating: number, track: RatingTrack): string {
  const value = formatRating(rating);
  switch (track) {
    case "practice":
      return `P${value}`;
    case "randitto":
      return `R${value}`;
    default:
      return String(value);
  }
}
