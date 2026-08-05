export type RankTier = {
  name: string;
  minRating: number;
  className: string;
  // Player-facing blurb for the Info popup's rank list. Colocated with the
  // threshold it describes — same reasoning as className living here — so
  // a new tier cannot ship with a stale or missing explanation. Deliberately
  // states no rating numbers: rankTierRatingRange derives those, and
  // repeating them in prose is exactly how the two drift apart.
  description: string;
};

// Self-declared rating-gap radius, like MATCH_DISTANCE_PRESETS for region.
// null means any rating. Matching requires BOTH sides' gap setting to cover
// the actual |ratingA - ratingB| difference — same reasoning as distance:
// a player's tolerance for a lopsided match is theirs to set, not something
// the other side's wider setting should override.
//
// WARNING: removing or renumbering a value here orphans anyone already
// storing it — see the equivalent warning on MATCH_DISTANCE_PRESETS in
// regions.ts. Any future change MUST ship with a migration for existing
// stored values.
export const MATCH_RATING_GAP_PRESETS = [
  { label: "Within 25", gap: 25 },
  { label: "Within 50", gap: 50 },
  { label: "Within 75", gap: 75 },
  { label: "Within 100", gap: 100 },
  { label: "Within 150", gap: 150 },
  { label: "Within 200", gap: 200 },
  { label: "Within 300", gap: 300 },
  { label: "Within 500", gap: 500 },
  { label: "Any rating", gap: null },
] as const;

// Ordered highest to lowest; the first tier whose floor the rating clears
// wins. Centered on the 1500 starting rating so a fresh, actively-playing
// account lands around Challenger rather than at the bottom of the ladder.
  
// Exported (and readonly) so the Info popup's rank list renders straight off
// same array getRankTier reads, rather than keeping a parallel copy that
// can silently fall out of date.
export const RANK_TIERS: readonly RankTier[] = [
  {
    name: "Legend",
    minRating: 2100,
    className: "bg-rose-100 text-rose-800 dark:bg-rose-500/15 dark:text-rose-400",
    description:
      "The peak of the ladder. Reserved for the players who define the meta at the very top of competition.",
  },
  {
    name: "Grandmaster",
    minRating: 1900,
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-400",
    description:
      "The top of the ladder. Held by the handful of players who consistently beat Master-level opposition.",
  },
  {
    name: "Master",
    minRating: 1750,
    className: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-400",
    description:
      "Consistently beating Elite players, and realistically in contention for a top-5 finish when the season ends.",
  },
  {
    name: "Elite",
    minRating: 1600,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400",
    description:
      "Well clear of the starting rating, with a proven winning record against the rest of the field.",
  },
  {
    name: "Fighter",
    minRating: 1450,
    className: "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-400",
    description:
      "The band the 1500 starting rating sits in, and where most players land once their rating settles.",
  },
  {
    name: "Challenger",
    minRating: -Infinity,
    className: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-400",
    description:
      "Below the starting rating. Every rank above is reachable from here, and ratings reset when a season ends.",
  },
];

// Sets played before a rating is trusted enough to name a tier. Named here
// rather than left as a literal so the Info popup can state the number
// without hardcoding a second copy of it. Deliberately NOT shared with
// kFactor in matches.ts, which happens to use the same 10 today but is a
// separate rating-math decision — collapsing them would silently couple two
// unrelated rules together.
export const PROVISIONAL_MIN_GAMES = 10;

// Rating is noisy under this many games (the K-factor tapering matches this
// same threshold elsewhere), so a provisional player gets no tier yet rather
// than a misleadingly precise one. Also used by lobby.ts to cap how wide a
// rating gap a provisional player can be matched across.
export const PROVISIONAL_GAMES_THRESHOLD = 10;

export function getRankTier(rating: number, gamesPlayed: number): RankTier | null {
  if (gamesPlayed < PROVISIONAL_GAMES_THRESHOLD) return null;
  return RANK_TIERS.find((t) => rating >= t.minRating) ?? RANK_TIERS[RANK_TIERS.length - 1];
}

