import { prisma } from "@/lib/db";
import { MatchStatus } from "@/generated/prisma/enums";

export async function getPlayerProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      rating: true,
      gamesPlayed: true,
      createdAt: true,
      region: true,
      wiredConnection: true,
      mainCharacter: true,
      startggUrl: true,
      noShowCount: true,
      cancelCount: true,
    },
  });
}

export async function getPlayerMatchHistory(userId: string, limit = 20) {
  const matches = await prisma.ratingMatch.findMany({
    where: {
      status: MatchStatus.CONFIRMED,
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    orderBy: { confirmedAt: "desc" },
    take: limit,
    include: {
      player1: { select: { id: true, username: true } },
      player2: { select: { id: true, username: true } },
    },
  });

  return matches.map((match) => {
    const isPlayer1 = match.player1Id === userId;
    const opponent = isPlayer1 ? match.player2 : match.player1;
    const ratingBefore = isPlayer1 ? match.player1RatingBefore : match.player2RatingBefore;
    const ratingAfter = isPlayer1 ? match.player1RatingAfter : match.player2RatingAfter;
    const won = match.reportedWinnerId === userId;
    return {
      id: match.id,
      opponent,
      won,
      ratingBefore,
      ratingAfter,
      delta: (ratingAfter ?? 0) - (ratingBefore ?? 0),
      confirmedAt: match.confirmedAt,
    };
  });
}

export async function getRatingChartPoints(userId: string, limit = 50) {
  const rows = await prisma.ratingHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { ratingAfter: true, createdAt: true },
  });
  return rows.reverse().map((r) => ({ date: r.createdAt, rating: r.ratingAfter }));
}

// Current streak: how many of the most recent confirmed matches in a row
// share the same result. Positive = win streak, negative = loss streak.
export function currentStreak(history: { won: boolean }[]) {
  if (history.length === 0) return 0;
  const leadingResult = history[0].won;
  let count = 0;
  for (const m of history) {
    if (m.won !== leadingResult) break;
    count++;
  }
  return leadingResult ? count : -count;
}

// Deliberately NOT reset by endActiveSeasonAndStartNext — only rating and
// gamesPlayed reset there. These read from history that survives forever,
// so a player has something that keeps growing across season resets.
export async function getCareerStats(userId: string) {
  const [wins, losses, peakRating, seasons, tournaments] = await Promise.all([
    prisma.ratingMatch.count({
      where: { status: MatchStatus.CONFIRMED, reportedWinnerId: userId },
    }),
    prisma.ratingMatch.count({
      where: {
        status: MatchStatus.CONFIRMED,
        OR: [{ player1Id: userId }, { player2Id: userId }],
        NOT: { reportedWinnerId: userId },
      },
    }),
    prisma.ratingHistory.aggregate({ where: { userId }, _max: { ratingAfter: true } }),
    prisma.ratingMatch.findMany({
      where: {
        status: MatchStatus.CONFIRMED,
        OR: [{ player1Id: userId }, { player2Id: userId }],
        seasonId: { not: null },
      },
      select: { seasonId: true },
      distinct: ["seasonId"],
    }),
    prisma.tournamentEntry.count({ where: { userId } }),
  ]);

  return {
    totalWins: wins,
    totalLosses: losses,
    peakRating: peakRating._max.ratingAfter,
    seasonsPlayed: seasons.length,
    tournamentsEntered: tournaments,
  };
}

// Top opponents by games played against them, with the head-to-head record.
export async function getTopRivals(userId: string, limit = 3) {
  const matches = await prisma.ratingMatch.findMany({
    where: { status: MatchStatus.CONFIRMED, OR: [{ player1Id: userId }, { player2Id: userId }] },
    select: { player1Id: true, player2Id: true, reportedWinnerId: true },
  });

  const record = new Map<string, { wins: number; losses: number }>();
  for (const m of matches) {
    const opponentId = m.player1Id === userId ? m.player2Id : m.player1Id;
    const entry = record.get(opponentId) ?? { wins: 0, losses: 0 };
    if (m.reportedWinnerId === userId) entry.wins++;
    else entry.losses++;
    record.set(opponentId, entry);
  }

  const topIds = [...record.entries()]
    .sort(([, a], [, b]) => b.wins + b.losses - (a.wins + a.losses))
    .slice(0, limit);
  if (topIds.length === 0) return [];

  const opponents = await prisma.user.findMany({
    where: { id: { in: topIds.map(([id]) => id) } },
    select: { id: true, username: true },
  });
  const usernameById = new Map(opponents.map((o) => [o.id, o.username]));

  return topIds.map(([id, rec]) => ({
    opponentId: id,
    username: usernameById.get(id) ?? "Unknown",
    ...rec,
  }));
}
