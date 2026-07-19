import { prisma } from "@/lib/db";
import { LobbyEntryStatus, MatchStatus } from "@/generated/prisma/enums";

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
      where: { gamesPlayed: { gte: 10 } },
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
