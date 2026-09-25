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
