import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { finalizeExpiredMatches } from "@/lib/finalize";
import { MatchStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

const past = new Date(Date.now() - 60_000);

describe("finalizeExpiredMatches", () => {
  it("expires a match nobody reported on, with no rating impact", async () => {
    const a = await createTestUser({ rating: 1500 });
    const b = await createTestUser({ rating: 1500 });
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: a.id,
        player2Id: b.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: past,
      },
    });

    const result = await finalizeExpiredMatches(new Date());

    expect(result.expiredNoReport).toBe(1);
    expect(result.autoConfirmed).toBe(0);
    const updated = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updated.status).toBe(MatchStatus.EXPIRED);
    const [userA, userB] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    expect(userA.rating).toBe(1500);
    expect(userB.rating).toBe(1500);
  });

  it("auto-confirms a hanging report and charges the non-reporter a no-show", async () => {
    const reporter = await createTestUser({ rating: 1500 });
    const ghost = await createTestUser({ rating: 1500 });
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: reporter.id,
        player2Id: ghost.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: past,
      },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: reporter.id,
        actorAStrikes: 1,
        actorBId: ghost.id,
        actorBStrikes: 2,
        finalStage: "Battlefield",
        reportedWinnerId: reporter.id,
        reportedById: reporter.id,
        reportedAt: past,
      },
    });

    const result = await finalizeExpiredMatches(new Date());

    expect(result.autoConfirmed).toBe(1);
    expect(result.expiredNoReport).toBe(0);

    const updatedGhost = await prisma.user.findUniqueOrThrow({ where: { id: ghost.id } });
    expect(updatedGhost.noShowCount).toBe(1);
  });

  it("leaves not-yet-expired matches untouched", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await prisma.ratingMatch.create({
      data: {
        player1Id: a.id,
        player2Id: b.id,
        status: MatchStatus.PENDING_REPORT,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const result = await finalizeExpiredMatches(new Date());
    expect(result.expiredNoReport).toBe(0);
    expect(result.autoConfirmed).toBe(0);
  });
});
