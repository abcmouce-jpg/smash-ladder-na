import { prisma, TX_OPTIONS, withTransientRetry } from "@/lib/db";
import { MatchStatus, ConfirmationMethod } from "@/generated/prisma/enums";
import { applyEloAndConfirm, matchWithPlayers } from "@/lib/matches";
import { tallySetWins, GAMES_TO_WIN } from "@/lib/match-games";
import { sendDiscordDM } from "@/lib/discord-bot";

// A disputed game (both sides reported, but disagreed) no longer flips the
// whole match to a blocking DISPUTED status — the set keeps going on the
// other games while this one waits for a mod. So "disputed" now means
// "this specific game", not "this match": winnerId is still null, but both
// a report and a conflicting second report exist.
export async function listDisputedGames() {
  const games = await prisma.matchGame.findMany({
    where: {
      winnerId: null,
      reportedWinnerId: { not: null },
      secondReportWinnerId: { not: null },
      // If the set already confirmed via its other games (or got cancelled),
      // this dispute is moot — resolving it can't change the outcome, so it
      // shouldn't keep cluttering the mod queue.
      match: { status: { notIn: [MatchStatus.CONFIRMED, MatchStatus.CANCELLED] } },
    },
    orderBy: { createdAt: "desc" },
    include: { match: { include: matchWithPlayers } },
  });
  // Prisma can't express "these two columns differ" directly in a where
  // clause, so that check happens here instead.
  return games.filter((g) => g.reportedWinnerId !== g.secondReportWinnerId);
}

export async function resolveDisputedGame(matchId: string, gameNumber: number, winnerId: string) {
  const result = await withTransientRetry(() =>
    prisma.$transaction(async (tx) => {
      const match = await tx.ratingMatch.findUnique({ where: { id: matchId } });
      if (!match) throw new Error("Match not found");
      if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
        throw new Error("Winner must be one of the two players");
      }

      const game = await tx.matchGame.findUnique({
        where: { matchId_gameNumber: { matchId, gameNumber } },
      });
      if (!game) throw new Error("Game not found");
      if (game.winnerId) throw new Error("This game is already decided");

      // secondReport* already records the disagreeing second report from
      // reportGameResult; an admin ruling shouldn't overwrite that history.
      await tx.matchGame.update({ where: { id: game.id }, data: { winnerId } });

      const games = await tx.matchGame.findMany({ where: { matchId } });
      const wins = tallySetWins(games);
      const setWinnerId = Object.entries(wins).find(([, count]) => count >= GAMES_TO_WIN)?.[0];

      if (setWinnerId) {
        await tx.ratingMatch.update({
          where: { id: matchId },
          data: { reportedWinnerId: setWinnerId, reportedById: setWinnerId, reportedAt: new Date() },
        });
        await applyEloAndConfirm(tx, match, setWinnerId, ConfirmationMethod.ADMIN_RESOLVED, null);
      }

      return { match, setWinnerId };
    }, TX_OPTIONS),
  );

  const [p1, p2] = await Promise.all([
    prisma.user.findUnique({ where: { id: result.match.player1Id }, select: { discordId: true } }),
    prisma.user.findUnique({ where: { id: result.match.player2Id }, select: { discordId: true } }),
  ]);
  const message = result.setWinnerId
    ? `⚖️ A mod resolved game ${gameNumber}'s disputed result — your set is now confirmed.`
    : `⚖️ A mod resolved game ${gameNumber}'s disputed result. The set continues.`;
  if (p1) await sendDiscordDM(p1.discordId, message);
  if (p2) await sendDiscordDM(p2.discordId, message);
}

// A mod can still cancel the whole match outright (e.g. an unsalvageable
// dispute, or bad-faith reporting) regardless of its current status — the
// self-service cancelMatch is deliberately narrower (PENDING_REPORT/
// REPORTED only) since a player shouldn't be able to back out of a match
// that's already progressed past that.
export async function adminCancelMatch(matchId: string) {
  await prisma.ratingMatch.updateMany({
    where: { id: matchId, status: { notIn: [MatchStatus.CONFIRMED, MatchStatus.CANCELLED] } },
    data: { status: MatchStatus.CANCELLED },
  });
}
