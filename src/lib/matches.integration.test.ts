import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import {
  adminCorrectOldMatchResult,
  adminForceConfirmMatch,
  adminOverrideMatchResult,
  applyEloAndConfirm,
  CANCEL_GRACE_PERIOD_SECONDS,
  cancelMatch,
  getLatestMatchForUser,
  getUnresolvedMatchForUser,
  hasOpponentEngaged,
  leaveMatch,
  requestMutualCancel,
  requestRematch,
  requestResultCorrection,
  resolveMatchCorrection,
  surrenderMatch,
} from "@/lib/matches";

// Past the free-cancel grace period, so tests exercising a successful
// cancelMatch don't have to actually wait it out in real time.
const PAST_GRACE_PERIOD = new Date(Date.now() - (CANCEL_GRACE_PERIOD_SECONDS + 5) * 1000);
import { reportGameResult } from "@/lib/match-games";
import { blockUser } from "@/lib/blocks";
import { fileConnectionReport } from "@/lib/reports";
import { endActiveSeasonAndStartNext } from "@/lib/seasons";
import { CANCEL_SUSPEND_MIN_CANCELS } from "@/lib/account";
import { ConfirmationMethod, LobbyEntryStatus, MatchStatus, PairingMethod, UserStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

async function createConfirmedMatch(winnerId: string, loserId: string) {
  const match = await prisma.ratingMatch.create({
    data: {
      player1Id: winnerId,
      player2Id: loserId,
      status: MatchStatus.PENDING_REPORT,
      expiresAt: new Date(),
      // applyEloAndConfirm doesn't set these itself — production sets them
      // via the report flow before ever calling it.
      reportedWinnerId: winnerId,
      reportedById: winnerId,
      reportedAt: new Date(),
    },
  });
  await prisma.$transaction((tx) =>
    applyEloAndConfirm(tx, match, winnerId, ConfirmationMethod.SELF_CONFIRMED, {
      winnerId,
      reporterId: winnerId,
    }),
  );
  return prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
}

describe("getUnresolvedMatchForUser / getLatestMatchForUser connectionReports", () => {
  it("includes the current user's own connection report but not the opponent's", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: a.id, player2Id: b.id, status: "PENDING_REPORT", expiresAt: new Date() },
    });

    await fileConnectionReport(a.id, match.id);

    const forReporter = await getUnresolvedMatchForUser(a.id);
    expect(forReporter?.connectionReports).toHaveLength(1);

    const forOpponent = await getUnresolvedMatchForUser(b.id);
    expect(forOpponent?.connectionReports).toHaveLength(0);
  });

  it("returns an empty connectionReports array when nobody has reported", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await prisma.ratingMatch.create({
      data: { player1Id: a.id, player2Id: b.id, status: "CONFIRMED", expiresAt: new Date() },
    });

    const result = await getLatestMatchForUser(a.id);
    expect(result?.connectionReports).toHaveLength(0);
  });
});

