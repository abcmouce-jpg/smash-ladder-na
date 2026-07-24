import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { listDisputedGames, resolveDisputedGame } from "@/lib/disputes";
import { MatchStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

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
    // p1 already won game 1 outright — the disputed game 2 is the decider.
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorBId: p2.id,
        actorBStrikes: 2,
        finalStage: "Battlefield",
        winnerId: p1.id,
      },
    });
    await createDisputedGame(match.id, p1.id, p2.id, 2);

    await resolveDisputedGame(match.id, 2, p1.id);

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
