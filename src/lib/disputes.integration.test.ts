import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import {
  listDisputedGames,
  listLiveMatches,
  requestDisputeResolution,
  resolveDisputedGame,
  adminSetGameWinner,
  adminResetMatchToZero,
} from "@/lib/disputes";
import { MatchStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

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

async function createDisputedGame(matchId: string, p1: string, p2: string, gameNumber = 1) {
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

  it("rejects editing a match that's already closed out", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.CONFIRMED, expiresAt: new Date() },
    });
    await createDecidedGame(match.id, 1, p1.id, p2.id);

    await expect(adminSetGameWinner(match.id, 1, p2.id)).rejects.toThrow("already closed out");
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
