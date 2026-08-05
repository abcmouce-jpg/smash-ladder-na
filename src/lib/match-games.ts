import { prisma, TX_OPTIONS, withTransientRetry } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { ConfirmationMethod, MatchStatus, UserRole } from "@/generated/prisma/enums";
import { applyEloAndConfirm } from "@/lib/matches";
import { GAME_ONE_STAGES, COUNTERPICK_STAGES } from "@/lib/stages";
import { SMASH_CHARACTERS } from "@/lib/characters";
import { sendDiscordDM } from "@/lib/discord-bot";
import { applyTimeoutCooldown } from "@/lib/queue-cooldown";

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

// How long a match waits for a report before the cron finalizer steps in
// (see autoConfirmStaleGameReport / finalize.ts). Shortened from 24h after
// a batch of sets sat all night with a losing player just never reporting
// — a shorter window means the honest side isn't stuck till the next day.
export const MATCH_TTL_MS = 3 * 60 * 60 * 1000;

// How long a player has to report a finished game's result once its stage is
// decided. Short like STRIKE_TIMEOUT_MS — a live in-session clock, distinct
// from the 3h match-level no-report fallback above: if one side reported and
// the other never confirms, autoResolveStaleGameReport accepts the report and
// charges the silent side a no-show once this elapses. Long enough to actually
// play the game out (a single Smash set game runs ~5 minutes) with time to
// spare for reporting afterwards.
export const REPORT_TIMEOUT_MS = 15 * 60 * 1000;

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
  // The strike/pick clock doesn't apply until both characters are locked in
  // — striking can't even start before then (see bothCharactersLocked), so
  // a turnStartedAt that predates both lock-ins (e.g. the game row's own
  // creation timestamp) should never trigger an auto-resolve here. Stalling
  // on character selection itself is handled separately, by
  // autoResolveStaleCharacterPick.
  if (!bothCharactersLocked(game)) return;
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
  // turnStartedAt marks when the current phase began — resetting it here (and
  // in the pick actions) is what anchors the report clock for the game.
  await prisma.matchGame.updateMany({
    where: { id: game.id, finalStage: null },
    data: { finalStage: stage, turnStartedAt: new Date() },
  });
}

// How long a player has to lock in a character before it costs them the
// game. Longer than STRIKE_TIMEOUT_MS on purpose: picking a stage is one
// click among a handful of options already narrowed down, while picking a
// character means scrolling a full roster and actually deciding — 60s (the
// original value) turned out to forfeit people who were still reading the
// list, with no on-screen warning that a clock was even running (see the
// "Xs left" text in CharacterPickSection). Deliberately not a random
// assignment either way: picking a character for someone is a much bigger
// deal than picking a stage for them.
export const CHARACTER_TIMEOUT_MS = 3 * 60 * 1000;