describe("applyEloAndConfirm", () => {
  it("confirms the match, updates both ratings, and records history", async () => {
    const winner = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const loser = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: winner.id,
        player2Id: loser.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
      },
    });

    await prisma.$transaction((tx) =>
      applyEloAndConfirm(tx, match, winner.id, ConfirmationMethod.SELF_CONFIRMED, {
        winnerId: winner.id,
        reporterId: winner.id,
      }),
    );

    const updatedMatch = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updatedMatch.status).toBe(MatchStatus.CONFIRMED);
    expect(updatedMatch.player1RatingAfter).toBeGreaterThan(updatedMatch.player1RatingBefore!);
    expect(updatedMatch.player2RatingAfter).toBeLessThan(updatedMatch.player2RatingBefore!);

    const [updatedWinner, updatedLoser] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: winner.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: loser.id } }),
    ]);
    expect(updatedWinner.rating).toBe(updatedMatch.player1RatingAfter);
    expect(updatedWinner.gamesPlayed).toBe(21);
    expect(updatedLoser.rating).toBe(updatedMatch.player2RatingAfter);
    expect(updatedLoser.gamesPlayed).toBe(21);

    const history = await prisma.ratingHistory.findMany({ where: { matchId: match.id } });
    expect(history).toHaveLength(2);
  });

  it("caps the rating swing at 30 even for a massive rating-gap upset", async () => {
    const underdog = await createTestUser({ rating: 1000, gamesPlayed: 0 });
    const favorite = await createTestUser({ rating: 2500, gamesPlayed: 0 });
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: underdog.id,
        player2Id: favorite.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
      },
    });

    await prisma.$transaction((tx) =>
      applyEloAndConfirm(tx, match, underdog.id, ConfirmationMethod.SELF_CONFIRMED, {
        winnerId: underdog.id,
        reporterId: underdog.id,
      }),
    );

    const [updatedUnderdog, updatedFavorite] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: underdog.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: favorite.id } }),
    ]);
    expect(updatedUnderdog.rating).toBe(1030);
    expect(updatedFavorite.rating).toBe(2470);
  });

  it("gives a lower-rated provisional winner a bigger swing than an established player", async () => {
    const provisionalWinner = await createTestUser({ rating: 1500, gamesPlayed: 5 });
    const establishedLoser = await createTestUser({ rating: 1500, gamesPlayed: 40 });
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: provisionalWinner.id,
        player2Id: establishedLoser.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
      },
    });

    await prisma.$transaction((tx) =>
      applyEloAndConfirm(tx, match, provisionalWinner.id, ConfirmationMethod.SELF_CONFIRMED, {
        winnerId: provisionalWinner.id,
        reporterId: provisionalWinner.id,
      }),
    );

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    const winnerGain = updated.player1RatingAfter! - updated.player1RatingBefore!;
    const loserLoss = updated.player2RatingBefore! - updated.player2RatingAfter!;
    expect(winnerGain).toBeGreaterThan(loserLoss);
  });

  it("updates practiceRating instead of rating for a practicing side, and never touches the opponent's main rating twice", async () => {
    const practicing = await createTestUser({
      rating: 1500,
      gamesPlayed: 20,
      practiceRating: 1400,
      practiceGamesPlayed: 3,
    });
    const normal = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: practicing.id,
        player2Id: normal.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
        player1IsPracticing: true,
      },
    });

    await prisma.$transaction((tx) =>
      applyEloAndConfirm(tx, match, practicing.id, ConfirmationMethod.SELF_CONFIRMED, {
        winnerId: practicing.id,
        reporterId: practicing.id,
      }),
    );

    const updatedMatch = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updatedMatch.player1RatingBefore).toBe(1400); // practiceRating, not rating

    const [updatedPracticing, updatedNormal] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: practicing.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: normal.id } }),
    ]);
    expect(updatedPracticing.rating).toBe(1500); // untouched
    expect(updatedPracticing.gamesPlayed).toBe(20); // untouched
    expect(updatedPracticing.practiceRating).toBe(updatedMatch.player1RatingAfter);
    expect(updatedPracticing.practiceGamesPlayed).toBe(4);
    expect(updatedNormal.rating).toBe(updatedMatch.player2RatingAfter);
    expect(updatedNormal.gamesPlayed).toBe(21);

    // Only the non-practicing side gets a RatingHistory row — that table
    // backs the main rating-over-time chart, which a practice result has no
    // business appearing in.
    const history = await prisma.ratingHistory.findMany({ where: { matchId: match.id } });
    expect(history).toHaveLength(1);
    expect(history[0].userId).toBe(normal.id);
  });
});

