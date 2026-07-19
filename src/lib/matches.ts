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

// Either player can back out unilaterally while the set is still in
// progress — no rating impact either way. Once a result's been confirmed
// (or is already disputed) it's too late to just walk away from.
export async function cancelMatch(userId: string, matchId: string) {
  const match = await prisma.ratingMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Match not found");
  if (match.player1Id !== userId && match.player2Id !== userId) {
    throw new Error("Not a participant in this match");
  }
  if (match.status !== MatchStatus.PENDING_REPORT) {
    throw new Error("This match can no longer be cancelled");
  }
  await prisma.$transaction([
    prisma.ratingMatch.update({ where: { id: matchId }, data: { status: MatchStatus.CANCELLED } }),
    prisma.user.update({ where: { id: userId }, data: { cancelCount: { increment: 1 } } }),
  ]);
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

// Applies the Elo update, marks the match CONFIRMED, and records rating history.
// Shared by self-confirmation (both players agree) and the cron finalizer's
// auto-timeout path (only one player reported before the match expired).
export async function applyEloAndConfirm(
  tx: Prisma.TransactionClient,
  match: { id: string; player1Id: string; player2Id: string },
  winnerId: string,
  confirmationMethod: ConfirmationMethod,
  secondReport: { winnerId: string; reporterId: string } | null,
) {
  const [p1, p2, season] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: match.player1Id } }),
    tx.user.findUniqueOrThrow({ where: { id: match.player2Id } }),
    tx.season.findFirst({ where: { endsAt: null }, orderBy: { startsAt: "desc" } }),
  ]);
  // Stamped at confirm time (not creation), since that's when the result
  // actually counts — falls back to creating Season 1 if none exists yet.
  const seasonId = season?.id ?? (await tx.season.create({ data: { name: "Season 1" } })).id;

  const p1Won = winnerId === p1.id;
  const expected1 = expectedScore(p1.rating, p2.rating);
  const expected2 = 1 - expected1;
  const score1 = p1Won ? 1 : 0;
  const score2 = p1Won ? 0 : 1;

  const p1After = Math.round(p1.rating + kFactor(p1.gamesPlayed) * (score1 - expected1));
  const p2After = Math.round(p2.rating + kFactor(p2.gamesPlayed) * (score2 - expected2));

  await tx.ratingMatch.update({
    where: { id: match.id },
    data: {
      status: MatchStatus.CONFIRMED,
      ...(secondReport && {
        secondReportWinnerId: secondReport.winnerId,
        secondReportById: secondReport.reporterId,
        secondReportAt: new Date(),
      }),
      confirmedAt: new Date(),
      confirmationMethod,
      seasonId,
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
        matchId: match.id,
        ratingBefore: p1.rating,
        ratingAfter: p1After,
        delta: p1After - p1.rating,
      },
      {
        userId: p2.id,
        matchId: match.id,
        ratingBefore: p2.rating,
        ratingAfter: p2After,
        delta: p2After - p2.rating,
      },
    ],
  });
}