// Lazy, same pattern as autoResolveStaleTurn. Forfeits the current game to
// whichever side actually locked in a character, once the other side has
// had CHARACTER_TIMEOUT_MS (measured from the game row's creation — the
// moment character selection became available) and still hasn't — mirrors
// autoConfirmStaleGameReport's "accept whoever showed up, penalize the
// ghost" philosophy rather than fabricating a pick for them. If NEITHER
// side has locked in, this deliberately does nothing: that's rare enough
// (both players AFK simultaneously) to just fall through to the existing
// 24h whole-match no-report expiry instead of inventing a second fallback.
async function autoResolveStaleCharacterPick(match: { id: string; player1Id: string; player2Id: string }) {
  const game = await prisma.matchGame.findFirst({
    where: { matchId: match.id, winnerId: null, finalStage: null },
    orderBy: { gameNumber: "desc" },
  });
  if (!game) return;
  if (bothCharactersLocked(game)) return;
  if (Date.now() - game.createdAt.getTime() < CHARACTER_TIMEOUT_MS) return;

  const aLocked = game.actorACharacter !== null;
  const bLocked = game.actorBCharacter !== null;
  if (aLocked === bLocked) return; // neither locked in — leave it to the match-level timeout

  const winnerId = aLocked ? game.actorAId : game.actorBId;
  const ghostId = aLocked ? game.actorBId : game.actorAId;

  const claimed = await withTransientRetry(() =>
    prisma.$transaction(async (tx) => {
      const claim = await tx.matchGame.updateMany({
        where: { id: game.id, winnerId: null },
        data: { winnerId },
      });
      if (claim.count === 0) return false; // already resolved by a racing request
      await progressSet(tx, match, game.gameNumber, winnerId, ConfirmationMethod.AUTO_TIMEOUT);
      await applyTimeoutCooldown(tx, ghostId);
      return true;
    }, TX_OPTIONS),
  );
  if (!claimed) return;

  // Mods get pinged on every one of these, not just when a player happens to
  // complain — this is exactly the kind of silent, easy-to-miss forfeit that
  // slipped by unnoticed before (see adminSetGameWinner/adminResetMatchToZero
  // in disputes.ts for the tools to review or undo it from here).
  const [winner, ghost, mods] = await Promise.all([
    prisma.user.findUnique({ where: { id: winnerId }, select: { username: true } }),
    prisma.user.findUnique({ where: { id: ghostId }, select: { username: true, discordId: true } }),
    prisma.user.findMany({ where: { role: { in: [UserRole.MOD, UserRole.ADMIN] } }, select: { discordId: true } }),
  ]);
  if (!winner || !ghost) return;
  await Promise.all([
    sendDiscordDM(
      ghost.discordId,
      `⏱️ Game ${game.gameNumber} vs ${winner.username} was forfeited to them — you didn't lock in a character in time. If that's wrong (site issue, disconnect, etc.), flag it to a mod.`,
    ),
    ...mods.map((mod) =>
      sendDiscordDM(
        mod.discordId,
        `⏱️ Character-pick forfeit: ${winner.username} awarded game ${game.gameNumber} over ${ghost.username} (match ${match.id}). Review at /admin/live if this looks unfair.`,
      ),
    ),
  ]);
}

