import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { MatchStatus, UserStatus } from "@/generated/prisma/enums";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { DELETED_USERNAME } from "@/lib/account";
import { getActiveSeason } from "@/lib/seasons";
import { startOfDayInTimeZone, LADDER_TIME_ZONE } from "@/lib/timezone";

// Single definition of "matches today" shared by the homepage, the Sets
// feed, and the admin overview — those three used to disagree (rolling 24h
// + CONFIRMED-only vs. calendar day + any status), which just meant three
// different numbers next to the same words on different pages. Calendar day
// in the ladder's reference timezone (not server- or viewer-relative, so it
// doesn't flip which matches count as "today" between visitors), any
// status — a match someone's mid-set in right now is still a match today.
export async function getMatchesTodayCount() {
  const todayStart = startOfDayInTimeZone(new Date());
  return prisma.ratingMatch.count({ where: { createdAt: { gte: todayStart } } });
}

// Distinct donors, not raw donation rows — a recurring Ko-fi subscription
// creates one KofiDonation per billing cycle, which would otherwise inflate
// the headcount shown in the footer/lobby banner. Counts every donor
// regardless of isPublic: a headcount alone doesn't reveal who they are, so
// this doesn't need to respect the same opt-out as the /supporters list.
//
// fromName is the only donor identity Ko-fi's webhook gives us (no email or
// stable donor id in the payload — see the kofi webhook route), and it
// defaults to "Anonymous" when a donor doesn't set one. Deduping on it
// naively would collapse every distinct anonymous donor into a single
// "supporter", so only named rows get deduped against each other; each
// "Anonymous" row counts as its own supporter instead.
export async function getSupporterCount() {
  const donors = await prisma.kofiDonation.findMany({ select: { fromName: true } });
  const namedSeen = new Set<string>();
  let count = 0;
  for (const { fromName } of donors) {
    if (fromName === "Anonymous" || !namedSeen.has(fromName)) {
      if (fromName !== "Anonymous") namedSeen.add(fromName);
      count++;
    }
  }
  return count;
}

// Deliberately narrower than admin-stats.ts — no dispute/report/ban counts
// here, since this feeds the public homepage, not the mod dashboard.
export async function getPublicStats() {
  const [totalPlayers, matchesToday, topPlayers, activeMatchCount] = await Promise.all([
    prisma.user.count(),
    getMatchesTodayCount(),
    prisma.user.findMany({
      where: { gamesPlayed: { gte: LEADERBOARD_MIN_GAMES } },
      orderBy: { rating: "desc" },
      take: 3,
      select: { id: true, username: true, avatarUrl: true, rating: true, gamesPlayed: true },
    }),
    // "currently in a match" is counted through RatingMatch.status, not
    // RatingLobbyEntry — PAIRED lobby entries never get cleaned up once a
    // match resolves (they just sit there forever), so counting those would
    // wildly overcount. Same definition as getLobbyActivityStats' inMatch —
    // this used to also add in queued-but-not-yet-matched players, which
    // inflated "playing now" with people who weren't actually playing yet
    // and made it disagree with the Lobby page's own "currently playing"
    // count for the same real-time state.
    prisma.ratingMatch.count({
      where: { status: { in: [MatchStatus.PENDING_REPORT, MatchStatus.REPORTED] } },
    }),
  ]);

  const playingNow = activeMatchCount * 2;

  return { totalPlayers, matchesToday, topPlayers, playingNow };
}

// Volume side of the homepage's "make status visible" rows — top players by
// confirmed sets played rather than rating. Same LEADERBOARD_MIN_GAMES floor
// as the rating leaderboard: right after a season reset everyone sits at 0,
// and this section should render nothing rather than arbitrary one-set players.
export async function getTopGrinders(limit = 3) {
  return prisma.user.findMany({
    where: { gamesPlayed: { gte: LEADERBOARD_MIN_GAMES } },
    orderBy: { gamesPlayed: "desc" },
    take: limit,
    select: { id: true, username: true, avatarUrl: true, gamesPlayed: true },
  });
}

// One window of confirmed matches, read once, carrying everything both
// activity charts need.
//
// The per-day chart needs the raw instants because it buckets by the *viewer's*
// timezone, which only the browser knows; the per-hour chart buckets by the
// ladder's own reference timezone (lib/timezone.ts), which the server can do.
// Those used to be two separate reads of the identical query, so a page showing
// both (the Stats overview) scanned and shipped the whole window twice — hence
// one read, with the single-purpose getter below for callers that need only the
// per-day shape.
//
// The extra day of margin keeps the last N viewer-local days complete for any
// timezone: the earliest instant of the Nth local day back can sit up to ~24h
// before "now minus N UTC days" (e.g. a UTC+14 visitor at local midnight), so
// a plain N-day cutoff would silently drop matches from the oldest displayed
// day. The client discards anything outside its window.
//
// timestamps are ISO strings rather than Dates so this stays plain data — the
// per-day chart parses them back in the browser.
export type LadderActivity = {
  windowDays: number;
  timestamps: string[];
  hourlyCounts: number[];
};