describe("requestResultCorrection", () => {
  it("does nothing until both sides submit the same correction", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id); // p1 reported as winner

    const first = await requestResultCorrection(p1.id, match.id, p2.id); // p1 now says p2 won
    expect(first.applied).toBe(false);

    const stillUnchanged = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(stillUnchanged.reportedWinnerId).toBe(p1.id);
    expect(stillUnchanged.player1RatingAfter).toBe(match.player1RatingAfter);
  });

  it("reverses and reapplies Elo from the original pre-match ratings when both sides agree", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id); // p1 (player1) wins originally

    await requestResultCorrection(p1.id, match.id, p2.id); // p1 admits p2 actually won
    const second = await requestResultCorrection(p2.id, match.id, p2.id); // p2 agrees p2 won
    expect(second.applied).toBe(true);

    const corrected = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(corrected.reportedWinnerId).toBe(p2.id);
    expect(corrected.confirmationMethod).toBe("CORRECTED");
    expect(corrected.correctionWinnerId).toBeNull();
    expect(corrected.correctionReportedById).toBeNull();

    // Symmetric ratings before the match (both 1500, both 20 games), so
    // reversing the win should land p2 exactly where p1 originally landed,
    // and vice versa.
    expect(corrected.player2RatingAfter).toBe(match.player1RatingAfter);
    expect(corrected.player1RatingAfter).toBe(match.player2RatingAfter);

    const [updatedP1, updatedP2] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: p1.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: p2.id } }),
    ]);
    expect(updatedP1.rating).toBe(corrected.player1RatingAfter);
    expect(updatedP2.rating).toBe(corrected.player2RatingAfter);
    // gamesPlayed must not double-count — this isn't a new game.
    expect(updatedP1.gamesPlayed).toBe(21);
    expect(updatedP2.gamesPlayed).toBe(21);

    const history = await prisma.ratingHistory.findMany({
      where: { matchId: match.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history).toHaveLength(4); // 2 from the original confirm, 2 from the correction
  });

  it("flags correctionDisputed when the two sides disagree", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id); // p1 confirmed as winner

    await requestResultCorrection(p1.id, match.id, p2.id); // p1 admits p2 actually won
    const second = await requestResultCorrection(p2.id, match.id, p1.id); // p2 insists p1 really won
    expect(second.applied).toBe(false);
    expect(second.disputed).toBe(true);

    const disputed = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(disputed.correctionDisputed).toBe(true);
    expect(disputed.reportedWinnerId).toBe(p1.id); // untouched until a mod resolves it
  });

  it("rejects a correction once a newer match has been confirmed for either player", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p3 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id);
    await createConfirmedMatch(p1.id, p3.id); // p1 plays again after

    await expect(requestResultCorrection(p1.id, match.id, p2.id)).rejects.toThrow(/newer match/i);
  });

  it("rejects a correction once the match's season has ended", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id);

    await endActiveSeasonAndStartNext();

    await expect(requestResultCorrection(p1.id, match.id, p2.id)).rejects.toThrow(/season has ended/i);
  });

  it("rejects a non-participant", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const outsider = await createTestUser();
    const match = await createConfirmedMatch(p1.id, p2.id);

    await expect(requestResultCorrection(outsider.id, match.id, p2.id)).rejects.toThrow(/not a participant/i);
  });
});

describe("resolveMatchCorrection", () => {
  it("applies a mod's decision on a disputed correction", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id);

    await requestResultCorrection(p1.id, match.id, p1.id); // p1 says p1 (self) won — no change
    await requestResultCorrection(p2.id, match.id, p2.id); // p2 disagrees, says p2 won

    const disputed = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(disputed.correctionDisputed).toBe(true);

    await resolveMatchCorrection(match.id, p2.id);

    const resolved = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(resolved.correctionDisputed).toBe(false);
    expect(resolved.reportedWinnerId).toBe(p2.id);
  });
});

describe("adminOverrideMatchResult", () => {
  it("changes the winner and reapplies Elo without needing a prior dispute", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id); // p1 confirmed as winner

    await adminOverrideMatchResult(match.id, p2.id);

    const overridden = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(overridden.reportedWinnerId).toBe(p2.id);
    expect(overridden.confirmationMethod).toBe("CORRECTED");
    expect(overridden.player2RatingAfter).toBe(match.player1RatingAfter);

    const [updatedP1, updatedP2] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: p1.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: p2.id } }),
    ]);
    expect(updatedP1.gamesPlayed).toBe(21);
    expect(updatedP2.gamesPlayed).toBe(21);
  });

  it("rejects a non-confirmed match", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    await expect(adminOverrideMatchResult(match.id, p2.id)).rejects.toThrow(/only a confirmed match/i);
  });

  it("rejects it once a newer match has been confirmed for either player, same as a self-service correction", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p3 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id);
    await createConfirmedMatch(p1.id, p3.id);

    await expect(adminOverrideMatchResult(match.id, p2.id)).rejects.toThrow(/newer match/i);
  });
});

