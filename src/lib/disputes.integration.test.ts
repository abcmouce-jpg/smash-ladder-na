import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { listDisputedGames, resolveDisputedGame } from "@/lib/disputes";
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
