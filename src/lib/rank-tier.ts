export type RankTier = {
  name: string;
  minRating: number;
  className: string;
};

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