describe("adminCorrectOldMatchResult", () => {
  it("flips the winner and adjusts current rating by the negated delta, even with newer matches on top", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p3 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id); // p1 confirmed as winner
    // A newer match for p1 — this is exactly what blocks adminOverrideMatchResult,
    // but shouldn't block this relative-delta path.
    await createConfirmedMatch(p1.id, p3.id);

    const [p1BeforeCorrection, p2BeforeCorrection] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: p1.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: p2.id } }),
    ]);
    const matchBefore = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    const p1OriginalDelta = matchBefore.player1RatingAfter! - matchBefore.player1RatingBefore!;
    const p2OriginalDelta = matchBefore.player2RatingAfter! - matchBefore.player2RatingBefore!;
    const p3Before = await prisma.user.findUniqueOrThrow({ where: { id: p3.id } });

    await adminCorrectOldMatchResult(match.id, p2.id);

    const corrected = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(corrected.reportedWinnerId).toBe(p2.id);
    expect(corrected.confirmationMethod).toBe("CORRECTED");

    const [p1After, p2After] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: p1.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: p2.id } }),
    ]);
    expect(p1After.rating).toBe(Math.round(p1BeforeCorrection.rating - 2 * p1OriginalDelta));
    expect(p2After.rating).toBe(Math.round(p2BeforeCorrection.rating - 2 * p2OriginalDelta));
    // p3's rating (from the newer match) must be untouched — this path doesn't
    // ripple through anything downstream of the corrected match.
    const p3After = await prisma.user.findUniqueOrThrow({ where: { id: p3.id } });
    expect(p3After.rating).toBe(p3Before.rating);
  });

  it("flips each game's recorded winner to the other player", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id);
    await prisma.matchGame.createMany({
      data: [
        {
          matchId: match.id,
          gameNumber: 1,
          actorAId: p1.id,
          actorAStrikes: 1,
          actorBId: p2.id,
          actorBStrikes: 2,
          winnerId: p2.id,
        },
        {
          matchId: match.id,
          gameNumber: 2,
          actorAId: p2.id,
          actorAStrikes: 1,
          actorBId: p1.id,
          actorBStrikes: 2,
          winnerId: p1.id,
        },
        {
          matchId: match.id,
          gameNumber: 3,
          actorAId: p1.id,
          actorAStrikes: 1,
          actorBId: p2.id,
          actorBStrikes: 2,
          winnerId: p1.id,
        },
      ],
    });

    await adminCorrectOldMatchResult(match.id, p2.id);

    const games = await prisma.matchGame.findMany({
      where: { matchId: match.id },
      orderBy: { gameNumber: "asc" },
    });
    expect(games.map((g) => g.winnerId)).toEqual([p1.id, p2.id, p2.id]);
  });

  it("rejects a non-confirmed match", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    await expect(adminCorrectOldMatchResult(match.id, p2.id)).rejects.toThrow(/only a confirmed match/i);
  });

  it("rejects when the requested winner is already the recorded winner", async () => {
    const p1 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const p2 = await createTestUser({ rating: 1500, gamesPlayed: 20 });
    const match = await createConfirmedMatch(p1.id, p2.id);

    await expect(adminCorrectOldMatchResult(match.id, p1.id)).rejects.toThrow(/already has that winner/i);
  });
});

