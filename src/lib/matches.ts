import { prisma, TX_OPTIONS, withTransientRetry } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { MatchStatus, ConfirmationMethod, PairingMethod, UserRole } from "@/generated/prisma/enums";
import { isWiredClaimUntrustworthy } from "@/lib/account";
import { getBlockedEitherWayIds } from "@/lib/blocks";
import { createDirectMatch } from "@/lib/lobby";
import { sendDiscordDM } from "@/lib/discord-bot";

// Used as `include`, which already returns every scalar column (leftAt,
// rematchRequestedAt, etc.) by default — no need to list them here, and
// doing so breaks the query since `include` only accepts relation fields.
export const matchWithPlayers = {
  player1: {
    select: { id: true, username: true, avatarUrl: true, rating: true, arenaPassword: true, mainCharacter: true },
  },
  player2: {
    select: { id: true, username: true, avatarUrl: true, rating: true, arenaPassword: true, mainCharacter: true },
  },
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
// progress and nothing's actually happened yet — no rating impact either
// way. Once any game has a decided winner OR someone's filed a report on
// one (even if not yet finalized), cancelling is blocked: a player who's
// losing (or has just been reported as having lost) shouldn't be able to
// erase the set out from under a pending/decided result instead of
// reporting or disputing it. (A real incident: a player down 2 games, with
// the 4th already reported against them, cancelled instead of letting it
// confirm — no Elo was ever applied for a match they'd clearly lost.)
export async function cancelMatch(userId: string, matchId: string) {
  const match = await prisma.ratingMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Match not found");
  if (match.player1Id !== userId && match.player2Id !== userId) {
    throw new Error("Not a participant in this match");
  }
  // REPORTED is legacy (pre-BO3) status that nothing in the current app
  // writes anymore, but old rows can still carry it — treated the same as
  // PENDING_REPORT here so a match can never get permanently stuck just
  // because of its status value.
  if (match.status !== MatchStatus.PENDING_REPORT && match.status !== MatchStatus.REPORTED) {
    throw new Error("This match can no longer be cancelled");
  }

  const gameInProgress = await prisma.matchGame.findFirst({
    where: { matchId, OR: [{ winnerId: { not: null } }, { reportedById: { not: null } }] },
  });
  if (gameInProgress) {
    throw new Error(
      "Can't cancel once a game has been decided or reported — report the result or dispute it instead.",
    );
  }

  const [, updatedUser] = await prisma.$transaction([
    prisma.ratingMatch.update({ where: { id: matchId }, data: { status: MatchStatus.CANCELLED } }),
    prisma.user.update({ where: { id: userId }, data: { cancelCount: { increment: 1 } } }),
  ]);

  // A self-declared wired connection stops being credible once cancels
  // pile up — clear it rather than keep pairing others against a stale claim.
  if (updatedUser.wiredConnection && isWiredClaimUntrustworthy(updatedUser.cancelCount, updatedUser.gamesPlayed)) {
    await prisma.user.update({ where: { id: userId }, data: { wiredConnection: false } });
  }
}

// Once a set is over, either player may still want to keep chatting —
// leaving only hides that player's own view of the match; it has no effect
// on the other player's access. No status check: the Leave button is only
// ever rendered for terminal matches, so this never gets called early.
export async function leaveMatch(userId: string, matchId: string) {
  const match = await prisma.ratingMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Match not found");
  if (match.player1Id !== userId && match.player2Id !== userId) {
    throw new Error("Not a participant in this match");
  }

  const isPlayer1 = match.player1Id === userId;
  if (isPlayer1 ? match.player1LeftAt : match.player2LeftAt) return;

  // Leaving also voids any pending rematch request of mine — otherwise the
  // opponent could still "accept" it later into a match I've already walked
  // away from.
  await prisma.ratingMatch.update({
    where: { id: matchId },
    data: isPlayer1
      ? { player1LeftAt: new Date(), player1RematchRequestedAt: null }
      : { player2LeftAt: new Date(), player2RematchRequestedAt: null },
  });
}

// Once a set is over, either player may ask to play the same opponent again.
// The first ask just records itself; the second (from the other player) —
// as long as neither has left and they aren't blocked either-way — creates
// the next match immediately.
export async function requestRematch(userId: string, matchId: string) {
  const match = await prisma.ratingMatch.findUnique({ where: { id: matchId } });
  if (!match) throw new Error("Match not found");
  if (match.player1Id !== userId && match.player2Id !== userId) {
    throw new Error("Not a participant in this match");
  }
  if (
    match.status !== MatchStatus.CONFIRMED &&
    match.status !== MatchStatus.CANCELLED &&
    match.status !== MatchStatus.EXPIRED
  ) {
    throw new Error("This match hasn't finished yet");
  }

  const isPlayer1 = match.player1Id === userId;
  if (isPlayer1 ? match.player1LeftAt : match.player2LeftAt) {
    throw new Error("You've left this match");
  }
  if (isPlayer1 ? match.player1RematchRequestedAt : match.player2RematchRequestedAt) return;

  const opponentId = isPlayer1 ? match.player2Id : match.player1Id;

  await withTransientRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.ratingMatch.update({
        where: { id: matchId },
        data: isPlayer1
          ? { player1RematchRequestedAt: new Date() }
          : { player2RematchRequestedAt: new Date() },
      });

      // Re-read within the transaction so a since-committed opponent request
      // (the common case — their click happened earlier, not concurrently)
      // is picked up even though the initial read above predates it.
      const fresh = await tx.ratingMatch.findUniqueOrThrow({ where: { id: matchId } });
      const opponentRequestedAt = isPlayer1
        ? fresh.player2RematchRequestedAt
        : fresh.player1RematchRequestedAt;
      const opponentLeftAt = isPlayer1 ? fresh.player2LeftAt : fresh.player1LeftAt;
      if (!opponentRequestedAt || opponentLeftAt) return;

      const blockedIds = await getBlockedEitherWayIds(userId);
      if (blockedIds.includes(opponentId)) return;

      await createDirectMatch(tx, match.player1Id, match.player2Id, PairingMethod.REMATCH);
    }, TX_OPTIONS),
  );
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

