export type RankTier = {
  name: string;
  minRating: number;
  className: string;
};

// Self-declared rating-gap radius, like MATCH_DISTANCE_PRESETS for region.
// null means any rating. Matching requires BOTH sides' gap setting to cover
// the actual |ratingA - ratingB| difference — same reasoning as distance:
// a player's tolerance for a lopsided match is theirs to set, not something
// the other side's wider setting should override.
export const MATCH_RATING_GAP_PRESETS = [
  { label: "Strict (within 50)", gap: 50 },
  { label: "Close (within 100)", gap: 100 },
  { label: "Moderate (within 150)", gap: 150 },
  { label: "Wide (within 300)", gap: 300 },
  { label: "Any rating", gap: null },
] as const;

// Ordered highest to lowest; the first tier whose floor the rating clears
// wins. Centered on the 1500 starting rating so a fresh, actively-playing
// account lands around Challenger rather than at the bottom of the ladder.
const TIERS: RankTier[] = [
  {
    name: "Grandmaster",
    minRating: 1900,
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-400",
  },
  {
    name: "Master",
    minRating: 1750,
    className: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-400",
  },
  {
    name: "Elite",
    minRating: 1600,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400",
  },
  {
    name: "Challenger",
    minRating: 1450,
    className: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-400",
  },
  {
    name: "Fighter",
    minRating: 1300,
    className: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-400",
  },
  {
    name: "Novice",
    minRating: -Infinity,
    className: "bg-stone-100 text-stone-800 dark:bg-stone-500/15 dark:text-stone-400",
  },
];

// Rating is noisy under 10 games (the K-factor tapering matches this same
// threshold elsewhere), so a provisional player gets no tier yet rather
// than a misleadingly precise one.
export function getRankTier(rating: number, gamesPlayed: number): RankTier | null {
  if (gamesPlayed < 10) return null;
  return TIERS.find((t) => rating >= t.minRating) ?? TIERS[TIERS.length - 1];
}

// True only when a match's rating gain crossed into a strictly higher tier
// — used to surface a special "tier up" moment rather than the regular win
// celebration. Same gamesPlayed used for both sides on purpose: what
// matters here is which side of a rating threshold the match landed on,
// not reconstructing a historical games-played count.
export function didTierUp(ratingBefore: number, ratingAfter: number, gamesPlayed: number) {
  const before = getRankTier(ratingBefore, gamesPlayed);
  const after = getRankTier(ratingAfter, gamesPlayed);
  if (!before || !after) return false;
  return TIERS.indexOf(after) < TIERS.indexOf(before);
}

function minRatingFor(tierName: string) {
  return TIERS.find((t) => t.name === tierName)!.minRating;
}

export type Achievement = { id: string; label: string; achieved: boolean };

// Derived on the fly from stats that already persist forever (match/rating
// history, tournament entries) rather than a stored Achievement table — no
// schema needed, and nothing to backfill for existing players.
export function computeAchievements(stats: {
  totalWins: number;
  peakRating: number | null;
  seasonsPlayed: number;
  tournamentsEntered: number;
}): Achievement[] {
  const peak = stats.peakRating ?? -Infinity;
  return [
    { id: "first-win", label: "First Win", achieved: stats.totalWins >= 1 },
    { id: "ten-wins", label: "10 Wins", achieved: stats.totalWins >= 10 },
    { id: "fifty-wins", label: "50 Wins", achieved: stats.totalWins >= 50 },
    { id: "elite", label: "Reached Elite", achieved: peak >= minRatingFor("Elite") },
    { id: "master", label: "Reached Master", achieved: peak >= minRatingFor("Master") },
    { id: "grandmaster", label: "Reached Grandmaster", achieved: peak >= minRatingFor("Grandmaster") },
    { id: "veteran", label: "Played 3+ Seasons", achieved: stats.seasonsPlayed >= 3 },
    { id: "competitor", label: "Entered a Tournament", achieved: stats.tournamentsEntered >= 1 },
  ];
}