describe("cancelMatch", () => {
  it("allows cancelling before anything has happened", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
        createdAt: PAST_GRACE_PERIOD,
      },
    });

    await cancelMatch(p1.id, match.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.status).toBe(MatchStatus.CANCELLED);
  });

  it("blocks cancelling before the grace period has elapsed, even with no opponent activity", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    await expect(cancelMatch(p1.id, match.id)).rejects.toThrow(/moment to show up/i);
  });

  it("blocks cancelling once a game has been decided (the dodge-a-loss exploit)", async () => {
    const winner = await createTestUser();
    const loser = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: winner.id, player2Id: loser.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: winner.id,
        actorAStrikes: 1,
        actorBId: loser.id,
        actorBStrikes: 2,
        winnerId: winner.id,
      },
    });

    await expect(cancelMatch(loser.id, match.id)).rejects.toThrow(/decided or reported/i);
  });

  it("blocks cancelling once a game has an unconfirmed report pending", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorBId: p2.id,
        actorBStrikes: 2,
        reportedWinnerId: p1.id,
        reportedById: p2.id,
        reportedAt: new Date(),
      },
    });

    await expect(cancelMatch(p2.id, match.id)).rejects.toThrow(/decided or reported/i);
  });

  async function cancelPendingMatch(userId: string, opponentId: string) {
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: userId,
        player2Id: opponentId,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
        createdAt: PAST_GRACE_PERIOD,
      },
    });
    await cancelMatch(userId, match.id);
  }

  it("suspends the account on the exact cancel that crosses the suspend threshold", async () => {
    const canceller = await createTestUser({ cancelCount: CANCEL_SUSPEND_MIN_CANCELS - 1, gamesPlayed: 0 });
    const opponent = await createTestUser();

    await cancelPendingMatch(canceller.id, opponent.id);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: canceller.id } });
    expect(updated.cancelCount).toBe(CANCEL_SUSPEND_MIN_CANCELS);
    expect(updated.status).toBe(UserStatus.SUSPENDED);
    expect(updated.suspendedUntil).not.toBeNull();
    expect(updated.suspendedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("doesn't suspend a low cancel count relative to games played", async () => {
    const canceller = await createTestUser({ cancelCount: 0, gamesPlayed: 200 });
    const opponent = await createTestUser();

    await cancelPendingMatch(canceller.id, opponent.id);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: canceller.id } });
    expect(updated.status).toBe(UserStatus.ACTIVE);
  });

  it("doesn't re-suspend (or reset the timer) on a later cancel past the threshold", async () => {
    const canceller = await createTestUser({ cancelCount: CANCEL_SUSPEND_MIN_CANCELS, gamesPlayed: 0 });
    const opponent = await createTestUser();
    // Simulate the suspension already having happened, with the clock ticking down.
    const originalSuspendedUntil = new Date(Date.now() + 60 * 60 * 1000);
    await prisma.user.update({
      where: { id: canceller.id },
      data: { status: UserStatus.SUSPENDED, suspendedUntil: originalSuspendedUntil },
    });

    await cancelPendingMatch(canceller.id, opponent.id);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: canceller.id } });
    expect(updated.suspendedUntil!.getTime()).toBe(originalSuspendedUntil.getTime());
  });

  it("doesn't downgrade an already-banned account to suspended", async () => {
    const canceller = await createTestUser({
      cancelCount: CANCEL_SUSPEND_MIN_CANCELS - 1,
      gamesPlayed: 0,
      status: UserStatus.BANNED,
    });
    const opponent = await createTestUser();

    await cancelPendingMatch(canceller.id, opponent.id);

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: canceller.id } });
    expect(updated.status).toBe(UserStatus.BANNED);
  });

  it("stays free when only the canceller (not the opponent) has acted", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
        createdAt: PAST_GRACE_PERIOD,
      },
    });
    // p2 (the canceller) locked in a character; p1 (the opponent) never touched it.
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorBId: p2.id,
        actorBStrikes: 2,
        actorBCharacter: "Mario",
        stagesRemaining: [],
      },
    });

    await cancelMatch(p2.id, match.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.status).toBe(MatchStatus.CANCELLED);
  });

  it("blocks the free cancel once the opponent has locked in a character", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorBId: p2.id,
        actorBStrikes: 2,
        actorBCharacter: "Fox",
        stagesRemaining: [],
      },
    });

    await expect(cancelMatch(p1.id, match.id)).rejects.toThrow(/no longer free/i);
  });

  it("blocks the free cancel once the opponent has struck a stage", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    // p1 is actorA (strikes first) — one struck stage means p1 (the opponent
    // of p2 here) has acted.
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorBId: p2.id,
        actorBStrikes: 2,
        struckStages: ["Battlefield"],
        stagesRemaining: ["Final Destination"],
      },
    });

    await expect(cancelMatch(p2.id, match.id)).rejects.toThrow(/no longer free/i);
  });

  it("blocks the free cancel once the opponent has sent a chat message", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await prisma.matchComment.create({ data: { matchId: match.id, authorId: p2.id, body: "gl hf" } });

    await expect(cancelMatch(p1.id, match.id)).rejects.toThrow(/no longer free/i);
  });

  it("blocks the free cancel once the opponent has set the room code", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
        roomCode: "ABC123",
        roomCodeSetById: p2.id,
      },
    });

    await expect(cancelMatch(p1.id, match.id)).rejects.toThrow(/no longer free/i);
  });
});

describe("hasOpponentEngaged", () => {
  it("returns false for a match with no game, comments, or room code", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    expect(await hasOpponentEngaged(match.id, p2.id, null)).toBe(false);
  });
});

