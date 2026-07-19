import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { MatchStatus, ConfirmationMethod } from "@/generated/prisma/enums";

export const matchWithPlayers = {
  player1: { select: { id: true, username: true, avatarUrl: true, rating: true } },
  player2: { select: { id: true, username: true, avatarUrl: true, rating: true } },
} as const;

export async function getUnresolvedMatchForUser(userId: string) {
  return prisma.ratingMatch.findFirst({
    where: {
      OR: [{ player1Id: userId }, { player2Id: userId }],
      status: { in: [MatchStatus.PENDING_REPORT, MatchStatus.REPORTED] },
    },
    orderBy: { createdAt: "desc" },
    include: matchWithPlayers,
  });
}

export async function getLatestMatchForUser(userId: string) {
  return prisma.ratingMatch.findFirst({
    where: { OR: [{ player1Id: userId }, { player2Id: userId }] },
    orderBy: { createdAt: "desc" },
    include: matchWithPlayers,
  });
}

// Provisional players (few games) swing faster so their rating converges quickly.
function kFactor(gamesPlayed: number) {
  if (gamesPlayed < 10) return 40;
  if (gamesPlayed < 30) return 32;
  return 24;
}

function expectedScore(ratingSelf: number, ratingOpp: number) {
  return 1 / (1 + 10 ** ((ratingOpp - ratingSelf) / 400));
}

export async function reportMatchResult(matchId: string, userId: string, won: boolean) {
  await prisma.$transaction(async (tx) => {
    const match = await tx.ratingMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new Error("Match not found");
    if (match.player1Id !== userId && match.player2Id !== userId) {
      throw new Error("Not a participant in this match");
    }

    const opponentId = match.player1Id === userId ? match.player2Id : match.player1Id;
    const winnerId = won ? userId : opponentId;

    if (match.status === MatchStatus.PENDING_REPORT) {
      await tx.ratingMatch.update({
        where: { id: matchId },
        data: {
          status: MatchStatus.REPORTED,
          reportedWinnerId: winnerId,
          reportedById: userId,
          reportedAt: new Date(),
        },
      });
      return;
    }

    if (match.status !== MatchStatus.REPORTED) {
      throw new Error("Match is not open for reporting");
    }
    if (match.reportedById === userId) {
      throw new Error("You already reported this match");
    }

    if (match.reportedWinnerId === winnerId) {
      await confirmMatch(tx, match.id, match.player1Id, match.player2Id, winnerId, userId);
    } else {
      await tx.ratingMatch.update({
        where: { id: matchId },
        data: {
          status: MatchStatus.DISPUTED,
          secondReportWinnerId: winnerId,
          secondReportById: userId,
          secondReportAt: new Date(),
          disputeReason: "Players reported different winners",
        },
      });
    }
  });
}

async function confirmMatch(
  tx: Prisma.TransactionClient,
  matchId: string,
  player1Id: string,
  player2Id: string,
  winnerId: string,
  secondReporterId: string,
) {
  const [p1, p2] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: player1Id } }),
    tx.user.findUniqueOrThrow({ where: { id: player2Id } }),
  ]);

  const p1Won = winnerId === p1.id;
  const expected1 = expectedScore(p1.rating, p2.rating);
  const expected2 = 1 - expected1;
  const score1 = p1Won ? 1 : 0;
  const score2 = p1Won ? 0 : 1;

  const p1After = Math.round(p1.rating + kFactor(p1.gamesPlayed) * (score1 - expected1));
  const p2After = Math.round(p2.rating + kFactor(p2.gamesPlayed) * (score2 - expected2));

  await tx.ratingMatch.update({
    where: { id: matchId },
    data: {
      status: MatchStatus.CONFIRMED,
      secondReportWinnerId: winnerId,
      secondReportById: secondReporterId,
      secondReportAt: new Date(),
      confirmedAt: new Date(),
      confirmationMethod: ConfirmationMethod.SELF_CONFIRMED,
      player1RatingBefore: p1.rating,
      player1RatingAfter: p1After,
      player2RatingBefore: p2.rating,
      player2RatingAfter: p2After,
    },
  });

  await tx.user.update({
    where: { id: p1.id },
    data: { rating: p1After, gamesPlayed: { increment: 1 } },
  });
  await tx.user.update({
    where: { id: p2.id },
    data: { rating: p2After, gamesPlayed: { increment: 1 } },
  });

  await tx.ratingHistory.createMany({
    data: [
      {
        userId: p1.id,
        matchId,
        ratingBefore: p1.rating,
        ratingAfter: p1After,
        delta: p1After - p1.rating,
      },
      {
        userId: p2.id,
        matchId,
        ratingBefore: p2.rating,
        ratingAfter: p2After,
        delta: p2After - p2.rating,
      },
    ],
  });
}