// Lazy, same pattern as autoResolveStaleTurn / autoResolveStaleCharacterPick
// — the finalize cron only runs daily, far too coarse for an in-session
// deadline. Once a game's stage is decided, both players have REPORT_TIMEOUT_MS
// to report the result. If exactly one side reported and the other never
// confirmed, accept the report — mirrors autoConfirmStaleGameReport's "accept
// whoever showed up, penalize the ghost" philosophy at game granularity and
// 15-minute scale. If nobody reported, deliberately do nothing: there's no
// fair way to pick a winner from two silent sides, so that falls through to
// the match-level TTL (closeOutUnansweredLead / plain expiry) instead.
// Disputed games (secondReportById set) are a mod's call and are never
// touched here.
async function autoResolveStaleGameReport(match: {
  id: string;
  player1Id: string;
  player2Id: string;
  status: MatchStatus;
}) {
  if (
    match.status !== MatchStatus.PENDING_REPORT &&
    match.status !== MatchStatus.REPORTED
  ) {
    return; // mod-ruled or finished matches shouldn't shift under anyone
  }

  const game = await prisma.matchGame.findFirst({
    where: { matchId: match.id, winnerId: null, finalStage: { not: null } },
    orderBy: { gameNumber: "desc" },
  });
  if (!game) return;
  if (game.secondReportById) return; // disputed — a mod resolves it
  if (!game.reportedById || !game.reportedWinnerId) return; // nobody reported yet
  if (Date.now() - game.turnStartedAt.getTime() < REPORT_TIMEOUT_MS) return;

  const reportedWinnerId = game.reportedWinnerId;
  const nonReporterId =
    game.reportedById === match.player1Id ? match.player2Id : match.player1Id;

  const confirmed = await withTransientRetry(() =>
    prisma.$transaction(async (tx) => {
      const claim = await tx.matchGame.updateMany({
        where: { id: game.id, winnerId: null, reportedById: { not: null } },
        data: { winnerId: reportedWinnerId },
      });
      if (claim.count === 0) return false; // already decided by a racing request
      // If this doesn't decide the whole set, give the match a fresh deadline
      // so it can continue rather than expiring mid-way (same as the cron
      // path in autoConfirmStaleGameReport).
      await tx.ratingMatch.update({
        where: { id: match.id },
        data: { expiresAt: new Date(Date.now() + MATCH_TTL_MS) },
      });
      await progressSet(tx, match, game.gameNumber, reportedWinnerId, ConfirmationMethod.AUTO_TIMEOUT);
      await applyTimeoutCooldown(tx, nonReporterId);
      return true;
    }, TX_OPTIONS),
  );
  if (!confirmed) return;

  // Ghost gets a DM, mods get pinged — same as the character-pick forfeit;
  // this is exactly the kind of silent, easy-to-miss resolution that slips by
  // unnoticed otherwise (see adminSetGameWinner/adminResetMatchToZero in
  // disputes.ts for the tools to review or undo it).
  const [winner, ghost, mods] = await Promise.all([
    prisma.user.findUnique({ where: { id: reportedWinnerId }, select: { username: true } }),
    prisma.user.findUnique({ where: { id: nonReporterId }, select: { username: true, discordId: true } }),
    prisma.user.findMany({ where: { role: { in: [UserRole.MOD, UserRole.ADMIN] } }, select: { discordId: true } }),
  ]);
  if (!winner || !ghost) return;
  await Promise.all([
    sendDiscordDM(
      ghost.discordId,
      `⏱️ Game ${game.gameNumber} vs ${winner.username} was auto-confirmed from their report — you didn't confirm the result in time. If that's wrong (site issue, disconnect, etc.), flag it to a mod.`,
    ),
    ...mods.map((mod) =>
      sendDiscordDM(
        mod.discordId,
        `⏱️ Auto-confirmed report: ${winner.username} awarded game ${game.gameNumber} over ${ghost.username} (match ${match.id}) after they didn't confirm in time. Review at /admin/live if this looks unfair.`,
      ),
    ),
  ]);
}