describe("surrenderMatch", () => {
  it("applies Elo as a loss for the surrendering player and a win for the opponent", async () => {
    const surrenderer = await createTestUser({ rating: 1500, gamesPlayed: 10 });
    const opponent = await createTestUser({ rating: 1500, gamesPlayed: 10 });
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: surrenderer.id,
        player2Id: opponent.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
      },
    });

    await surrenderMatch(surrenderer.id, match.id);

    const updatedMatch = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updatedMatch.status).toBe(MatchStatus.CONFIRMED);
    expect(updatedMatch.confirmationMethod).toBe(ConfirmationMethod.SURRENDER);
    expect(updatedMatch.reportedWinnerId).toBe(opponent.id);
    expect(updatedMatch.reportedById).toBe(surrenderer.id);

    const updatedSurrenderer = await prisma.user.findUniqueOrThrow({ where: { id: surrenderer.id } });
    const updatedOpponent = await prisma.user.findUniqueOrThrow({ where: { id: opponent.id } });
    expect(updatedSurrenderer.rating).toBeLessThan(1500);
    expect(updatedOpponent.rating).toBeGreaterThan(1500);
    // A surrender is a real result, not a free dodge — it shouldn't feed the
    // cancelCount-based warning/suspend machinery on top of the Elo hit.
    expect(updatedSurrenderer.cancelCount).toBe(0);
  });

  it("allows surrendering even after a game has been decided (unlike cancelMatch)", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorBId: p2.id,
        actorBStrikes: 2,
        winnerId: p1.id,
      },
    });

    await surrenderMatch(p2.id, match.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.status).toBe(MatchStatus.CONFIRMED);
    expect(updated.reportedWinnerId).toBe(p1.id);
  });

  it("rejects a non-participant", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const outsider = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    await expect(surrenderMatch(outsider.id, match.id)).rejects.toThrow(/not a participant/i);
  });
});

describe("requestMutualCancel", () => {
  it("does nothing when only one side has requested", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    await requestMutualCancel(p1.id, match.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.status).toBe(MatchStatus.PENDING_REPORT);
    expect(updated.player1CancelRequestedAt).not.toBeNull();
    expect(updated.player2CancelRequestedAt).toBeNull();
  });

  it("cancels once both sides have requested", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    await requestMutualCancel(p1.id, match.id);
    await requestMutualCancel(p2.id, match.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.status).toBe(MatchStatus.CANCELLED);
  });

  it("rejects a non-participant", async () => {
    const outsider = await createTestUser();
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    await expect(requestMutualCancel(outsider.id, match.id)).rejects.toThrow(/participant/i);
  });

  // The actual incident this fixes: the eventual winner asked to cancel
  // right at the start, the opponent declined (in chat) and they played the
  // whole set out, ending 3-1 for the asker — but the request was never
  // withdrawn, so the opponent later clicked "Agree to Cancel" on that same
  // stale request to void a set they'd already lost. A decided game should
  // clear any pending request (see progressSet), so by the time a game's
  // been won this way there's nothing left to accept.
  it("doesn't let a stale pre-match request be accepted after a game has since been decided", async () => {
    const asker = await createTestUser();
    const opponent = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: asker.id, player2Id: opponent.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: asker.id,
        actorAStrikes: 1,
        actorBId: opponent.id,
        actorBStrikes: 2,
        finalStage: "Battlefield",
      },
    });

    // Asker requests cancel before anything's happened; opponent declines
    // (never agrees) and the set is played out normally instead.
    await requestMutualCancel(asker.id, match.id);
    await reportGameResult(asker.id, match.id, 1, true);
    await reportGameResult(opponent.id, match.id, 1, false);

    const afterGameOne = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(afterGameOne.player1CancelRequestedAt).toBeNull();

    // Opponent, now down in the set, tries to accept the old request.
    await requestMutualCancel(opponent.id, match.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.status).not.toBe(MatchStatus.CANCELLED);
    expect(updated.player2CancelRequestedAt).not.toBeNull();
  });
});

describe("adminForceConfirmMatch", () => {
  it("closes out a match with no game data at all and applies Elo", async () => {
    const p1 = await createTestUser({ rating: 1500 });
    const p2 = await createTestUser({ rating: 1500 });
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    await adminForceConfirmMatch(match.id, p1.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.status).toBe(MatchStatus.CONFIRMED);
    expect(updated.confirmationMethod).toBe(ConfirmationMethod.ADMIN_RESOLVED);
    expect(updated.player1RatingAfter).toBeGreaterThan(updated.player1RatingBefore!);
    // getPlayerMatchHistory's win/loss badge and rivals record key off this —
    // a real production bug had the rating apply correctly while this stayed
    // null, showing the winner as a loss on their own profile.
    expect(updated.reportedWinnerId).toBe(p1.id);
  });

  it("closes out a match that already expired with no report from either side", async () => {
    const p1 = await createTestUser({ rating: 1500 });
    const p2 = await createTestUser({ rating: 1500 });
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.EXPIRED, expiresAt: new Date() },
    });

    await adminForceConfirmMatch(match.id, p2.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.status).toBe(MatchStatus.CONFIRMED);
  });

  it("rejects a match that's already confirmed", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createConfirmedMatch(p1.id, p2.id);

    await expect(adminForceConfirmMatch(match.id, p2.id)).rejects.toThrow(/already closed out/i);
  });

  it("rejects a cancelled match", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.CANCELLED, expiresAt: new Date() },
    });

    await expect(adminForceConfirmMatch(match.id, p1.id)).rejects.toThrow(/already closed out/i);
  });

  it("rejects a winnerId that isn't one of the two players", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const outsider = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    await expect(adminForceConfirmMatch(match.id, outsider.id)).rejects.toThrow(/one of the two players/i);
  });
});

