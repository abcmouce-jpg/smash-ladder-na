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
