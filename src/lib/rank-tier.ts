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
// wins.
//
// Fixed 200-point windows, anchored on Fighter so the 1500 baseline sits in
// the middle of it and every promotion costs the same 200 points:
//
//   Legend       2200+
//   Grandmaster  2000 – 2199
//   Master       1800 – 1999
//   Elite        1600 – 1799
//   Fighter      1400 – 1599
//   Trainee      Under 1400
//
// Floors stay on the 25-point grid the rating distribution chart's bins assume
// (see RATING_BIN_STEPS in public-stats.ts), so a bucket can never straddle two
// tiers.
//
// These are the CURRENT ladder. A past season's standings are read against the
// ladder it actually ran on instead — see LEGACY_RANK_TIERS and rankTiersFor.

// Exported (and readonly) so the Info popup's rank list renders straight off
// same array getRankTier reads, rather than keeping a parallel copy that
// can silently fall out of date.
export const RANK_TIERS: readonly RankTier[] = [
  {
    name: "Legend",
    minRating: 2200,
    className: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400",
    description: "The peak of the ladder. Reserved for the players who define the meta at the very top of competition.",
  },
  {
    name: "Grandmaster",
    minRating: 2000,
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-400",
    description: "The top of the ladder. Held by the handful of players who consistently beat Master-level opposition.",
  },
  {
    name: "Master",
    minRating: 1800,
    className: "bg-violet-100 text-violet-800 dark:bg-violet-500/15 dark:text-violet-400",
    description:
      "Consistently beating Elite players, and realistically in contention for a top-5 finish when the season ends.",
  },
  {
    name: "Elite",
    minRating: 1600,
    className: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-400",
    description: "Well clear of the starting rating, with a proven winning record against the rest of the field.",
  },
  {
    name: "Fighter",
    minRating: 1400,
    className: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400",
    description: "The band the 1500 starting rating sits in, and where most players land once their rating settles.",
  },
  {
    name: "Trainee",
    minRating: -Infinity,
    className: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-400",
    description:
      "Below the starting rating. Every rank above is reachable from here, and ratings reset when a season ends.",
  },
];

// The ladder the Elo preseason actually ran on: the old hand-tuned floors, and
// the "Challenger" tier that RANK_TIERS later renamed to Trainee. Frozen on
// purpose — a past season's standings should read the way they did when they
// were played, not be retroactively re-tiered against floors that didn't exist
// yet (a 2050 finish was Legend then, and stays Legend now). Deliberately
// duplicates the classNames/descriptions rather than deriving them from
// RANK_TIERS so a future change to the current ladder can't silently rewrite
// history. Selected by rankTiersFor, keyed off the season's rating algorithm.
export const LEGACY_RANK_TIERS: readonly RankTier[] = [
  {
    name: "Legend",
    minRating: 2100,
    className: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400",
    description: "The peak of the ladder. Reserved for the players who define the meta at the very top of competition.",
  },
  {
    name: "Grandmaster",
    minRating: 1900,
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-500/15 dark:text-yellow-400",
    description: "The top of the ladder. Held by the handful of players who consistently beat Master-level opposition.",
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
    description: "Well clear of the starting rating, with a proven winning record against the rest of the field.",
  },
  {
    name: "Fighter",
    minRating: 1450,
    className: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400",
    description: "The band the 1500 starting rating sits in, and where most players land once their rating settles.",
  },
  {
    name: "Challenger",
    minRating: -Infinity,
    className: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-400",
    description:
      "Below the starting rating. Every rank above is reachable from here, and ratings reset when a season ends.",
  },
];

// Which ladder a set of ratings should be read against, mirrored from
// Season.algorithm. The Elo preseason used the legacy floors above; every
// Glicko-2 season (Season 1 on) uses the current RANK_TIERS. Kept as plain
// string literals rather than the generated Prisma enum so this module stays
// dependency-free — the two are structurally identical, so a caller can pass
// Season.algorithm straight in.
export type SeasonAlgorithm = "ELO" | "GLICKO2";

export function rankTiersFor(algorithm: SeasonAlgorithm): readonly RankTier[] {
  return algorithm === "ELO" ? LEGACY_RANK_TIERS : RANK_TIERS;
}

// Tiers a Free Battle post can be restricted to — a deliberate subset of
// RANK_TIERS (no Fighter/Trainee, since those are the default "anyone"
// case already; no Legend, since there's no #legend-grind equivalent
// channel to route its notification to). Ordered highest to lowest to
// match RANK_TIERS, so callers can find each one's minRating there.
export const FREE_BATTLE_TIERS = ["Grandmaster", "Master", "Elite"] as const;
export type FreeBattleTier = (typeof FREE_BATTLE_TIERS)[number];

// Sets played before a rating is trusted enough to name a tier — and, by the
// same rule, before the number itself is shown to anyone but moderators (see
// isRatingVisible). Named here rather than left as a literal so the Info popup
// can state the number without hardcoding a second copy of it. Deliberately NOT
// shared with kFactor in matches.ts, which still tapers over a longer run of
// games and is a separate rating-math decision — collapsing them would
// silently couple two unrelated rules together.
export const PROVISIONAL_MIN_GAMES = 5;

// Rating is noisy under this many games, so a provisional player gets no tier
// yet rather than a misleadingly precise one. Also used by lobby.ts to cap how
// wide a rating gap a provisional player can be matched across, and by
// isRatingVisible to decide whether the number is public at all.
export const PROVISIONAL_GAMES_THRESHOLD = 5;