describe("leaveMatch", () => {
  async function createConfirmedMatch() {
    const player1 = await createTestUser();
    const player2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: player1.id,
        player2Id: player2.id,
        status: MatchStatus.CONFIRMED,
        confirmedAt: new Date(),
        expiresAt: new Date(),
      },
    });
    return { player1, player2, match };
  }

  it("marks player1's own leftAt and leaves player2's untouched", async () => {
    const { player1, match } = await createConfirmedMatch();

    await leaveMatch(player1.id, match.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.player1LeftAt).not.toBeNull();
    expect(updated.player2LeftAt).toBeNull();
  });

  it("marks player2's own leftAt and leaves player1's untouched", async () => {
    const { player2, match } = await createConfirmedMatch();

    await leaveMatch(player2.id, match.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.player2LeftAt).not.toBeNull();
    expect(updated.player1LeftAt).toBeNull();
  });

  it("throws for a user who isn't a participant in the match", async () => {
    const { match } = await createConfirmedMatch();
    const outsider = await createTestUser();

    await expect(leaveMatch(outsider.id, match.id)).rejects.toThrow("Not a participant in this match");
  });

  it("is idempotent — leaving twice keeps the original timestamp", async () => {
    const { player1, match } = await createConfirmedMatch();

    await leaveMatch(player1.id, match.id);
    const afterFirst = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });

    await leaveMatch(player1.id, match.id);
    const afterSecond = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });

    expect(afterSecond.player1LeftAt?.getTime()).toBe(afterFirst.player1LeftAt?.getTime());
  });

  it("clears a previously-set rematch request when leaving", async () => {
    const { player1, match } = await createConfirmedMatch();
    await requestRematch(player1.id, match.id);

    await leaveMatch(player1.id, match.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.player1RematchRequestedAt).toBeNull();
  });
});

