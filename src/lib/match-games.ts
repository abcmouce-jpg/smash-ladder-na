import { prisma, TX_OPTIONS, withTransientRetry } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { MatchStatus, ConfirmationMethod } from "@/generated/prisma/enums";
import { applyEloAndConfirm } from "@/lib/matches";
import { GAME_ONE_STAGES, COUNTERPICK_STAGES } from "@/lib/stages";
import { sendDiscordDM } from "@/lib/discord-bot";

const GAMES_TO_WIN = 2; // best of 3

function requireParticipant(match: { player1Id: string; player2Id: string }, userId: string) {
  if (match.player1Id !== userId && match.player2Id !== userId) {
    throw new Error("Not a participant in this match");
  }
}

export async function getMatchGames(matchId: string) {
  return prisma.matchGame.findMany({ where: { matchId }, orderBy: { gameNumber: "asc" } });
}

export async function getCurrentGame(matchId: string) {
  return prisma.matchGame.findFirst({ where: { matchId, winnerId: null }, orderBy: { gameNumber: "asc" } });
}

export async function startFirstGame(userId: string, matchId: string) {
  const match = await prisma.ratingMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Match not found");
  requireParticipant(match, userId);

  const existing = await prisma.matchGame.findUnique({
    where: { matchId_gameNumber: { matchId, gameNumber: 1 } },
  });
  if (existing) return; // already started by the other player — benign

  const actorAId = Math.random() < 0.5 ? match.player1Id : match.player2Id;
  const actorBId = actorAId === match.player1Id ? match.player2Id : match.player1Id;

  await prisma.matchGame.create({
    data: {
      matchId,
      gameNumber: 1,
      actorAId,
      actorAStrikes: 1,
      actorBId,
      actorBStrikes: 2,
      stagesRemaining: [...GAME_ONE_STAGES],
    },
  });
}

// Who strikes next, or null once the strike phase is done and it's time to pick.
function actorForStrike(game: {
  actorAId: string;
  actorBId: string;
  actorAStrikes: number;
  actorBStrikes: number;
  struckStages: string[];
}) {
  const count = game.struckStages.length;
  if (count < game.actorAStrikes) return game.actorAId;
  if (count < game.actorAStrikes + game.actorBStrikes) return game.actorBId;
  return null;
}

// Whoever struck fewer stages picks the final one from what's left.
function picker(game: { actorAId: string; actorBId: string; actorAStrikes: number; actorBStrikes: number }) {
  return game.actorAStrikes < game.actorBStrikes ? game.actorAId : game.actorBId;
}

// For the UI: whose turn it is right now and whether they're striking or picking.
export function gameTurnState(game: {
  actorAId: string;
  actorBId: string;
  actorAStrikes: number;
  actorBStrikes: number;
  struckStages: string[];
  finalStage: string | null;
}): { phase: "striking" | "picking" | "done"; actorId: string | null } {
  if (game.finalStage) return { phase: "done", actorId: null };
  const striker = actorForStrike(game);
  if (striker) return { phase: "striking", actorId: striker };
  return { phase: "picking", actorId: picker(game) };
}

async function requireGame(matchId: string, gameNumber: number) {
  const game = await prisma.matchGame.findUnique({
    where: { matchId_gameNumber: { matchId, gameNumber } },
  });
  if (!game) throw new Error("Game not found");
  return game;
}

export async function strikeGameStage(
  userId: string,
  matchId: string,
  gameNumber: number,
  stage: string,
) {
  const game = await requireGame(matchId, gameNumber);
  if (game.finalStage) throw new Error("Stage already decided");
  const actor = actorForStrike(game);
  if (!actor) throw new Error("Striking is done — waiting on a pick");
  if (actor !== userId) throw new Error("Not your turn to strike");
  if (!game.stagesRemaining.includes(stage)) throw new Error("Stage already struck or invalid");

  // Conditional on struckStages still matching what we read, so a racing
  // duplicate click can't apply against stale state.
  await prisma.matchGame.updateMany({
    where: { id: game.id, struckStages: { equals: game.struckStages } },
    data: {
      stagesRemaining: game.stagesRemaining.filter((s) => s !== stage),
      struckStages: [...game.struckStages, stage],
    },
  });
}

export async function pickGameStage(
  userId: string,
  matchId: string,
  gameNumber: number,
  stage: string,
) {
  const game = await requireGame(matchId, gameNumber);
  if (game.finalStage) throw new Error("Stage already decided");
  if (actorForStrike(game) !== null) throw new Error("Striking isn't finished yet");
  if (picker(game) !== userId) throw new Error("Not your turn to pick");
  if (!game.stagesRemaining.includes(stage)) throw new Error("Not a valid remaining stage");

  await prisma.matchGame.updateMany({
    where: { id: game.id, finalStage: null },
    data: { finalStage: stage },
  });
}

type ReportOutcome =
  | { type: "reported"; opponentId: string }
  | { type: "disputed"; player1Id: string; player2Id: string }
  | { type: "game_won"; player1Id: string; player2Id: string; nextGameNumber: number }
  | { type: "set_confirmed"; player1Id: string; player2Id: string };