// How recently an account must have been created (relative to the match
// starting) — combined with almost no other match history — to read as a
// disposable alt rather than a real new player. 24h comfortably covers
// "signed up specifically for this", while not flagging every genuine
// newcomer who happens to play their first match same-day.
const SELF_BOOST_NEW_ACCOUNT_WINDOW_MS = 24 * 60 * 60 * 1000;
const SELF_BOOST_LOW_HISTORY_GAMES = 1;

// Best-effort heuristic for the JerBear-style abuse pattern (a player
// creates a disposable alt account and matches/plays against themselves for
// free rating) — same two signals that actually caught that incident: the
// two accounts sharing a last-known IP, or one side being a barely-used
// account created right before this match. Never blocks anything, only
// alerts — same-IP roommates/LAN setups are a real false positive here, so
// this is a lead for a mod to check, not an automatic verdict.
//
// Deliberately NOT awaited by its caller (see below applyEloAndConfirm) and
// uses the module-level prisma client rather than the surrounding tx: this
// runs its own queries and Discord sends after the interactive transaction
// that confirmed the match may have already committed. Awaiting Discord's
// API from inside that transaction once blew its 5s timeout in production
// (P2028) and rolled back an otherwise-fine confirmation — never again.
async function flagPossibleSelfBoost(
  match: { id: string; createdAt: Date },
  p1: { id: string; username: string; lastKnownIp: string | null; gamesPlayed: number; createdAt: Date },
  p2: { id: string; username: string; lastKnownIp: string | null; gamesPlayed: number; createdAt: Date },
) {
  const reasons: string[] = [];
  if (p1.lastKnownIp && p1.lastKnownIp === p2.lastKnownIp) {
    reasons.push("both accounts share the same last-known IP");
  }
  for (const [fresh] of [[p1], [p2]] as const) {
    const accountAgeMs = match.createdAt.getTime() - fresh.createdAt.getTime();
    if (
      accountAgeMs >= 0 &&
      accountAgeMs < SELF_BOOST_NEW_ACCOUNT_WINDOW_MS &&
      fresh.gamesPlayed <= SELF_BOOST_LOW_HISTORY_GAMES
    ) {
      reasons.push(`${fresh.username}'s account was created shortly before this match and has almost no other match history`);
    }
  }
  if (reasons.length === 0) return;

  const mods = await prisma.user.findMany({
    where: { role: { in: [UserRole.MOD, UserRole.ADMIN] } },
    select: { discordId: true },
  });
  const message = `🕵️ Possible self-boost: ${p1.username} vs ${p2.username} (match ${match.id}) — ${reasons.join("; ")}. Review at /admin/live or the players' profiles.`;
  await Promise.all(mods.map((mod) => sendDiscordDM(mod.discordId, message)));
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
  const [p1, p2, season, matchRow] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: match.player1Id } }),
    tx.user.findUniqueOrThrow({ where: { id: match.player2Id } }),
    tx.season.findFirst({ where: { endsAt: null }, orderBy: { startsAt: "desc" } }),
    tx.ratingMatch.findUniqueOrThrow({
      where: { id: match.id },
      select: { createdAt: true, player1IsPracticing: true, player2IsPracticing: true },
    }),
  ]);
  // Stamped at confirm time (not creation), since that's when the result
  // actually counts — falls back to creating Season 1 if none exists yet.
  const seasonId = season?.id ?? (await tx.season.create({ data: { name: "Season 1" } })).id;

  // A side that queued isPracticing reads from and writes to its separate
  // practiceRating/practiceGamesPlayed track instead of rating/gamesPlayed —
  // independently per side, since a practicing player can face a normal
  // opponent. Both pools are the same 1500-baseline Elo scale, so comparing
  // one side's practiceRating against the other's main rating is valid math,
  // not a units mismatch.
  const p1Rating = matchRow.player1IsPracticing ? p1.practiceRating : p1.rating;
  const p2Rating = matchRow.player2IsPracticing ? p2.practiceRating : p2.rating;
  const p1Games = matchRow.player1IsPracticing ? p1.practiceGamesPlayed : p1.gamesPlayed;
  const p2Games = matchRow.player2IsPracticing ? p2.practiceGamesPlayed : p2.gamesPlayed;

  const p1Won = winnerId === p1.id;
  const expected1 = expectedScore(p1Rating, p2Rating);
  const expected2 = 1 - expected1;
  const score1 = p1Won ? 1 : 0;
  const score2 = p1Won ? 0 : 1;

  const p1After = Math.round(p1Rating + kFactor(p1Games) * (score1 - expected1));
  const p2After = Math.round(p2Rating + kFactor(p2Games) * (score2 - expected2));

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
      player1RatingBefore: p1Rating,
      player1RatingAfter: p1After,
      player2RatingBefore: p2Rating,
      player2RatingAfter: p2After,
    },
  });

  await tx.user.update({
    where: { id: p1.id },
    data: matchRow.player1IsPracticing
      ? { practiceRating: p1After, practiceGamesPlayed: { increment: 1 } }
      : { rating: p1After, gamesPlayed: { increment: 1 } },
  });
  await tx.user.update({
    where: { id: p2.id },
    data: matchRow.player2IsPracticing
      ? { practiceRating: p2After, practiceGamesPlayed: { increment: 1 } }
      : { rating: p2After, gamesPlayed: { increment: 1 } },
  });

  // RatingHistory backs the main "rating over time" chart and peak-rating
  // stat — a practicing side's numbers have no business in there, so it
  // just doesn't get a row this match (no practice-rating chart exists yet).
  const historyRows = [
    ...(matchRow.player1IsPracticing
      ? []
      : [{ userId: p1.id, matchId: match.id, ratingBefore: p1Rating, ratingAfter: p1After, delta: p1After - p1Rating }]),
    ...(matchRow.player2IsPracticing
      ? []
      : [{ userId: p2.id, matchId: match.id, ratingBefore: p2Rating, ratingAfter: p2After, delta: p2After - p2Rating }]),
  ];
  if (historyRows.length > 0) {
    await tx.ratingHistory.createMany({ data: historyRows });
  }

  // Self-boosting a practice rating has no real payoff (it never touches
  // rank), so skip mods getting paged over it.
  if (!matchRow.player1IsPracticing && !matchRow.player2IsPracticing) {
    // Fire-and-forget — see the comment on flagPossibleSelfBoost for why this
    // must never be awaited from inside this transaction.
    flagPossibleSelfBoost({ id: match.id, createdAt: matchRow.createdAt }, p1, p2).catch(() => {});
  }
}

