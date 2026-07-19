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
