import { prisma } from "@/lib/db";
import { MatchStatus } from "@/generated/prisma/enums";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { startOfDayInTimeZone } from "@/lib/timezone";

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

// Raw confirmedAt timestamps for the home page's matches-per-day chart —
// bucketing into "per day" happens in MatchesPerDayChart, not here, because
// day boundaries depend on the visitor's timezone and only the browser knows
// that. The extra day of margin keeps the 30 viewer-local days the chart
// renders complete for any timezone: the earliest instant of the 30th local
// day back can sit up to ~24h before "now minus 30 UTC days" (e.g. a UTC+14
// visitor at local midnight), so a plain 30-day cutoff would silently drop
// matches from the oldest displayed day. The client discards anything outside
// its window.
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

export async function getMatchesPerDay(days = 30) {
  const since = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000);
  const matches = await prisma.ratingMatch.findMany({
    where: { status: MatchStatus.CONFIRMED, confirmedAt: { gte: since } },
    select: { confirmedAt: true },
    orderBy: { confirmedAt: "asc" },
  });
  return matches
    .filter((m): m is { confirmedAt: Date } => m.confirmedAt !== null)
    .map((m) => m.confirmedAt.toISOString());
}