// Only reachable while `match` is still each player's most recent CONFIRMED
// match (enforced by callers) — recomputes Elo from the SAME pre-match
// ratings the original confirmation used (player{1,2}RatingBefore), just
// with the winner swapped, then overwrites in place. Never touches
// gamesPlayed (this isn't a new game) and never revisits any other match,
// so it can't disturb a later match that already built on this one's result.
async function applyCorrection(
  tx: Prisma.TransactionClient,
  match: {
    id: string;
    player1Id: string;
    player2Id: string;
    player1RatingBefore: number | null;
    player2RatingBefore: number | null;
  },
  winnerId: string,
) {
  const [p1, p2] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: match.player1Id } }),
    tx.user.findUniqueOrThrow({ where: { id: match.player2Id } }),
  ]);
  // gamesPlayed already carries this match's own +1 from the original
  // confirmation — subtract it back out to match the kFactor tier the
  // original calculation used.
  const p1RatingBefore = match.player1RatingBefore ?? p1.rating;
  const p2RatingBefore = match.player2RatingBefore ?? p2.rating;
  const p1GamesBefore = Math.max(0, p1.gamesPlayed - 1);
  const p2GamesBefore = Math.max(0, p2.gamesPlayed - 1);

  const p1Won = winnerId === p1.id;
  const expected1 = expectedScore(p1RatingBefore, p2RatingBefore);
  const expected2 = 1 - expected1;
  const score1 = p1Won ? 1 : 0;
  const score2 = p1Won ? 0 : 1;

  const p1After = Math.round(p1RatingBefore + kFactor(p1GamesBefore) * (score1 - expected1));
  const p2After = Math.round(p2RatingBefore + kFactor(p2GamesBefore) * (score2 - expected2));

  await tx.ratingMatch.update({
    where: { id: match.id },
    data: {
      reportedWinnerId: winnerId,
      secondReportWinnerId: winnerId,
      confirmationMethod: ConfirmationMethod.CORRECTED,
      player1RatingAfter: p1After,
      player2RatingAfter: p2After,
      correctionWinnerId: null,
      correctionReportedById: null,
      correctionReportedAt: null,
      correctionSecondWinnerId: null,
      correctionSecondReportedById: null,
      correctionSecondReportedAt: null,
      correctionDisputed: false,
    },
  });

  await tx.user.update({ where: { id: p1.id }, data: { rating: p1After } });
  await tx.user.update({ where: { id: p2.id }, data: { rating: p2After } });

  await tx.ratingHistory.createMany({
    data: [
      { userId: p1.id, matchId: match.id, ratingBefore: p1.rating, ratingAfter: p1After, delta: p1After - p1.rating },
      { userId: p2.id, matchId: match.id, ratingBefore: p2.rating, ratingAfter: p2After, delta: p2After - p2.rating },
    ],
  });
}

