// Flips the winner of a single already-CONFIRMED match, then correctly
// recomputes Elo forward through every match transitively connected to
// either participant from that point on (their own subsequent matches, and
// their opponents' subsequent matches, and so on) — something nothing else
// in this codebase does (see the comment on isMostRecentConfirmedMatch in
// matches.ts), because normal admin edits are only allowed on a player's
// most-recent CONFIRMED match precisely to avoid needing this.
import { Prisma } from "@/generated/prisma/client";
import { MatchStatus, ConfirmationMethod } from "@/generated/prisma/enums";
import { eloDelta, expectedScore } from "@/lib/matches";

export async function findAffectedChain(
  tx: Prisma.TransactionClient,
  targetMatchId: string,
) {
  const target = await tx.ratingMatch.findUniqueOrThrow({ where: { id: targetMatchId } });
  if (target.status !== MatchStatus.CONFIRMED || !target.confirmedAt) {
    throw new Error("Target match is not CONFIRMED");
  }
  const cutoff = target.confirmedAt;

  const affectedPlayers = new Set([target.player1Id, target.player2Id]);
  const affectedMatchIds = new Set<string>([target.id]);
  let changed = true;
  while (changed) {
    changed = false;
    const candidates = await tx.ratingMatch.findMany({
      where: {
        status: MatchStatus.CONFIRMED,
        confirmedAt: { gte: cutoff },
        OR: [{ player1Id: { in: [...affectedPlayers] } }, { player2Id: { in: [...affectedPlayers] } }],
      },
      select: { id: true, player1Id: true, player2Id: true },
    });
    for (const m of candidates) {
      if (!affectedMatchIds.has(m.id)) {
        affectedMatchIds.add(m.id);
        changed = true;
      }
      if (!affectedPlayers.has(m.player1Id)) {
        affectedPlayers.add(m.player1Id);
        changed = true;
      }
      if (!affectedPlayers.has(m.player2Id)) {
        affectedPlayers.add(m.player2Id);
        changed = true;
      }
    }
  }

  const matches = await tx.ratingMatch.findMany({
    where: { id: { in: [...affectedMatchIds] } },
    orderBy: { confirmedAt: "asc" },
  });
  return { target, cutoff, affectedPlayers, matches };
}

export type EloFixResult = {
  matchCount: number;
  finalRatings: [string, number][];
};

// Runs entirely inside the caller's transaction. Pass dryRun to compute and
// return the result without needing a second code path — the caller decides
// whether to let the transaction commit or roll it back.
export async function applyEloChainFix(
  tx: Prisma.TransactionClient,
  matchId: string,
  winnerId: string,
): Promise<EloFixResult> {
  const { target, matches } = await findAffectedChain(tx, matchId);
  if (winnerId !== target.player1Id && winnerId !== target.player2Id) {
    throw new Error("winnerId must be a participant in the target match");
  }

  // gamesPlayed-before-cutoff, per affected user, counted only over their
  // own NON-practicing CONFIRMED matches (kFactor tier depends on this, and
  // it's a historical fact this correction never touches).
  const affectedUserIds = [...new Set(matches.flatMap((m) => [m.player1Id, m.player2Id]))];
  const gamesBeforeCutoff = new Map<string, number>();
  for (const uid of affectedUserIds) {
    const count = await tx.ratingMatch.count({
      where: {
        status: MatchStatus.CONFIRMED,
        confirmedAt: { lt: target.confirmedAt! },
        OR: [
          { player1Id: uid, player1IsPracticing: false },
          { player2Id: uid, player2IsPracticing: false },
        ],
      },
    });
    gamesBeforeCutoff.set(uid, count);
  }

  const gamesProcessed = new Map<string, number>();
  const currentRating = new Map<string, number>();

  for (const m of matches) {
    const isTarget = m.id === target.id;
    const p1Practicing = m.player1IsPracticing;
    const p2Practicing = m.player2IsPracticing;

    const p1Before = p1Practicing ? m.player1RatingBefore! : (currentRating.get(m.player1Id) ?? m.player1RatingBefore!);
    const p2Before = p2Practicing ? m.player2RatingBefore! : (currentRating.get(m.player2Id) ?? m.player2RatingBefore!);

    const winner = isTarget ? winnerId : m.reportedWinnerId!;
    const p1Won = winner === m.player1Id;

    let p1After = m.player1RatingAfter!;
    let p2After = m.player2RatingAfter!;

    if (!p1Practicing) {
      const gamesBefore = (gamesBeforeCutoff.get(m.player1Id) ?? 0) + (gamesProcessed.get(m.player1Id) ?? 0);
      const expected = expectedScore(p1Before, p2Before);
      p1After = Math.round(p1Before + eloDelta(gamesBefore, p1Won ? 1 : 0, expected));
      currentRating.set(m.player1Id, p1After);
      gamesProcessed.set(m.player1Id, (gamesProcessed.get(m.player1Id) ?? 0) + 1);
    }
    if (!p2Practicing) {
      const gamesBefore = (gamesBeforeCutoff.get(m.player2Id) ?? 0) + (gamesProcessed.get(m.player2Id) ?? 0);
      const expected = expectedScore(p2Before, p1Before);
      p2After = Math.round(p2Before + eloDelta(gamesBefore, p1Won ? 0 : 1, expected));
      currentRating.set(m.player2Id, p2After);
      gamesProcessed.set(m.player2Id, (gamesProcessed.get(m.player2Id) ?? 0) + 1);
    }

    await tx.ratingMatch.update({
      where: { id: m.id },
      data: {
        player1RatingBefore: p1Before,
        player1RatingAfter: p1After,
        player2RatingBefore: p2Before,
        player2RatingAfter: p2After,
        ...(isTarget
          ? { reportedWinnerId: winnerId, secondReportWinnerId: winnerId, confirmationMethod: ConfirmationMethod.CORRECTED }
          : {}),
      },
    });

    if (!p1Practicing) {
      const existing = await tx.ratingHistory.findFirst({ where: { userId: m.player1Id, matchId: m.id } });
      const data = { ratingBefore: p1Before, ratingAfter: p1After, delta: p1After - p1Before };
      if (existing) await tx.ratingHistory.update({ where: { id: existing.id }, data });
      else await tx.ratingHistory.create({ data: { userId: m.player1Id, matchId: m.id, ...data } });
    }
    if (!p2Practicing) {
      const existing = await tx.ratingHistory.findFirst({ where: { userId: m.player2Id, matchId: m.id } });
      const data = { ratingBefore: p2Before, ratingAfter: p2After, delta: p2After - p2Before };
      if (existing) await tx.ratingHistory.update({ where: { id: existing.id }, data });
      else await tx.ratingHistory.create({ data: { userId: m.player2Id, matchId: m.id, ...data } });
    }
  }

  for (const [userId, rating] of currentRating) {
    await tx.user.update({ where: { id: userId }, data: { rating } });
  }

  return { matchCount: matches.length, finalRatings: [...currentRating.entries()] };
}
