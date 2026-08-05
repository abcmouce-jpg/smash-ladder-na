import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import {
  listDisputedGames,
  listLiveMatches,
  requestDisputeResolution,
  resolveDisputedGame,
  adminSetGameWinner,
  adminResetMatchToZero,
  adminCancelMatch,
} from "@/lib/disputes";
import { MatchStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

// isMostRecentConfirmedMatch (the guard behind adminSetGameWinner's and
// adminCancelMatch's CONFIRMED-editing paths) requires the match's own
// seasonId to match the currently active season — a fixture built by
// inserting a CONFIRMED row directly (skipping applyEloAndConfirm, which
// stamps this automatically) needs to set it explicitly or every such edit
// gets rejected as if the season had ended.
async function activeSeasonId() {
  const season =
    (await prisma.season.findFirst({ where: { endsAt: null } })) ??
    (await prisma.season.create({ data: { name: "Test Season" } }));
  return season.id;
}

// A game the set doesn't need a mod for — winnerId is settled at creation,
// no reports involved. actorAId is the winner for consistency with how the
// app itself derives it (winner strikes/picks first from game 2 on).
async function createDecidedGame(matchId: string, gameNumber: number, winnerId: string, loserId: string) {
  return prisma.matchGame.create({
    data: {
      matchId,
      gameNumber,
      actorAId: winnerId,
      actorAStrikes: gameNumber === 1 ? 1 : 2,
      actorBId: loserId,
      actorBStrikes: gameNumber === 1 ? 2 : 0,
      finalStage: "Battlefield",
      winnerId,
    },
  });
}

async function createDisputedGame(matchId: string, p1: string, p2: string, gameNumber = 1, escalated = true) {
  return prisma.matchGame.create({
    data: {
      matchId,
      gameNumber,
      actorAId: p1,
      actorAStrikes: 1,
      actorBId: p2,
      actorBStrikes: 2,
      finalStage: "Battlefield",
      reportedWinnerId: p1,
      reportedById: p1,
      reportedAt: new Date(),
      secondReportWinnerId: p2,
      secondReportById: p2,
      secondReportAt: new Date(),
      // Fixtures default to already-escalated (what the mod queue sees);
      // pass escalated=false to build a still-contested game.
      ...(escalated ? { disputeRequestedAt: new Date() } : {}),
    },
  });
}

describe("disputes", () => {
  it("lists a game where both sides reported different winners", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
      },
    });
    await createDisputedGame(match.id, p1.id, p2.id);

    const disputed = await listDisputedGames();
    expect(disputed).toHaveLength(1);
    expect(disputed[0].matchId).toBe(match.id);
  });

  it("does not list a contested game the players haven't escalated yet", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
      },
    });
    await createDisputedGame(match.id, p1.id, p2.id, 1, false);

    const disputed = await listDisputedGames();
    expect(disputed).toHaveLength(0);
  });

  it("resolving the deciding game confirms the match and applies Elo", async () => {
    const p1 = await createTestUser({ rating: 1500 });
    const p2 = await createTestUser({ rating: 1500 });
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
      },
    });
    // p1 already won games 1-2 outright (BO5 needs 3 wins) — the disputed
    // game 3 is the decider.
    await createDecidedGame(match.id, 1, p1.id, p2.id);
    await createDecidedGame(match.id, 2, p1.id, p2.id);
    await createDisputedGame(match.id, p1.id, p2.id, 3);

    await resolveDisputedGame(match.id, 3, p1.id);

    const updatedMatch = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updatedMatch.status).toBe(MatchStatus.CONFIRMED);
    expect(updatedMatch.reportedWinnerId).toBe(p1.id);

    const remainingDisputes = await listDisputedGames();
    expect(remainingDisputes).toHaveLength(0);
  });

  it("resolving a non-deciding disputed game leaves the match in progress", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(),
      },
    });
    await createDisputedGame(match.id, p1.id, p2.id);

    await resolveDisputedGame(match.id, 1, p1.id);

    const updatedMatch = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updatedMatch.status).toBe(MatchStatus.PENDING_REPORT);
  });
});

