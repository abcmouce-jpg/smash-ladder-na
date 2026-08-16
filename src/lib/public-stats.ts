import { prisma } from "@/lib/db";
import { LobbyEntryStatus, MatchStatus } from "@/generated/prisma/enums";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";

// Deliberately narrower than admin-stats.ts — no dispute/report/ban counts
// here, since this feeds the public homepage, not the mod dashboard.
export async function getPublicStats() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [totalPlayers, matchesToday, topPlayers, waitingCount, activeMatchCount] = await Promise.all([
    prisma.user.count(),
    prisma.ratingMatch.count({
      where: { status: MatchStatus.CONFIRMED, confirmedAt: { gte: dayAgo } },
    }),
    prisma.user.findMany({
      where: { gamesPlayed: { gte: LEADERBOARD_MIN_GAMES } },
      orderBy: { rating: "desc" },
      take: 3,
      select: { id: true, username: true, avatarUrl: true, rating: true, gamesPlayed: true },
    }),
    // WAITING entries are a reliable "currently queued" count, but PAIRED
    // entries never get cleaned up once a match resolves (they just sit
    // there forever) — so "currently in a match" is counted through
    // RatingMatch.status instead, not RatingLobbyEntry.status, to avoid
    // wildly overcounting from stale PAIRED rows.
    prisma.ratingLobbyEntry.count({
      where: { status: LobbyEntryStatus.WAITING, expiresAt: { gt: now } },
    }),
    prisma.ratingMatch.count({
      where: { status: { in: [MatchStatus.PENDING_REPORT, MatchStatus.REPORTED] } },
    }),
  ]);

  const playingNow = waitingCount + activeMatchCount * 2;

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