export async function getMatchGames(matchId: string) {
  await autoResolveStaleTurn(matchId);
  const match = await prisma.ratingMatch.findUnique({
    where: { id: matchId },
    select: { id: true, player1Id: true, player2Id: true, status: true },
  });
  if (match) {
    await autoResolveStaleCharacterPick(match);
    await autoResolveStaleGameReport(match);
  }
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

// Stage selection doesn't start until both sides have locked in a character
// — not just your own. Without this, striking could start blind (fine for
// game 1) while the other side still hasn't picked at all, letting the
// strike-timeout clock tick down against someone who hasn't even reached
// the character screen yet.
export function bothCharactersLocked(game: { actorACharacter: string | null; actorBCharacter: string | null }) {
  return game.actorACharacter !== null && game.actorBCharacter !== null;
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

export type CharacterPickGame = {
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

// Most players stick with the same character for the whole set — pre-fills
// the picker with whatever this player last locked in, most-recent game
// first, so game 1 (no prior game) and a fresh counterpick both just fall
// through to no default.
export function lastUsedCharacter(games: CharacterPickGame[], userId: string): string | null {
  const sorted = [...games].sort((a, b) => b.gameNumber - a.gameNumber);
  for (const game of sorted) {
    const character =
      game.actorAId === userId ? game.actorACharacter : game.actorBId === userId ? game.actorBCharacter : null;
    if (character) return character;
  }
  return null;
}

// Mirrors lastUsedCharacter, but for a player's 3-stage actorA strike turn
// (games 2+, where the previous game's winner strikes 3 from the shared
// COUNTERPICK_STAGES list) — powers the "Same Bans" shortcut. The
// struckStages.length >= 3 check naturally excludes an in-progress current
// turn, so callers don't need to filter that game out themselves.
export function lastSameBans(
  games: { gameNumber: number; actorAId: string; actorAStrikes: number; struckStages: string[] }[],
  userId: string,
): { gameNumber: number; stages: string[] } | null {
  const sorted = [...games].sort((a, b) => b.gameNumber - a.gameNumber);
  for (const game of sorted) {
    if (game.actorAId === userId && game.actorAStrikes === 3 && game.struckStages.length >= 3) {
      return { gameNumber: game.gameNumber, stages: game.struckStages.slice(0, 3) };
    }
  }
  return null;
}

// Mirrors lastSameBans, but for the "Run it back" pick shortcut — the
// immediately preceding game's finalStage, when there is one. Games are
// always numbered sequentially with no gaps, so "the previous game" is
// unambiguous; this doesn't need to scan further back like lastSameBans
// does (a striker's ban history can skip games since Same Bans is opt-in,
// but a decided game's finalStage never gets cleared).
export function lastPlayedStage(
  games: { gameNumber: number; finalStage: string | null }[],
  currentGameNumber: number,
): string | null {
  return games.find((g) => g.gameNumber === currentGameNumber - 1)?.finalStage ?? null;
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
  const opponentAlreadyLocked = (isActorA ? game.actorBCharacter : game.actorACharacter) !== null;

  await prisma.matchGame.updateMany({
    where: {
      id: game.id,
      ...(isActorA ? { actorACharacter: null } : { actorBCharacter: null }),
    },
    data: {
      ...(isActorA ? { actorACharacter: character } : { actorBCharacter: character }),
      // This pick is the second lock-in — start the stage-strike clock now
      // rather than from whenever the game row was created, which could've
      // been arbitrarily long ago if character selection itself took a while.
      ...(opponentAlreadyLocked ? { turnStartedAt: new Date() } : {}),
    },
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
  if (!bothCharactersLocked(game)) throw new Error("Both players must lock in their character before striking a stage");
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

// One-click repeat of the same 3 stages this player struck the last time
// they were in this seat (see lastSameBans) — only usable at the very start
// of the turn, before any manual strikes, so it's all-or-nothing rather
// than a partial-fill.
export async function strikeSameBans(userId: string, matchId: string, gameNumber: number) {
  const game = await requireGame(matchId, gameNumber);
  if (game.finalStage) throw new Error("Stage already decided");
  const actor = actorForStrike(game);
  if (!actor) throw new Error("Striking is done — waiting on a pick");
  if (actor !== userId) throw new Error("Not your turn to strike");
  if (!bothCharactersLocked(game)) throw new Error("Both players must lock in their character before striking a stage");
  if (game.actorAId !== userId || game.actorAStrikes !== 3) {
    throw new Error("Same Bans only applies to a 3-stage strike turn");
  }
  if (game.struckStages.length !== 0) throw new Error("Already struck this turn");

  const allGames = await prisma.matchGame.findMany({ where: { matchId } });
  const sameBans = lastSameBans(allGames, userId);
  if (!sameBans) throw new Error("No prior bans to repeat");
  if (!sameBans.stages.every((s) => game.stagesRemaining.includes(s))) {
    throw new Error("Prior bans are no longer available");
  }

  await prisma.matchGame.updateMany({
    where: { id: game.id, struckStages: { equals: game.struckStages } },
    data: {
      stagesRemaining: game.stagesRemaining.filter((s) => !sameBans.stages.includes(s)),
      struckStages: [...game.struckStages, ...sameBans.stages],
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
  if (!bothCharactersLocked(game)) throw new Error("Both players must lock in their character before picking a stage");
  if (!game.stagesRemaining.includes(stage)) throw new Error("Not a valid remaining stage");

  // turnStartedAt is the report clock's anchor: whoever picks the final stage
  // starts the REPORT_TIMEOUT_MS window to report this game's result.
  await prisma.matchGame.updateMany({
    where: { id: game.id, finalStage: null },
    data: { finalStage: stage, turnStartedAt: new Date() },
  });
}

// "Run it back" — one-click repeat of the previous game's stage, for the
// player whose turn it is to pick. Only works if that stage happens to
// still be in stagesRemaining (the other side's bans this game may have
// taken it off the table).
export async function pickSameStage(userId: string, matchId: string, gameNumber: number) {
  const game = await requireGame(matchId, gameNumber);
  if (game.finalStage) throw new Error("Stage already decided");
  if (actorForStrike(game) !== null) throw new Error("Striking isn't finished yet");
  if (picker(game) !== userId) throw new Error("Not your turn to pick");
  if (!bothCharactersLocked(game)) throw new Error("Both players must lock in their character before picking a stage");

  const allGames = await prisma.matchGame.findMany({ where: { matchId } });
  const stage = lastPlayedStage(allGames, gameNumber);
  if (!stage) throw new Error("No previous game to repeat");
  if (!game.stagesRemaining.includes(stage)) throw new Error("That stage isn't available this game");

  await prisma.matchGame.updateMany({
    where: { id: game.id, finalStage: null },
    data: { finalStage: stage, turnStartedAt: new Date() },
  });
}

type ReportOutcome =
  | { type: "reported"; opponentId: string; reporterId: string }
  // Conflicting second report — the game is contested (players reconcile),
  // NOT yet a mod dispute.
  | { type: "contested"; player1Id: string; player2Id: string }
  // A player re-confirmed their claim in a contested game; nothing else
  // changed, so no notification needed.
  | { type: "confirmed" }
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

      // First report of the game — nothing to reconcile yet.
      if (!game.reportedById) {
        await tx.matchGame.update({
          where: { id: game.id },
          data: { reportedWinnerId: winnerId, reportedById: userId, reportedAt: new Date() },
        });
        return { type: "reported", opponentId, reporterId: userId };
      }

      // Once a game's been escalated, reports no longer apply — it resolves
      // via dispute resolution (or a mod's ruling) instead.
      if (game.disputeRequestedAt) throw new Error("This game is already being reviewed by a mod");

      // The first reporter re-clicking while the opponent still hasn't
      // reported is a duplicate, not a reconciliation.
      if (game.reportedById === userId && !game.secondReportById) {
        throw new Error("You already reported this game");
      }

      const myStoredClaim = game.reportedById === userId ? game.reportedWinnerId : game.secondReportWinnerId;

      // Opponent's first report: agree → the game's decided; disagree → the
      // game becomes contested (players confirm/dispute among themselves)
      // rather than a mod dispute.
      if (!game.secondReportById) {
        if (game.reportedWinnerId === winnerId) {
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
        }

        // A per-game disagreement used to flip the whole game straight to a
        // mod queue (listDisputedGames) on the spot. Now the game is just
        // contested: each player gets asked to re-confirm their claim (or
        // dispute it), so most disagreements get sorted out between the
        // players themselves. The first reporter's claimed winner is still
        // used as a working assumption for the next game's stage-strike
        // order only, so one contested game doesn't freeze the set; the game
        // itself stays unresolved (winnerId null) until the players agree or
        // it's escalated.
        await tx.matchGame.update({
          where: { id: game.id },
          data: { secondReportWinnerId: winnerId, secondReportById: userId, secondReportAt: new Date() },
        });
        await progressSet(tx, match, gameNumber, game.reportedWinnerId!);
        return { type: "contested", player1Id: match.player1Id, player2Id: match.player2Id };
      }

      // Contested game (both reported, disagreed, not yet escalated): a
      // re-click matching the player's own stored claim is a confirmation;
      // the game resolves immediately if a player changes their claim to
      // match the opponent's.
      if (winnerId === myStoredClaim) {
        if (game.reportedById === userId) {
          await tx.matchGame.update({
            where: { id: game.id },
            data: { reporterConfirmedAt: new Date() },
          });
        } else {
          await tx.matchGame.update({
            where: { id: game.id },
            data: { secondReporterConfirmedAt: new Date() },
          });
        }
        const otherConfirmed =
          game.reportedById === userId ? game.secondReporterConfirmedAt : game.reporterConfirmedAt;
        if (!otherConfirmed) return { type: "confirmed" };

        // Both sides re-confirmed their conflicting claims — now it's a real
        // dispute for a mod to review.
        return {
          type: "disputed",
          ...(await escalateContestedGame(tx, match, game.id, gameNumber)),
        };
      }

      // Changed their claim: it now matches the opponent's, so the game is
      // decided in that player's favor.
      if (game.reportedById === userId) {
        await tx.matchGame.update({
          where: { id: game.id },
          data: { reportedWinnerId: winnerId, reportedAt: new Date(), winnerId },
        });
      } else {
        await tx.matchGame.update({
          where: { id: game.id },
          data: { secondReportWinnerId: winnerId, secondReportAt: new Date(), winnerId },
        });
      }

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

// Marks a contested game as under mod review and stamps the match's
// disputeReason — shared by both escalation triggers: both sides re-
// confirming their conflicting claims inside reportGameResult, and the
// lobby's "Dispute this game" button via escalateGameDispute below.
async function escalateContestedGame(
  tx: Prisma.TransactionClient,
  match: { id: string; player1Id: string; player2Id: string },
  gameId: string,
  gameNumber: number,
) {
  await tx.matchGame.update({
    where: { id: gameId },
    data: { disputeRequestedAt: new Date() },
  });
  await tx.ratingMatch.update({
    where: { id: match.id },
    data: { disputeReason: `Disagreement on game ${gameNumber}'s winner` },
  });
  const games = await tx.matchGame.findMany({ where: { matchId: match.id } });
  return {
    player1Id: match.player1Id,
    player2Id: match.player2Id,
    setDecidedDespiteDispute: !!getSetWinnerId(tallySetWins(games)),
  };
}

// The "Dispute this game" button on a contested game in the lobby — skips
// the re-confirmation step and escalates straight to mod review.
export async function escalateGameDispute(userId: string, matchId: string, gameNumber: number) {
  const result = await withTransientRetry(() =>
    prisma.$transaction(async (tx) => {
      const match = await tx.ratingMatch.findUnique({ where: { id: matchId } });
      if (!match) throw new Error("Match not found");
      requireParticipant(match, userId);
      const game = await tx.matchGame.findUnique({
        where: { matchId_gameNumber: { matchId, gameNumber } },
      });
      if (!game) throw new Error("Game not found");
      if (game.winnerId) throw new Error("This game is already decided");
      if (!game.secondReportById) throw new Error("This game isn't contested");
      if (game.disputeRequestedAt) return null; // already under review — no-op
      return escalateContestedGame(tx, match, game.id, gameNumber);
    }, TX_OPTIONS),
  );
  if (result) {
    await notifyDisputeEscalated(result.player1Id, result.player2Id, gameNumber, result.setDecidedDespiteDispute);
  }
}

// Disputes and a fresh report both get a DM — the report reminder exists
// so a player who's just genuinely forgotten to open the site gets nudged
// before the no-report timeout charges them a no-show, rather than the
// other side being stuck waiting with no idea whether the opponent even
// saw it. A conflicting second report (contested) DMs both sides with the
// confirm-or-dispute prompt but NOT the mods — mods only get pinged once
// the game is actually escalated. game_won/set_confirmed stay unannounced
// — nothing time-sensitive there, players already see it in the lobby.
async function notifyReportOutcome(outcome: ReportOutcome, gameNumber: number) {
  if (outcome.type === "reported") {
    const [opponent, reporter] = await Promise.all([
      prisma.user.findUnique({ where: { id: outcome.opponentId }, select: { discordId: true } }),
      prisma.user.findUnique({ where: { id: outcome.reporterId }, select: { username: true } }),
    ]);
    if (opponent && reporter) {
      await sendDiscordDM(
        opponent.discordId,
        `⏱️ ${reporter.username} reported game ${gameNumber}'s result. Confirm or dispute it in the Lobby — if you don't respond within ${REPORT_TIMEOUT_MS / 60_000} minutes it auto-confirms and you're charged a no-show.`,
      );
    }
    return;
  }
  if (outcome.type === "contested") {
    const [p1, p2] = await Promise.all([
      prisma.user.findUnique({ where: { id: outcome.player1Id }, select: { discordId: true, username: true } }),
      prisma.user.findUnique({ where: { id: outcome.player2Id }, select: { discordId: true, username: true } }),
    ]);
    if (!p1 || !p2) return;
    await Promise.all([
      sendDiscordDM(
        p1.discordId,
        `⚠️ You and ${p2.username} reported different results for game ${gameNumber}. Open the Lobby and re-confirm your result, or dispute it for a mod to review.`,
      ),
      sendDiscordDM(
        p2.discordId,
        `⚠️ You and ${p1.username} reported different results for game ${gameNumber}. Open the Lobby and re-confirm your result, or dispute it for a mod to review.`,
      ),
    ]);
    return;
  }
  if (outcome.type !== "disputed") return;
  await notifyDisputeEscalated(outcome.player1Id, outcome.player2Id, gameNumber, outcome.setDecidedDespiteDispute);
}

async function notifyDisputeEscalated(
  player1Id: string,
  player2Id: string,
  gameNumber: number,
  setDecidedDespiteDispute: boolean,
) {
  const [p1, p2] = await Promise.all([
    prisma.user.findUnique({ where: { id: player1Id }, select: { discordId: true, username: true } }),
    prisma.user.findUnique({ where: { id: player2Id }, select: { discordId: true, username: true } }),
  ]);
  if (!p1 || !p2) return;

  const continuation = setDecidedDespiteDispute
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
): Promise<{ nonReporterId: string; reporterId: string; gameNumber: number } | null> {
  // secondReportById: null — a game the opponent already contested (or one
  // escalated to mods) must never be auto-confirmed off the first reporter's
  // claim; those are exactly the games that need the players (or a mod) to
  // settle them.
  const hangingGame = await prisma.matchGame.findFirst({
    where: { matchId: match.id, winnerId: null, reportedById: { not: null }, secondReportById: null },
    orderBy: { gameNumber: "desc" },
  });
  if (!hangingGame?.reportedWinnerId || !hangingGame.reportedById) return null;

  const reportedWinnerId = hangingGame.reportedWinnerId;
  const nonReporterId =
    hangingGame.reportedById === match.player1Id ? match.player2Id : match.player1Id;

  const claimed = await withTransientRetry(() =>
    prisma.$transaction(async (tx) => {
      // Atomic claim: the cron finalizer can overlap with itself (a slow run
      // still in flight when the next scheduled one starts) or run alongside
      // a lazy autoResolve* triggered by someone loading the lobby. Without
      // this, two callers racing on the same stale game would both see
      // winnerId: null, both "win", and both fire progressSet/DM/cooldown —
      // duplicate rating changes and duplicate mod DMs for one event. The
      // conditional updateMany makes only the first one actually claim it.
      const claim = await tx.matchGame.updateMany({
        where: { id: hangingGame.id, winnerId: null },
        data: { winnerId: reportedWinnerId },
      });
      if (claim.count === 0) return false;
      await tx.ratingMatch.update({
        where: { id: match.id },
        data: { expiresAt: new Date(now.getTime() + MATCH_TTL_MS) },
      });
      await progressSet(tx, match, hangingGame.gameNumber, reportedWinnerId, ConfirmationMethod.AUTO_TIMEOUT);
      await applyTimeoutCooldown(tx, nonReporterId, now);
      return true;
    }, TX_OPTIONS),
  );
  if (!claimed) return null;

  return { nonReporterId, reporterId: hangingGame.reportedById, gameNumber: hangingGame.gameNumber };
}

// Called by the cron finalizer for a PENDING_REPORT match past its deadline
// that autoConfirmStaleGameReport didn't handle (no hanging report to
// accept) — e.g. a player already up 1-0 or 2-0 just stopped bothering to
// keep locking in characters once their opponent vanished, so no further
// game ever got far enough to report. Rather than letting a set that's
// entirely one-sided so far expire with no impact for either side, award it
// to whoever has confirmed wins when the other side has none at all — a
// genuinely contested score (both sides with at least one win, or neither)
// is left alone to expire as before, since there's no clear winner to hand
// it to.
export async function closeOutUnansweredLead(
  match: { id: string; player1Id: string; player2Id: string },
  now: Date,
): Promise<{ winnerId: string; loserId: string } | null> {
  const games = await prisma.matchGame.findMany({ where: { matchId: match.id }, select: { winnerId: true } });
  const wins = tallySetWins(games);
  const p1Wins = wins[match.player1Id] ?? 0;
  const p2Wins = wins[match.player2Id] ?? 0;

  // If the current game has a conflicting second report (contested, or
  // escalated to mods), neither side "vanished" — both already reported on
  // the unresolved game, and awarding the set to whoever's ahead would
  // quietly override that disagreement. Leave it for the mods instead.
  const unresolvedContest = await prisma.matchGame.findFirst({
    where: { matchId: match.id, winnerId: null, secondReportById: { not: null } },
    select: { id: true },
  });
  if (unresolvedContest) return null;

  const winnerId = p1Wins > 0 && p2Wins === 0 ? match.player1Id : p2Wins > 0 && p1Wins === 0 ? match.player2Id : null;
  if (!winnerId) return null;
  const loserId = winnerId === match.player1Id ? match.player2Id : match.player1Id;

  const claimed = await withTransientRetry(() =>
    prisma.$transaction(async (tx) => {
      // Same overlap risk as autoConfirmStaleGameReport above, plus one more:
      // if a concurrent autoConfirmStaleGameReport call won the race on this
      // same match first, it bumps expiresAt into the future (the set isn't
      // over, just progressing) and returns null to its own caller — which
      // then falls through to closeOutUnansweredLead here. reportedWinnerId
      // alone wouldn't catch that (autoConfirm never touches it), so also
      // require expiresAt to still be <= now: if it's been pushed out, this
      // match was already handled and there's nothing left to close out.
      const claim = await tx.ratingMatch.updateMany({
        where: { id: match.id, reportedWinnerId: null, expiresAt: { lte: now } },
        data: { reportedWinnerId: winnerId, reportedById: winnerId, reportedAt: now },
      });
      if (claim.count === 0) return false;
      await applyEloAndConfirm(tx, match, winnerId, ConfirmationMethod.AUTO_TIMEOUT, null);
      await applyTimeoutCooldown(tx, loserId, now);
      return true;
    }, TX_OPTIONS),
  );
  if (!claimed) return null;

  return { winnerId, loserId };
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
  // A pending mutual-cancel request (see requestMutualCancel) only reflects
  // consent at the moment it was made. Without this, a request from early in
  // the set — made and then declined, with play continuing normally — stays
  // "live" forever and can be accepted by the other side well after the
  // fact. Real incident: a player asked to cancel at the very start, the
  // opponent said no and they played the set out, the asker won 3-1, and the
  // opponent later accepted the stale request to void the result instead of
  // the loss standing. Clearing both sides here (a game just got decided)
  // means cancelling past this point needs a fresh, contemporaneous ask.
  await tx.ratingMatch.update({
    where: { id: match.id },
    data: { player1CancelRequestedAt: null, player2CancelRequestedAt: null },
  });

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

  const nextGameNumber = decidedGameNumber + 1;
  // Guards against a real incident: a mod clearing an earlier game's winner
  // via adminSetGameWinner (e.g. to let a disputed game be replayed) doesn't
  // touch whatever later game already got created off the old outcome — so
  // re-deciding that earlier game here would otherwise crash on the
  // [matchId, gameNumber] unique constraint. If the next game's already
  // there, just leave it alone rather than erroring out the whole report.
  if (games.some((g) => g.gameNumber === nextGameNumber)) return null;

  const loserId = gameWinnerId === match.player1Id ? match.player2Id : match.player1Id;
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