// A CONFIRMED match is only correctable while it's still each side's most
// recent CONFIRMED result — otherwise reversing and reapplying Elo here
// would need to ripple through every later match that already built on this
// one's rating change, which nothing in this codebase attempts. Also
// requires the match's season to still be the active one: ending a season
// hard-resets every User's rating/gamesPlayed (see endActiveSeasonAndStartNext),
// so a match from an already-ended season has nothing live left to reverse
// against — reapplying Elo from its stored before-ratings would silently
// corrupt whatever the new season already built up.
async function isMostRecentConfirmedMatch(
  tx: Prisma.TransactionClient,
  match: { id: string; player1Id: string; player2Id: string; confirmedAt: Date | null; seasonId: string | null },
) {
  if (!match.confirmedAt) return false;
  const [newer, activeSeason] = await Promise.all([
    tx.ratingMatch.findFirst({
      where: {
        id: { not: match.id },
        status: MatchStatus.CONFIRMED,
        confirmedAt: { gt: match.confirmedAt },
        OR: [
          { player1Id: match.player1Id },
          { player2Id: match.player1Id },
          { player1Id: match.player2Id },
          { player2Id: match.player2Id },
        ],
      },
    }),
    tx.season.findFirst({ where: { endsAt: null }, orderBy: { startsAt: "desc" } }),
  ]);
  return newer === null && match.seasonId !== null && match.seasonId === activeSeason?.id;
}

