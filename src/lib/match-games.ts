import { prisma, TX_OPTIONS, withTransientRetry } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { ConfirmationMethod, UserRole } from "@/generated/prisma/enums";
import { applyEloAndConfirm } from "@/lib/matches";
import { GAME_ONE_STAGES, COUNTERPICK_STAGES } from "@/lib/stages";
import { SMASH_CHARACTERS } from "@/lib/characters";
import { sendDiscordDM } from "@/lib/discord-bot";

export const GAMES_TO_WIN = 3; // best of 5
const MAX_GAMES = 2 * GAMES_TO_WIN - 1;

// Indirection so `Date.now()` isn't called directly in a component's render
// body (Server Components render once per request — there's no memoization/
// re-render concern here — but the lint rule can't tell the difference).
export function secondsUntil(deadline: Date) {
  return Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 1000));
}

function requireParticipant(match: { player1Id: string; player2Id: string }, userId: string) {
  if (match.player1Id !== userId && match.player2Id !== userId) {
    throw new Error("Not a participant in this match");
  }
}

// How long a player has to strike or pick before it auto-resolves for them —
// stage selection happens live during a session, unlike the 24h match-level
// no-report timeout, so this needs to be short enough to actually unstick a
// stalled/AFK opponent mid-session.
export const STRIKE_TIMEOUT_MS = 60 * 1000;

// Lazy, not cron-driven (the finalize cron only runs daily — far too coarse
// for a live in-session timer): checked on every read, same idea as
// liftExpiredSuspension in account.ts. Picks a uniformly random stage from
// whatever's left rather than favoring either side.
async function autoResolveStaleTurn(matchId: string) {
  const game = await prisma.matchGame.findFirst({
    where: { matchId, winnerId: null, finalStage: null },
    orderBy: { gameNumber: "desc" },
  });
  if (!game) return;
  if (Date.now() - game.turnStartedAt.getTime() < STRIKE_TIMEOUT_MS) return;

  const striker = actorForStrike(game);
  if (striker) {
    const stage = game.stagesRemaining[Math.floor(Math.random() * game.stagesRemaining.length)];
    if (!stage) return;
    await prisma.matchGame.updateMany({
      where: { id: game.id, struckStages: { equals: game.struckStages } },
      data: {
        stagesRemaining: game.stagesRemaining.filter((s) => s !== stage),
        struckStages: [...game.struckStages, stage],
        turnStartedAt: new Date(),
      },
    });
    return;
  }

  const stage = game.stagesRemaining[Math.floor(Math.random() * game.stagesRemaining.length)];
  if (!stage) return;
  await prisma.matchGame.updateMany({ where: { id: game.id, finalStage: null }, data: { finalStage: stage } });
}

