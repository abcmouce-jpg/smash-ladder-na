import { prisma } from "@/lib/db";
import { MatchStatus, ConfirmationMethod } from "@/generated/prisma/enums";
import { applyEloAndConfirm, matchWithPlayers } from "@/lib/matches";

export async function listDisputedMatches() {
  return prisma.ratingMatch.findMany({
    where: { status: MatchStatus.DISPUTED },
    orderBy: { createdAt: "desc" },
    include: matchWithPlayers,
  });
}

export async function resolveDisputedMatch(matchId: string, winnerId: string) {
  await prisma.$transaction(async (tx) => {
    const match = await tx.ratingMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new Error("Match not found");
    if (match.status !== MatchStatus.DISPUTED) throw new Error("Match is not disputed");
    if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
      throw new Error("Winner must be one of the two players");
    }
    // secondReport* already records the disagreeing second report from
    // reportMatchResult; an admin ruling shouldn't overwrite that history.
    await applyEloAndConfirm(tx, match, winnerId, ConfirmationMethod.ADMIN_RESOLVED, null);
  });
}

export async function cancelDisputedMatch(matchId: string) {
  await prisma.ratingMatch.updateMany({
    where: { id: matchId, status: MatchStatus.DISPUTED },
    data: { status: MatchStatus.CANCELLED },
  });
}