// Whether a player's rating may be shown to a given viewer. A brand-new
// player's number is still swinging wildly (see kFactor), so it stays hidden
// from everyone — including the player themselves — until they've played
// enough sets to move past provisional. Moderators keep access throughout, so
// an early rating is still available for moderation.
//
// gamesPlayed is whichever count the surface is about: the ranked count, or
// practiceGamesPlayed for the separate practice track (same threshold, its own
// tally).
export function isRatingVisible(gamesPlayed: number, viewerIsModerator: boolean) {
  return viewerIsModerator || gamesPlayed >= PROVISIONAL_GAMES_THRESHOLD;
}

// tiers defaults to the current ladder; pass rankTiersFor(season.algorithm) to
// read a past season's ratings against the ladder it actually ran on.
export function getRankTier(
  rating: number,
  gamesPlayed: number,
  tiers: readonly RankTier[] = RANK_TIERS,
): RankTier | null {
  if (gamesPlayed < PROVISIONAL_GAMES_THRESHOLD) return null;
  return tiers.find((t) => rating >= t.minRating) ?? tiers[tiers.length - 1];
}

// The rating window a tier covers, formatted for display. Derived from the
// neighbouring tier's floor instead of a second hardcoded list, so the
// ranges shown to players can never drift away from the thresholds
// getRankTier actually applies. The top tier has no ceiling and the bottom
// tier has no floor, so each gets an open-ended label instead.
export function rankTierRatingRange(tier: RankTier, tiers: readonly RankTier[] = RANK_TIERS): string {
  const tierAbove = tiers[tiers.indexOf(tier) - 1];
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
  tiers: readonly RankTier[] = RANK_TIERS,
): { nextTier: RankTier; pointsNeeded: number } | null {
  const current = getRankTier(rating, gamesPlayed, tiers);
  if (!current) return null;
  const nextTier = tiers[tiers.indexOf(current) - 1];
  if (!nextTier) return null;
  return { nextTier, pointsNeeded: nextTier.minRating - rating };
}

// The games floor for public leaderboards (site-wide, per-character, season
// standings). Kept as its own name rather than reusing
// PROVISIONAL_GAMES_THRESHOLD because the two are independent rules that
// happen to coincide today: a leaderboard shows ratings, and a rating isn't
// shown to anyone but moderators until a player is past provisional (see
// isRatingVisible), so the floor can't sit below that threshold without
// leaving hidden numbers on a public board.
export const LEADERBOARD_MIN_GAMES = 5;

// True only when a match's rating gain crossed into a strictly higher tier
// — used to surface a special "tier up" moment rather than the regular win
// celebration. Same gamesPlayed used for both sides on purpose: what
// matters here is which side of a rating threshold the match landed on,
// not reconstructing a historical games-played count.
export function didTierUp(
  ratingBefore: number,
  ratingAfter: number,
  gamesPlayed: number,
  tiers: readonly RankTier[] = RANK_TIERS,
) {
  const before = getRankTier(ratingBefore, gamesPlayed, tiers);
  const after = getRankTier(ratingAfter, gamesPlayed, tiers);
  if (!before || !after) return false;
  return tiers.indexOf(after) < tiers.indexOf(before);
}

export function minRatingFor(tierName: string) {
  return RANK_TIERS.find((t) => t.name === tierName)!.minRating;
}

// Peak-rating "achieved" check shared by anything gating on a rank someone
// has ever reached rather than their current one (see getPeakRating in
// players.ts for why peak, not current, is the right basis).
export function hasReachedTier(peakRating: number | null, tierName: string): boolean {
  return peakRating != null && peakRating >= minRatingFor(tierName);
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

const RATING_MILESTONE_STEP = 100;
const RATING_MILESTONE_START = 1600; // first milestone above the 1500 starting rating

// Every 100-point milestone the player has ever reached (peak, not current —
// same reasoning as hasReachedTier: a dip afterward shouldn't take back an
// achievement), plus exactly one more as the next goal to chase. Unlike
// computeAchievements' fixed set, an unbounded "list every future milestone
// too" wouldn't make sense since the ladder has no rating ceiling — capping
// the unearned side at just the next one keeps this from growing forever for
// a top player while still giving everyone else something to aim at.
export function computeRatingMilestoneAchievements(peakRating: number | null): Achievement[] {
  const peak = peakRating ?? -Infinity;
  const highestReached =
    peak >= RATING_MILESTONE_START
      ? Math.floor(peak / RATING_MILESTONE_STEP) * RATING_MILESTONE_STEP
      : RATING_MILESTONE_START - RATING_MILESTONE_STEP;

  const achievements: Achievement[] = [];
  for (let m = RATING_MILESTONE_START; m <= highestReached; m += RATING_MILESTONE_STEP) {
    achievements.push({ id: `rating-${m}`, label: `Reached ${m}`, description: `Reach a rating of ${m}.`, achieved: true });
  }
  const nextGoal = highestReached + RATING_MILESTONE_STEP;
  achievements.push({
    id: `rating-${nextGoal}`,
    label: `Reached ${nextGoal}`,
    description: `Reach a rating of ${nextGoal}.`,
    achieved: false,
  });
  return achievements;
}

// Achieved achievements first, unearned ones after — within each group the
// relative order is left untouched
export function achievementComparator(a: Achievement, b: Achievement): number {
  if (a.achieved === b.achieved) return 0;
  return a.achieved ? -1 : 1;
}