export async function getLadderActivity(days: number): Promise<LadderActivity> {
  const since = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000);
  const matches = await prisma.ratingMatch.findMany({
    where: { status: MatchStatus.CONFIRMED, confirmedAt: { gte: since } },
    select: { confirmedAt: true },
    orderBy: { confirmedAt: "asc" },
  });

  const timestamps: string[] = [];
  // Bucketing by hour happens server-side rather than in the chart because hour
  // boundaries come from the ladder's own timezone (America/New_York), not each
  // visitor's — mirroring how "matches today" is counted everywhere else.
  const hourFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: LADDER_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  });
  const hourlyCounts = new Array<number>(24).fill(0);

  for (const m of matches) {
    if (!m.confirmedAt) continue;
    timestamps.push(m.confirmedAt.toISOString());
    const hour = Number(hourFormatter.format(m.confirmedAt));
    if (Number.isInteger(hour) && hour >= 0 && hour < 24) hourlyCounts[hour]++;
  }

  return { windowDays: days, timestamps, hourlyCounts };
}

// Raw confirmedAt timestamps for the per-day chart — bucketing into "per day"
// happens in MatchesPerDayChart, not here, because day boundaries depend on the
// visitor's timezone and only the browser knows that.
export async function getMatchesPerDay(days = 30) {
  return (await getLadderActivity(days)).timestamps;
}

// Candidate bin widths, narrowest first. The narrowest width that still keeps
// the whole spread within MAX_RATING_BINS columns wins, so a tight ladder gets
// fine 25-point bins while a wide one coarsens up instead of overflowing. Every
// step (and every rank-tier floor in RANK_TIERS) is a multiple of 25, so a
// bucket can never straddle two tiers.
const RATING_BIN_STEPS = [25, 50, 100, 200, 250, 500, 1000];
const MAX_RATING_BINS = 28;

export type RatingBucket = {
  /** Inclusive lower bound of the bucket. */
  min: number;
  /** Inclusive upper bound (min + binSize - 1). */
  max: number;
  count: number;
};

export type RatingDistribution = {
  buckets: RatingBucket[];
  /** Ranked players covered by the buckets. */
  total: number;
  average: number;
  median: number;
};

// The population every "ranked player" number is counted from: enough games to
// appear on the leaderboard, not banned, not a self-deleted account. Shared by
// getRatingDistribution and getStatsTotals so the two can't drift into showing
// different headcounts.
const RANKED_PLAYER_WHERE = {
  gamesPlayed: { gte: LEADERBOARD_MIN_GAMES },
  status: { not: UserStatus.BANNED },
  username: { not: DELETED_USERNAME },
} satisfies Prisma.UserWhereInput;

// Histogram population for the Stats overview: every ranked player's *current*
// rating, using the same inclusion rules as the leaderboard (getLeaderboardPlayers)
// so the two never show a different headcount. Ratings are already season-scoped,
// since the season rollover resets User.rating, so this needs no season filter.
//
// Binning happens here rather than in the chart because it depends only on the
// data (unlike the per-day chart's viewer-timezone buckets) — the empty buckets
// between the extremes are kept so the shape reads as a continuous distribution.
export async function getRatingDistribution(): Promise<RatingDistribution> {
  const players = await prisma.user.findMany({
    where: RANKED_PLAYER_WHERE,
    select: { rating: true },
  });

  const ratings = players.map((p) => p.rating).sort((a, b) => a - b);
  const total = ratings.length;
  if (total === 0) return { buckets: [], total: 0, average: 0, median: 0 };

  const min = ratings[0];
  const max = ratings[total - 1];
  const binSize =
    RATING_BIN_STEPS.find((step) => (max - min) / step <= MAX_RATING_BINS) ??
    RATING_BIN_STEPS[RATING_BIN_STEPS.length - 1];

  // Snap the edges to bin boundaries so the first and last buckets fully
  // contain the extreme ratings rather than clipping them into partial bins.
  const start = Math.floor(min / binSize) * binSize;
  const end = Math.ceil((max + 1) / binSize) * binSize;

  const buckets: RatingBucket[] = [];
  for (let lower = start; lower < end; lower += binSize) {
    buckets.push({ min: lower, max: lower + binSize - 1, count: 0 });
  }
  for (const rating of ratings) {
    buckets[Math.floor((rating - start) / binSize)].count++;
  }

  const middle = Math.floor(total / 2);
  const median = total % 2 === 1 ? ratings[middle] : Math.round((ratings[middle - 1] + ratings[middle]) / 2);
  const average = Math.round(ratings.reduce((sum, rating) => sum + rating, 0) / total);

  return { buckets, total, average, median };
}

export type StatsTotals = {
  matchesThisSeason: number;
  matchesAllTime: number;
  rankedPlayers: number;
};

// Headline totals for the Stats overview cards.
//
// "Matches" counts confirmed sets, the same unit getLadderActivity and the
// activity charts use — not every RatingMatch row, which would also sweep in
// pending/expired/abandoned ones. A confirmed match always carries a seasonId
// (stamped at confirm time, see applyEloAndConfirm), so the season figure is
// simply the all-time count scoped to the active season and stays a clean
// subset of it.
export async function getStatsTotals(): Promise<StatsTotals> {
  const activeSeason = await getActiveSeason();

  const [matchesThisSeason, matchesAllTime, rankedPlayers] = await Promise.all([
    activeSeason
      ? prisma.ratingMatch.count({ where: { status: MatchStatus.CONFIRMED, seasonId: activeSeason.id } })
      : Promise.resolve(0),
    prisma.ratingMatch.count({ where: { status: MatchStatus.CONFIRMED } }),
    prisma.user.count({ where: RANKED_PLAYER_WHERE }),
  ]);

  return { matchesThisSeason, matchesAllTime, rankedPlayers };
}
