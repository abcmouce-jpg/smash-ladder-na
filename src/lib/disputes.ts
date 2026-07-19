import { prisma, TX_OPTIONS, withTransientRetry } from "@/lib/db";
import { MatchStatus, ConfirmationMethod } from "@/generated/prisma/enums";
import { applyEloAndConfirm, matchWithPlayers } from "@/lib/matches";
import { sendDiscordDM } from "@/lib/discord-bot";

export async function listDisputedMatches() {
  return prisma.ratingMatch.findMany({
    where: { status: MatchStatus.DISPUTED },
    orderBy: { createdAt: "desc" },
    include: matchWithPlayers,
  });
}

export async function resolveDisputedMatch(matchId: string, winnerId: string) {
  const match = await withTransientRetry(() =>
    prisma.$transaction(async (tx) => {
      const match = await tx.ratingMatch.findUnique({ where: { id: matchId } });
      if (!match) throw new Error("Match not found");
      if (match.status !== MatchStatus.DISPUTED) throw new Error("Match is not disputed");
      if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
        throw new Error("Winner must be one of the two players");
      }
      // secondReport* already records the disagreeing second report from
      // reportMatchResult; an admin ruling shouldn't overwrite that history.
      await applyEloAndConfirm(tx, match, winnerId, ConfirmationMethod.ADMIN_RESOLVED, null);
      return match;
    }, TX_OPTIONS),
  );

  const [p1, p2] = await Promise.all([
    prisma.user.findUnique({ where: { id: match.player1Id }, select: { discordId: true } }),
    prisma.user.findUnique({ where: { id: match.player2Id }, select: { discordId: true } }),
  ]);
  const winnerIsP1 = winnerId === match.player1Id;
  if (p1) await sendDiscordDM(p1.discordId, `⚖️ A mod resolved your disputed match — you ${winnerIsP1 ? "won" : "lost"}.`);
  if (p2) await sendDiscordDM(p2.discordId, `⚖️ A mod resolved your disputed match — you ${winnerIsP1 ? "lost" : "won"}.`);
}

export async function cancelDisputedMatch(matchId: string) {
  await prisma.ratingMatch.updateMany({
    where: { id: matchId, status: MatchStatus.DISPUTED },
    data: { status: MatchStatus.CANCELLED },
  });
}