describe("requestRematch", () => {
  async function createConfirmedMatch() {
    const player1 = await createTestUser();
    const player2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: player1.id,
        player2Id: player2.id,
        status: MatchStatus.CONFIRMED,
        confirmedAt: new Date(),
        expiresAt: new Date(),
      },
    });
    return { player1, player2, match };
  }

  it("throws for a user who isn't a participant in the match", async () => {
    const { match } = await createConfirmedMatch();
    const outsider = await createTestUser();

    await expect(requestRematch(outsider.id, match.id)).rejects.toThrow("Not a participant in this match");
  });

  it("throws for a match that hasn't finished", async () => {
    const player1 = await createTestUser();
    const player2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: player1.id,
        player2Id: player2.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
      },
    });

    await expect(requestRematch(player1.id, match.id)).rejects.toThrow("This match hasn't finished yet");
  });

  it("throws if the caller has already left", async () => {
    const { player1, match } = await createConfirmedMatch();
    await leaveMatch(player1.id, match.id);

    await expect(requestRematch(player1.id, match.id)).rejects.toThrow("You've left this match");
  });

  it("only records the first request when the opponent hasn't asked yet", async () => {
    const { player1, match } = await createConfirmedMatch();

    await requestRematch(player1.id, match.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.player1RematchRequestedAt).not.toBeNull();
    expect(updated.player2RematchRequestedAt).toBeNull();

    const newMatches = await prisma.ratingMatch.count({
      where: { player1Id: player1.id, id: { not: match.id } },
    });
    expect(newMatches).toBe(0);
  });

  it("is idempotent — requesting twice doesn't error or change the timestamp", async () => {
    const { player1, match } = await createConfirmedMatch();

    await requestRematch(player1.id, match.id);
    const afterFirst = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });

    await requestRematch(player1.id, match.id);
    const afterSecond = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });

    expect(afterSecond.player1RematchRequestedAt?.getTime()).toBe(afterFirst.player1RematchRequestedAt?.getTime());
  });

  it("creates a fresh paired match once both players have requested", async () => {
    const { player1, player2, match } = await createConfirmedMatch();

    await requestRematch(player1.id, match.id);
    await requestRematch(player2.id, match.id);

    const newMatch = await prisma.ratingMatch.findFirstOrThrow({
      where: { id: { not: match.id }, player1Id: player1.id, player2Id: player2.id },
    });
    expect(newMatch.status).toBe(MatchStatus.PENDING_REPORT);
    expect(newMatch.pairingMethod).toBe(PairingMethod.REMATCH);

    const entries = await prisma.ratingLobbyEntry.findMany({
      where: { userId: { in: [player1.id, player2.id] }, status: LobbyEntryStatus.PAIRED },
    });
    const newEntries = entries.filter((e) => e.matchId === newMatch.id || e.pairedEntryId !== null);
    expect(newEntries.length).toBeGreaterThanOrEqual(1);
  });

  // Regression test: a player who was practicing in the original match
  // (banning their own main, results kept off their real rating) expects a
  // rematch to keep behaving the same way — createDirectMatch used to
  // always default both sides to non-practice regardless of what the
  // original match had, silently putting a practice-mode player's rematch
  // onto their real ladder rating.
  it("carries over each side's practicing flag from the original match", async () => {
    const player1 = await createTestUser();
    const player2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: player1.id,
        player2Id: player2.id,
        status: MatchStatus.CONFIRMED,
        confirmedAt: new Date(),
        expiresAt: new Date(),
        player1IsPracticing: true,
        player2IsPracticing: false,
      },
    });

    await requestRematch(player1.id, match.id);
    await requestRematch(player2.id, match.id);

    const newMatch = await prisma.ratingMatch.findFirstOrThrow({
      where: { id: { not: match.id }, player1Id: player1.id, player2Id: player2.id },
    });
    expect(newMatch.player1IsPracticing).toBe(true);
    expect(newMatch.player2IsPracticing).toBe(false);
  });

  it("doesn't create a new match if the opponent already left", async () => {
    const { player1, player2, match } = await createConfirmedMatch();
    await requestRematch(player1.id, match.id);
    await leaveMatch(player2.id, match.id);

    // player2 left, so they can no longer request — simulate the mutual
    // condition failing by having player1's own request just sit unmatched.
    const newMatches = await prisma.ratingMatch.count({
      where: { player1Id: player1.id, player2Id: player2.id, id: { not: match.id } },
    });
    expect(newMatches).toBe(0);
  });

  it("doesn't create a new match if the players are blocked either-way", async () => {
    const { player1, player2, match } = await createConfirmedMatch();
    await blockUser(player2.id, player1.id);

    await requestRematch(player1.id, match.id);
    await requestRematch(player2.id, match.id);

    const newMatches = await prisma.ratingMatch.count({
      where: { player1Id: player1.id, player2Id: player2.id, id: { not: match.id } },
    });
    expect(newMatches).toBe(0);
  });

  // Regression test: a player could request/accept a rematch on an old
  // finished match while also having queued for and been paired with an
  // unrelated third player in the meantime (e.g. via the general "Search
  // new opponent" queue) — accepting the stale rematch would silently give
  // them a second simultaneous live match, and getActiveLobbyEntry would
  // start showing whichever one is newest, yanking them out of the other.
  it("doesn't create a new match if the requester already has an unresolved match elsewhere", async () => {
    const { player1, player2, match } = await createConfirmedMatch();
    const stranger = await createTestUser();
    await requestRematch(player1.id, match.id);

    await prisma.ratingMatch.create({
      data: {
        player1Id: player1.id,
        player2Id: stranger.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
      },
    });

    await requestRematch(player2.id, match.id);

    const newMatches = await prisma.ratingMatch.count({
      where: { player1Id: player1.id, player2Id: player2.id, id: { not: match.id } },
    });
    expect(newMatches).toBe(0);
  });

  it("doesn't create a new match if the accepter already has an unresolved match elsewhere", async () => {
    const { player1, player2, match } = await createConfirmedMatch();
    const stranger = await createTestUser();
    await requestRematch(player1.id, match.id);

    await prisma.ratingMatch.create({
      data: {
        player1Id: player2.id,
        player2Id: stranger.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
      },
    });

    await requestRematch(player2.id, match.id);

    const newMatches = await prisma.ratingMatch.count({
      where: { player1Id: player1.id, player2Id: player2.id, id: { not: match.id } },
    });
    expect(newMatches).toBe(0);
  });
});