export async function reportGameResult(
  userId: string,
  matchId: string,
  gameNumber: number,
  won: boolean,
) {
  const match = await prisma.ratingMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Match not found");
  requireParticipant(match, userId);

  const outcome = await withTransientRetry(() =>
    prisma.$transaction<ReportOutcome>(async (tx) => {
      const game = await tx.matchGame.findUnique({
        where: { matchId_gameNumber: { matchId, gameNumber } },
      });
      if (!game) throw new Error("Game not found");
      if (!game.finalStage) throw new Error("Pick a stage before reporting a result");
      if (game.winnerId) throw new Error("This game is already decided");

      const opponentId = match.player1Id === userId ? match.player2Id : match.player1Id;
      const winnerId = won ? userId : opponentId;

      if (!game.reportedById) {
        await tx.matchGame.update({
          where: { id: game.id },
          data: { reportedWinnerId: winnerId, reportedById: userId, reportedAt: new Date() },
        });
        return { type: "reported", opponentId };
      }

      if (game.reportedById === userId) throw new Error("You already reported this game");

      if (game.reportedWinnerId !== winnerId) {
        // A per-game disagreement is rare and not worth its own resolution
        // UI — fold it into the existing match-level dispute queue that
        // MOD/ADMIN already handles.
        await tx.ratingMatch.update({
          where: { id: matchId },
          data: {
            status: MatchStatus.DISPUTED,
            reportedWinnerId: game.reportedWinnerId,
            reportedById: game.reportedById,
            reportedAt: game.reportedAt,
            secondReportWinnerId: winnerId,
            secondReportById: userId,
            secondReportAt: new Date(),
            disputeReason: `Disagreement on game ${gameNumber}'s winner`,
          },
        });
        await tx.matchGame.update({
          where: { id: game.id },
          data: { secondReportWinnerId: winnerId, secondReportById: userId, secondReportAt: new Date() },
        });
        return { type: "disputed", player1Id: match.player1Id, player2Id: match.player2Id };
      }

      await tx.matchGame.update({
        where: { id: game.id },
        data: {
          secondReportWinnerId: winnerId,
          secondReportById: userId,
          secondReportAt: new Date(),
          winnerId,
        },
      });

      const setWinnerId = await progressSet(tx, match, gameNumber, winnerId);
      return setWinnerId
        ? { type: "set_confirmed", player1Id: match.player1Id, player2Id: match.player2Id }
        : {
            type: "game_won",
            player1Id: match.player1Id,
            player2Id: match.player2Id,
            nextGameNumber: gameNumber + 1,
          };
    }, TX_OPTIONS),
  );

  await notifyReportOutcome(outcome, gameNumber);
}

async function notifyReportOutcome(outcome: ReportOutcome, gameNumber: number) {
  if (outcome.type === "reported") {
    const opponent = await prisma.user.findUnique({
      where: { id: outcome.opponentId },
      select: { discordId: true },
    });
    if (opponent) {
      await sendDiscordDM(
        opponent.discordId,
        `📋 Your opponent reported game ${gameNumber}'s result — head to the lobby to confirm or dispute it.`,
      );
    }
    return;
  }

  const [p1, p2] = await Promise.all([
    prisma.user.findUnique({ where: { id: outcome.player1Id }, select: { discordId: true, username: true, rating: true } }),
    prisma.user.findUnique({ where: { id: outcome.player2Id }, select: { discordId: true, username: true, rating: true } }),
  ]);
  if (!p1 || !p2) return;

  if (outcome.type === "disputed") {
    await Promise.all([
      sendDiscordDM(p1.discordId, `⚠️ You and ${p2.username} reported different results for game ${gameNumber} — a mod will review it.`),
      sendDiscordDM(p2.discordId, `⚠️ You and ${p1.username} reported different results for game ${gameNumber} — a mod will review it.`),
    ]);
  } else if (outcome.type === "game_won") {
    await Promise.all([
      sendDiscordDM(p1.discordId, `Game ${gameNumber} is decided — on to game ${outcome.nextGameNumber}. Head to the lobby.`),
      sendDiscordDM(p2.discordId, `Game ${gameNumber} is decided — on to game ${outcome.nextGameNumber}. Head to the lobby.`),
    ]);
  } else if (outcome.type === "set_confirmed") {
    await Promise.all([
      sendDiscordDM(p1.discordId, `✅ Your set vs ${p2.username} is confirmed! New rating: ${p1.rating}.`),
      sendDiscordDM(p2.discordId, `✅ Your set vs ${p1.username} is confirmed! New rating: ${p2.rating}.`),
    ]);
  }
}

async function progressSet(
  tx: Prisma.TransactionClient,
  match: { id: string; player1Id: string; player2Id: string },
  decidedGameNumber: number,
  gameWinnerId: string,
): Promise<string | null> {
  const games = await tx.matchGame.findMany({ where: { matchId: match.id } });
  const wins: Record<string, number> = {};
  for (const g of games) {
    if (g.winnerId) wins[g.winnerId] = (wins[g.winnerId] ?? 0) + 1;
  }

  const setWinnerId = Object.entries(wins).find(([, count]) => count >= GAMES_TO_WIN)?.[0];
  if (setWinnerId) {
    await tx.ratingMatch.update({
      where: { id: match.id },
      data: { reportedWinnerId: setWinnerId, reportedById: setWinnerId, reportedAt: new Date() },
    });
    await applyEloAndConfirm(tx, match, setWinnerId, ConfirmationMethod.SELF_CONFIRMED, {
      winnerId: setWinnerId,
      reporterId: setWinnerId,
    });
    return setWinnerId;
  }

  const loserId = gameWinnerId === match.player1Id ? match.player2Id : match.player1Id;
  await tx.matchGame.create({
    data: {
      matchId: match.id,
      gameNumber: decidedGameNumber + 1,
      actorAId: gameWinnerId, // previous game's winner strikes first
      actorAStrikes: 2,
      actorBId: loserId,
      actorBStrikes: 0,
      stagesRemaining: [...COUNTERPICK_STAGES],
    },
  });
  return null;
}