// Same both-must-agree shape as the original report/secondReport flow, just
// usable after CONFIRMED: the first correction request just records itself
// and waits. The second (from the other participant) either matches — Elo
// gets reversed and reapplied immediately, same as a normal auto-confirm —
// or doesn't, in which case both claims are kept and correctionDisputed
// flags it for a mod (see resolveMatchCorrection).
export async function requestResultCorrection(userId: string, matchId: string, winnerId: string) {
  return prisma.$transaction(async (tx) => {
    const match = await tx.ratingMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new Error("Match not found");
    if (match.player1Id !== userId && match.player2Id !== userId) {
      throw new Error("Not a participant in this match");
    }
    if (match.status !== MatchStatus.CONFIRMED) {
      throw new Error("Only a confirmed match's result can be corrected");
    }
    if (match.correctionDisputed) {
      throw new Error("This match's correction is already disputed and awaiting a mod");
    }
    await assertCorrectable(tx, match, winnerId);

    if (!match.correctionReportedById || match.correctionReportedById === userId) {
      // First request, or this same player revising their own pending one.
      await tx.ratingMatch.update({
        where: { id: matchId },
        data: { correctionWinnerId: winnerId, correctionReportedById: userId, correctionReportedAt: new Date() },
      });
      return { applied: false };
    }

    if (winnerId === match.correctionWinnerId) {
      await applyCorrection(tx, match, winnerId);
      return { applied: true };
    }

    await tx.ratingMatch.update({
      where: { id: matchId },
      data: {
        correctionSecondWinnerId: winnerId,
        correctionSecondReportedById: userId,
        correctionSecondReportedAt: new Date(),
        correctionDisputed: true,
      },
    });
    return { applied: false, disputed: true };
  });
}

async function assertCorrectable(
  tx: Prisma.TransactionClient,
  match: { id: string; player1Id: string; player2Id: string; confirmedAt: Date | null; seasonId: string | null },
  winnerId: string,
) {
  if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
    throw new Error("Winner must be one of the two players");
  }
  if (!(await isMostRecentConfirmedMatch(tx, match))) {
    throw new Error(
      "Can't change this match — either a newer match has been confirmed since, or the season has ended.",
    );
  }
}

// Mod-only path for a disputed correction (the two sides' correction
// requests disagreed) — same isMostRecentConfirmedMatch guard, since time
// can still pass while it sits in the mod queue.
export async function resolveMatchCorrection(matchId: string, winnerId: string) {
  await prisma.$transaction(async (tx) => {
    const match = await tx.ratingMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new Error("Match not found");
    if (!match.correctionDisputed) throw new Error("This match has no disputed correction");
    await assertCorrectable(tx, match, winnerId);
    await applyCorrection(tx, match, winnerId);
  });
}

// Unconditional mod override — unlike resolveMatchCorrection, doesn't
// require correctionDisputed or either player to have requested anything.
// Same Elo-safety guard applies regardless of who's asking: reversing and
// reapplying only stays correct while this is still the most recent
// CONFIRMED match for both players in an still-active season.
export async function adminOverrideMatchResult(matchId: string, winnerId: string) {
  await prisma.$transaction(async (tx) => {
    const match = await tx.ratingMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new Error("Match not found");
    if (match.status !== MatchStatus.CONFIRMED) {
      throw new Error("Only a confirmed match's result can be changed this way");
    }
    await assertCorrectable(tx, match, winnerId);
    await applyCorrection(tx, match, winnerId);
  });
}

// Escape hatch for the common "purgatory" case: a set actually finished but
// nobody ever clicked through the site's per-game report flow (or only one
// side did and the other ghosted entirely), so no "hanging report" exists
// for the 24h cron to auto-confirm — the match just sits there, or expires
// with no rating impact for either side. A mod can pick the winner directly
// and close it out, independent of whatever (if any) game data exists.
// Deliberately doesn't touch MatchGame rows — this is about the set result,
// not reconstructing exactly how each game went.
export async function adminForceConfirmMatch(matchId: string, winnerId: string) {
  await prisma.$transaction(async (tx) => {
    const match = await tx.ratingMatch.findUnique({ where: { id: matchId } });
    if (!match) throw new Error("Match not found");
    if (match.status === MatchStatus.CONFIRMED || match.status === MatchStatus.CANCELLED) {
      throw new Error("This match is already closed out");
    }
    if (winnerId !== match.player1Id && winnerId !== match.player2Id) {
      throw new Error("Winner must be one of the two players");
    }
    // reportedWinnerId is what getPlayerMatchHistory's win/loss badge and
    // rivals record key off — applyEloAndConfirm itself doesn't set it
    // (every other caller sets it first), so leaving this out silently
    // showed the winner as a loss on their own profile despite the rating
    // gain going through correctly.
    await tx.ratingMatch.update({
      where: { id: matchId },
      data: { reportedWinnerId: winnerId, reportedById: winnerId, reportedAt: new Date() },
    });
    await applyEloAndConfirm(tx, match, winnerId, ConfirmationMethod.ADMIN_RESOLVED, null);
  });
}

export async function listDisputedCorrections() {
  return prisma.ratingMatch.findMany({
    where: { correctionDisputed: true },
    orderBy: { correctionSecondReportedAt: "desc" },
    include: matchWithPlayers,
  });
}