describe("requestDisputeResolution", () => {
  it("records the first vote without resolving anything", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await createDisputedGame(match.id, p1.id, p2.id);

    const result = await requestDisputeResolution(p1.id, match.id, 1, p1.id);
    expect(result).toEqual({ resolved: false });

    const game = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(game.winnerId).toBeNull();
    expect(game.disputeResolutionWinnerId).toBe(p1.id);
    expect(game.disputeResolutionById).toBe(p1.id);
  });

  it("resolves the game immediately once both sides agree", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await createDisputedGame(match.id, p1.id, p2.id);

    await requestDisputeResolution(p1.id, match.id, 1, p1.id);
    const result = await requestDisputeResolution(p2.id, match.id, 1, p1.id);

    expect(result.resolved).toBe(true);
    const game = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(game.winnerId).toBe(p1.id);
    expect(await listDisputedGames()).toHaveLength(0);
  });

  it("confirms the match and applies Elo when the resolved game decides the set", async () => {
    const p1 = await createTestUser({ rating: 1500 });
    const p2 = await createTestUser({ rating: 1500 });
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await createDecidedGame(match.id, 1, p1.id, p2.id);
    await createDecidedGame(match.id, 2, p1.id, p2.id);
    await createDisputedGame(match.id, p1.id, p2.id, 3);

    await requestDisputeResolution(p1.id, match.id, 3, p1.id);
    await requestDisputeResolution(p2.id, match.id, 3, p1.id);

    const updatedMatch = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updatedMatch.status).toBe(MatchStatus.CONFIRMED);
    expect(updatedMatch.confirmationMethod).toBe("MUTUALLY_RESOLVED");
  });

  it("resets both votes when the second vote disagrees, leaving it disputed", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await createDisputedGame(match.id, p1.id, p2.id);

    await requestDisputeResolution(p1.id, match.id, 1, p1.id);
    const result = await requestDisputeResolution(p2.id, match.id, 1, p2.id);

    expect(result).toEqual({ resolved: false, stillDisputed: true });
    const game = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(game.winnerId).toBeNull();
    expect(game.disputeResolutionWinnerId).toBeNull();
    expect(game.disputeResolutionById).toBeNull();
    expect(await listDisputedGames()).toHaveLength(1);
  });

  it("lets the same player revise their own pending vote", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await createDisputedGame(match.id, p1.id, p2.id);

    await requestDisputeResolution(p1.id, match.id, 1, p1.id);
    await requestDisputeResolution(p1.id, match.id, 1, p2.id);

    const game = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(game.disputeResolutionWinnerId).toBe(p2.id);
  });

  it("rejects a non-participant", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const outsider = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await createDisputedGame(match.id, p1.id, p2.id);

    await expect(requestDisputeResolution(outsider.id, match.id, 1, p1.id)).rejects.toThrow(
      /not a participant/i,
    );
  });

  it("rejects a game that isn't actually disputed", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await createDecidedGame(match.id, 1, p1.id, p2.id);

    await expect(requestDisputeResolution(p1.id, match.id, 1, p2.id)).rejects.toThrow(/already decided/i);
  });
});

describe("listLiveMatches", () => {
  it("includes matches still being played, not confirmed/cancelled ones", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const live = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.CANCELLED, expiresAt: new Date() },
    });

    const results = await listLiveMatches();
    expect(results.map((m) => m.id)).toEqual([live.id]);
  });

  it("includes a recently-expired match nobody reported, so a mod can force-confirm it", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const recentlyExpired = await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.EXPIRED,
        expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      },
    });

    const results = await listLiveMatches();
    expect(results.map((m) => m.id)).toContain(recentlyExpired.id);
  });

  it("excludes an expired match outside the recent window", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.EXPIRED,
        expiresAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      },
    });

    const results = await listLiveMatches();
    expect(results).toEqual([]);
  });

  it("excludes a CONFIRMED match even when it just confirmed moments ago", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const confirmed = await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.CONFIRMED,
        confirmedAt: new Date(),
        expiresAt: new Date(),
      },
    });

    const results = await listLiveMatches();
    expect(results.map((m) => m.id)).not.toContain(confirmed.id);
  });
});

describe("adminSetGameWinner", () => {
  it("overwrites an already-decided game without needing a dispute", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await createDecidedGame(match.id, 1, p1.id, p2.id);

    await adminSetGameWinner(match.id, 1, p2.id);

    const game = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(game.winnerId).toBe(p2.id);
  });

  it("clears a game back to undecided when passed null", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await createDecidedGame(match.id, 1, p1.id, p2.id);

    await adminSetGameWinner(match.id, 1, null);

    const game = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(game.winnerId).toBeNull();
  });

  it("confirms the match and applies Elo once the edit reaches the deciding win", async () => {
    const p1 = await createTestUser({ rating: 1500 });
    const p2 = await createTestUser({ rating: 1500 });
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await createDecidedGame(match.id, 1, p1.id, p2.id);
    await createDecidedGame(match.id, 2, p1.id, p2.id);
    await createDecidedGame(match.id, 3, p1.id, p2.id);

    await adminSetGameWinner(match.id, 3, p1.id);

    const updatedMatch = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updatedMatch.status).toBe(MatchStatus.CONFIRMED);
    expect(updatedMatch.reportedWinnerId).toBe(p1.id);
  });

  it("rejects editing a CANCELLED match outright", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.CANCELLED, expiresAt: new Date() },
    });

    await expect(adminSetGameWinner(match.id, 1, p2.id)).rejects.toThrow("already closed out");
  });

  // A CONFIRMED match is still editable (unlike CANCELLED above) — but only
  // while it's still each player's most recent CONFIRMED result, same guard
  // adminCancelMatch uses. Once a newer match confirms for either player,
  // reopening this one could corrupt the newer match's before/after ratings.
  it("rejects editing a CONFIRMED match once a newer match has confirmed for either player", async () => {
    const seasonId = await activeSeasonId();
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const p3 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.CONFIRMED,
        confirmedAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(),
        seasonId,
      },
    });
    await createDecidedGame(match.id, 1, p1.id, p2.id);
    await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p3.id,
        status: MatchStatus.CONFIRMED,
        confirmedAt: new Date(),
        expiresAt: new Date(),
        seasonId,
      },
    });

    await expect(adminSetGameWinner(match.id, 1, p2.id)).rejects.toThrow("newer match has been confirmed");
  });
});