// The rating window a tier covers, formatted for display. Derived from the
// neighbouring tier's floor instead of a second hardcoded list, so the
// ranges shown to players can never drift away from the thresholds
// getRankTier actually applies. The top tier has no ceiling and the bottom
// tier has no floor, so each gets an open-ended label instead.
export function rankTierRatingRange(tier: RankTier): string {
  const tierAbove = RANK_TIERS[RANK_TIERS.indexOf(tier) - 1];
  if (!tierAbove) return `${tier.minRating}+`;
  if (tier.minRating === -Infinity) return `Under ${tierAbove.minRating}`;
  return `${tier.minRating} – ${tierAbove.minRating - 1}`;
}

// How close a player is to tiering up — the "just one more push" signal on
// their own profile. Provisional players (no tier yet) and players already
// at the top tier (nowhere higher to go) both get null; everyone else gets
// a strictly positive point gap, since getRankTier already puts them below
// the next tier's floor by definition.
export function pointsToNextTier(
  rating: number,
  gamesPlayed: number,
): { nextTier: RankTier; pointsNeeded: number } | null {
  const current = getRankTier(rating, gamesPlayed);
  if (!current) return null;
  const nextTier = RANK_TIERS[RANK_TIERS.indexOf(current) - 1];
  if (!nextTier) return null;
  return { nextTier, pointsNeeded: nextTier.minRating - rating };
}

// Separate from the tier/K-factor threshold above: public leaderboards
// (site-wide, per-character, season standings) just need enough games to
// rule out a one-win fluke, not full rating convergence — a lower bar so
// genuinely strong players show up as visible proof of the ladder's
// competition instead of sitting hidden for their first 10 games.
export const LEADERBOARD_MIN_GAMES = 3;

// True only when a match's rating gain crossed into a strictly higher tier
// — used to surface a special "tier up" moment rather than the regular win
// celebration. Same gamesPlayed used for both sides on purpose: what
// matters here is which side of a rating threshold the match landed on,
// not reconstructing a historical games-played count.
export function didTierUp(ratingBefore: number, ratingAfter: number, gamesPlayed: number) {
  const before = getRankTier(ratingBefore, gamesPlayed);
  const after = getRankTier(ratingAfter, gamesPlayed);
  if (!before || !after) return false;
  return RANK_TIERS.indexOf(after) < RANK_TIERS.indexOf(before);
}

function minRatingFor(tierName: string) {
  return RANK_TIERS.find((t) => t.name === tierName)!.minRating;
}

export type Achievement = { id: string; label: string; description: string; achieved: boolean };

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
    { id: "first-win", label: "First Win", description: "Win your first ranked set.", achieved: stats.totalWins >= 1 },
    { id: "ten-wins", label: "10 Wins", description: "Win 10 ranked sets.", achieved: stats.totalWins >= 10 },
    { id: "fifty-wins", label: "50 Wins", description: "Win 50 ranked sets.", achieved: stats.totalWins >= 50 },
    {
      id: "elite",
      label: "Reached Elite",
      description: `Reach a rating of ${minRatingFor("Elite")}.`,
      achieved: peak >= minRatingFor("Elite"),
    },
    {
      id: "master",
      label: "Reached Master",
      description: `Reach a rating of ${minRatingFor("Master")}.`,
      achieved: peak >= minRatingFor("Master"),
    },
    {
      id: "grandmaster",
      label: "Reached Grandmaster",
      description: `Reach a rating of ${minRatingFor("Grandmaster")}.`,
      achieved: peak >= minRatingFor("Grandmaster"),
    },
    {
      id: "legend",
      label: "Reached Legend",
      description: `Reach a rating of ${minRatingFor("Legend")}.`,
      achieved: peak >= minRatingFor("Legend"),
    },
    {
      id: "veteran",
      label: "Played 3+ Seasons",
      description: "Play in 3 or more ladder seasons.",
      achieved: stats.seasonsPlayed >= 3,
    },
    {
      id: "competitor",
      label: "Entered a Tournament",
      description: "Sign up for a tournament through the site.",
      achieved: stats.tournamentsEntered >= 1,
    },
  ];
}