export async function getMatchGames(matchId: string) {
  await autoResolveStaleTurn(matchId);
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

// Without this, a player could strike/pick stages through an entire game
// without ever locking in a character, leaving actorA/BCharacter null for a
// game that's already been won and reported — permanently missing character
// data. Requiring your own lock-in before you act keeps the two in sync.
function hasLockedOwnCharacter(
  game: { actorAId: string; actorACharacter: string | null; actorBCharacter: string | null },
  userId: string,
) {
  return (userId === game.actorAId ? game.actorACharacter : game.actorBCharacter) !== null;
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

type CharacterPickGame = {
  gameNumber: number;
  actorAId: string;
  actorBId: string;
  actorACharacter: string | null;
  actorBCharacter: string | null;
};

// Game 1 is a blind pick — neither side sees the other's character until
// both have locked one in. Games 2+ mirror the stage-strike order: actorA
// (the previous game's winner) must lock in first, then actorB picks with
// actorA's choice visible, so the loser gets to react.
export function characterPickState(
  game: CharacterPickGame,
  userId: string,
): {
  yourCharacter: string | null;
  opponentCharacter: string | null;
  canPickNow: boolean;
} {
  const isActorA = userId === game.actorAId;
  const yourCharacter = isActorA ? game.actorACharacter : game.actorBCharacter;
  const theirCharacter = isActorA ? game.actorBCharacter : game.actorACharacter;

  if (game.gameNumber === 1) {
    const bothPicked = game.actorACharacter !== null && game.actorBCharacter !== null;
    return {
      yourCharacter,
      opponentCharacter: bothPicked ? theirCharacter : null,
      canPickNow: yourCharacter === null,
    };
  }

  const actorALockedIn = game.actorACharacter !== null;
  return {
    yourCharacter,
    opponentCharacter: theirCharacter,
    canPickNow: yourCharacter === null && (isActorA || actorALockedIn),
  };
}

export async function pickGameCharacter(
  userId: string,
  matchId: string,
  gameNumber: number,
  character: string,
) {
  const game = await requireGame(matchId, gameNumber);
  if (userId !== game.actorAId && userId !== game.actorBId) {
    throw new Error("Not a participant in this game");
  }
  if (!(SMASH_CHARACTERS as readonly string[]).includes(character)) {
    throw new Error("Not a recognized character");
  }

  const { canPickNow, yourCharacter } = characterPickState(game, userId);
  if (yourCharacter !== null) throw new Error("You already picked your character for this game");
  if (!canPickNow) throw new Error("Wait for your opponent to pick their character first");

  const isActorA = userId === game.actorAId;
  await prisma.matchGame.updateMany({
    where: {
      id: game.id,
      ...(isActorA ? { actorACharacter: null } : { actorBCharacter: null }),
    },
    data: isActorA ? { actorACharacter: character } : { actorBCharacter: character },
  });
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
  if (!hasLockedOwnCharacter(game, userId)) throw new Error("Lock in your character before striking a stage");
  if (!game.stagesRemaining.includes(stage)) throw new Error("Stage already struck or invalid");

  // Conditional on struckStages still matching what we read, so a racing
  // duplicate click can't apply against stale state.
  await prisma.matchGame.updateMany({
    where: { id: game.id, struckStages: { equals: game.struckStages } },
    data: {
      stagesRemaining: game.stagesRemaining.filter((s) => s !== stage),
      struckStages: [...game.struckStages, stage],
      turnStartedAt: new Date(), // a fresh turn (next strike or the pick) starts now
    },
  });
}

// Undo your own most recent strike, as long as nobody's struck after it —
// i.e. it's still (part of) your turn. Once the other side has struck since,
// yours is locked in; you can't reach back and change it.
export async function unstrikeLastGameStage(userId: string, matchId: string, gameNumber: number) {
  const game = await requireGame(matchId, gameNumber);
  if (game.finalStage) throw new Error("Stage already decided");
  if (game.struckStages.length === 0) throw new Error("Nothing to undo yet");

  const lastIndex = game.struckStages.length - 1;
  const actorOfLastStrike = lastIndex < game.actorAStrikes ? game.actorAId : game.actorBId;
  if (actorOfLastStrike !== userId) throw new Error("You can only undo your own most recent strike");

  const lastStage = game.struckStages[lastIndex];
  await prisma.matchGame.updateMany({
    where: { id: game.id, struckStages: { equals: game.struckStages } },
    data: {
      struckStages: game.struckStages.slice(0, -1),
      stagesRemaining: [...game.stagesRemaining, lastStage],
      turnStartedAt: new Date(),
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
  if (!hasLockedOwnCharacter(game, userId)) throw new Error("Lock in your character before picking a stage");
  if (!game.stagesRemaining.includes(stage)) throw new Error("Not a valid remaining stage");

  await prisma.matchGame.updateMany({
    where: { id: game.id, finalStage: null },
    data: { finalStage: stage },
  });
}

type ReportOutcome =
  | { type: "reported"; opponentId: string }
  | { type: "disputed"; player1Id: string; player2Id: string; setDecidedDespiteDispute: boolean }
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
        // A per-game disagreement used to flip the whole match to DISPUTED,
        // which blocked every later game until a mod ruled — in a BO3 that
        // meant one contested game could freeze the entire set. Now the
        // disputed game itself just stays unresolved (winnerId left null,
        // so it's excluded from the win tally and queued for mod review via
        // listDisputedGames/resolveDisputedGame), while the set continues
        // immediately: the first reporter's claimed winner is used as a
        // working assumption for the next game's stage-strike order only.
        // If the mod's ruling differs, that only changes who's credited
        // this one game — games already played aren't affected, and the
        // match still can't confirm until the tally actually reaches 2 wins,
        // so an unresolved dispute can't accidentally hand someone the set.
        await tx.matchGame.update({
          where: { id: game.id },
          data: { secondReportWinnerId: winnerId, secondReportById: userId, secondReportAt: new Date() },
        });
        await tx.ratingMatch.update({
          where: { id: matchId },
          data: { disputeReason: `Disagreement on game ${gameNumber}'s winner` },
        });

        const tentativeWinnerId = game.reportedWinnerId!;
        const setWinnerId = await progressSet(tx, match, gameNumber, tentativeWinnerId);
        return {
          type: "disputed",
          player1Id: match.player1Id,
          player2Id: match.player2Id,
          setDecidedDespiteDispute: !!setWinnerId,
        };
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

// Only disputes get a DM — routine progress (reported/game_won/set_confirmed)
// is left for players to check in the lobby instead of paging their phone.
async function notifyReportOutcome(outcome: ReportOutcome, gameNumber: number) {
  if (outcome.type !== "disputed") return;

  const [p1, p2] = await Promise.all([
    prisma.user.findUnique({ where: { id: outcome.player1Id }, select: { discordId: true, username: true } }),
    prisma.user.findUnique({ where: { id: outcome.player2Id }, select: { discordId: true, username: true } }),
  ]);
  if (!p1 || !p2) return;

  const continuation = outcome.setDecidedDespiteDispute
    ? " Your set is already decided by the other games either way, so this won't change the result."
    : " The set continues in the meantime — head to the lobby.";
  const mods = await prisma.user.findMany({
    where: { role: { in: [UserRole.MOD, UserRole.ADMIN] } },
    select: { discordId: true },
  });
  await Promise.all([
    sendDiscordDM(p1.discordId, `⚠️ You and ${p2.username} reported different results for game ${gameNumber} — a mod will review it.${continuation}`),
    sendDiscordDM(p2.discordId, `⚠️ You and ${p1.username} reported different results for game ${gameNumber} — a mod will review it.${continuation}`),
    ...mods.map((mod) =>
      sendDiscordDM(
        mod.discordId,
        `🚩 New dispute: ${p1.username} vs ${p2.username}, game ${gameNumber} — check /admin/disputes.`,
      ),
    ),
  ]);
}

export const MATCH_TTL_MS = 24 * 60 * 60 * 1000; // mirrors lobby.ts's match no-show/no-report cutoff

// Called by the cron finalizer for a PENDING_REPORT match past its deadline.
// If the current game has one player's report sitting unconfirmed, accept
// it as the result — the reporting player did their part, so the match
// shouldn't just silently expire with no consequence for whoever ghosted.
// Mirrors the pre-BO3 single-report auto-timeout, but at game granularity:
// if this doesn't decide the whole set, the match gets a fresh deadline so
// the set can continue rather than expiring mid-way regardless.
export async function autoConfirmStaleGameReport(
  match: { id: string; player1Id: string; player2Id: string },
  now: Date,
): Promise<{ nonReporterId: string } | null> {
  const hangingGame = await prisma.matchGame.findFirst({
    where: { matchId: match.id, winnerId: null, reportedById: { not: null } },
    orderBy: { gameNumber: "desc" },
  });
  if (!hangingGame?.reportedWinnerId || !hangingGame.reportedById) return null;

  const reportedWinnerId = hangingGame.reportedWinnerId;
  const nonReporterId =
    hangingGame.reportedById === match.player1Id ? match.player2Id : match.player1Id;

  await withTransientRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.matchGame.update({
        where: { id: hangingGame.id },
        data: { winnerId: reportedWinnerId },
      });
      await tx.ratingMatch.update({
        where: { id: match.id },
        data: { expiresAt: new Date(now.getTime() + MATCH_TTL_MS) },
      });
      await progressSet(tx, match, hangingGame.gameNumber, reportedWinnerId, ConfirmationMethod.AUTO_TIMEOUT);
      await tx.user.update({
        where: { id: nonReporterId },
        data: { noShowCount: { increment: 1 } },
      });
    }, TX_OPTIONS),
  );

  return { nonReporterId };
}

// Only counts games with a settled winnerId, so a still-disputed game
// (winnerId left null on purpose) never contributes to either side's tally.
export function tallySetWins(games: { winnerId: string | null }[]) {
  const wins: Record<string, number> = {};
  for (const g of games) {
    if (g.winnerId) wins[g.winnerId] = (wins[g.winnerId] ?? 0) + 1;
  }
  return wins;
}

function getSetWinnerId(wins: Record<string, number>) {
  return Object.entries(wins).find(([, count]) => count >= GAMES_TO_WIN)?.[0];
}

async function progressSet(
  tx: Prisma.TransactionClient,
  match: { id: string; player1Id: string; player2Id: string },
  decidedGameNumber: number,
  gameWinnerId: string,
  confirmationMethod: ConfirmationMethod = ConfirmationMethod.SELF_CONFIRMED,
): Promise<string | null> {
  const games = await tx.matchGame.findMany({ where: { matchId: match.id } });
  const setWinnerId = getSetWinnerId(tallySetWins(games));
  if (setWinnerId) {
    await tx.ratingMatch.update({
      where: { id: match.id },
      data: { reportedWinnerId: setWinnerId, reportedById: setWinnerId, reportedAt: new Date() },
    });
    await applyEloAndConfirm(tx, match, setWinnerId, confirmationMethod, {
      winnerId: setWinnerId,
      reporterId: setWinnerId,
    });
    return setWinnerId;
  }

  // Reachable when the game that would've decided the set (e.g. game 3 of a
  // BO3) is itself disputed — nobody has 2 confirmed wins yet, but there's
  // no game left to play either. Nothing to create; just wait for a mod to
  // resolve the disputed game via resolveDisputedGame.
  if (decidedGameNumber >= MAX_GAMES) return null;

  const loserId = gameWinnerId === match.player1Id ? match.player2Id : match.player1Id;
  const nextGameNumber = decidedGameNumber + 1;
  await tx.matchGame.create({
    data: {
      matchId: match.id,
      gameNumber: nextGameNumber,
      actorAId: gameWinnerId, // previous game's winner strikes first
      actorAStrikes: 3,
      actorBId: loserId,
      actorBStrikes: 0,
      stagesRemaining: [...COUNTERPICK_STAGES],
    },
  });
  return null;
}