describe("adminResetMatchToZero", () => {
  it("wipes existing games and restarts a fresh, undecided game 1", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });
    await createDecidedGame(match.id, 1, p1.id, p2.id);
    await createDecidedGame(match.id, 2, p1.id, p2.id);

    await adminResetMatchToZero(match.id);

    const games = await prisma.matchGame.findMany({ where: { matchId: match.id } });
    expect(games).toHaveLength(1);
    expect(games[0].gameNumber).toBe(1);
    expect(games[0].winnerId).toBeNull();
    expect([p1.id, p2.id]).toContain(games[0].actorAId);
    expect([p1.id, p2.id]).toContain(games[0].actorBId);
  });

  it("rejects resetting a match that's already closed out", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.CONFIRMED, expiresAt: new Date() },
    });

    await expect(adminResetMatchToZero(match.id)).rejects.toThrow("already closed out");
  });
});

describe("adminCancelMatch", () => {
  it("cancels a match regardless of status", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.DISPUTED, expiresAt: new Date() },
    });

    await adminCancelMatch(match.id);

    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.status).toBe(MatchStatus.CANCELLED);
  });

  // A CONFIRMED match is cancellable (reverts Elo) rather than rejected
  // outright — but only while its pre-match ratings are on record, since
  // reverting to nothing wouldn't be safe.
  it("throws for a CONFIRMED match missing its pre-match ratings", async () => {
    const seasonId = await activeSeasonId();
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    // No confirmedAt, so isMostRecentConfirmedMatch short-circuits to false.
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.CONFIRMED,
        confirmedAt: new Date(),
        expiresAt: new Date(),
        seasonId,
      },
    });

    await expect(adminCancelMatch(match.id)).rejects.toThrow("missing its pre-match ratings");
  });

  // Same most-recent-match guard adminSetGameWinner uses — cancelling an
  // older CONFIRMED match once a newer one has confirmed for either player
  // would desync the newer match's before/after ratings.
  it("rejects cancelling a CONFIRMED match once a newer match has confirmed for either player", async () => {
    const seasonId = await activeSeasonId();
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const p3 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.CONFIRMED,
        confirmedAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(),
        player1RatingBefore: 1500,
        player2RatingBefore: 1500,
        seasonId,
      },
    });
    await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p3.id,
        status: MatchStatus.CONFIRMED,
        confirmedAt: new Date(),
        expiresAt: new Date(),
        seasonId,
      },
    });

    await expect(adminCancelMatch(match.id)).rejects.toThrow("newer match has been confirmed");
  });

  it("reverts rating and gamesPlayed, and deletes RatingHistory, for a valid CONFIRMED match", async () => {
    const seasonId = await activeSeasonId();
    const p1 = await createTestUser({ rating: 1520, gamesPlayed: 6 });
    const p2 = await createTestUser({ rating: 1480, gamesPlayed: 4 });
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.CONFIRMED,
        confirmedAt: new Date(),
        expiresAt: new Date(),
        player1RatingBefore: 1500,
        player2RatingBefore: 1500,
        seasonId,
      },
    });
    await prisma.ratingHistory.createMany({
      data: [
        { userId: p1.id, matchId: match.id, ratingBefore: 1500, ratingAfter: 1520, delta: 20 },
        { userId: p2.id, matchId: match.id, ratingBefore: 1500, ratingAfter: 1480, delta: -20 },
      ],
    });

    await adminCancelMatch(match.id);

    const [updatedMatch, updatedP1, updatedP2, history] = await Promise.all([
      prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: p1.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: p2.id } }),
      prisma.ratingHistory.findMany({ where: { matchId: match.id } }),
    ]);
    expect(updatedMatch.status).toBe(MatchStatus.CANCELLED);
    expect(updatedP1.rating).toBe(1500);
    expect(updatedP1.gamesPlayed).toBe(5);
    expect(updatedP2.rating).toBe(1500);
    expect(updatedP2.gamesPlayed).toBe(3);
    expect(history).toHaveLength(0);
  });

  it("throws for an already-cancelled match", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.CANCELLED, expiresAt: new Date() },
    });

    await expect(adminCancelMatch(match.id)).rejects.toThrow("already closed out");
  });

  it("throws for a match that doesn't exist", async () => {
    await expect(adminCancelMatch("nonexistent-id")).rejects.toThrow("not found");
  });
});
