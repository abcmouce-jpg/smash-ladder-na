import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser } from "@/test/factories";
import { MatchStatus, ConfirmationMethod } from "@/generated/prisma/enums";
import { adminConfirmCancelledMatch, cancelledMatchIsConvertible } from "@/lib/matches";

async function activeSeason() {
  const existing = await prisma.season.findFirst({ where: { endsAt: null } });
  if (existing) return existing;
  return prisma.season.create({ data: { name: "Season 1", startsAt: new Date(Date.now() - 86_400_000) } });
}

async function cancelledMatch(p1: string, p2: string, createdAt = new Date()) {
  return prisma.ratingMatch.create({
    data: { player1Id: p1, player2Id: p2, expiresAt: new Date(), status: MatchStatus.CANCELLED, createdAt },
  });
}

describe("converting a cancelled set into a win", () => {
  beforeEach(async () => {
    await activeSeason();
  });

  it("rates it, and records the winner as the winner", async () => {
    const p1 = await createTestUser({ rating: 1500 });
    const p2 = await createTestUser({ rating: 1500 });
    const match = await cancelledMatch(p1.id, p2.id);

    await adminConfirmCancelledMatch(match.id, p1.id);

    const after = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(after.status).toBe(MatchStatus.CONFIRMED);
    expect(after.confirmedAt).not.toBeNull();
    expect(after.confirmationMethod).toBe(ConfirmationMethod.ADMIN_RESOLVED);
    // The badge on the winner's own profile reads off reportedWinnerId, which
    // applyEloAndConfirm does not set — the bug adminForceConfirmMatch's own
    // comment warns about, so assert it rather than trusting the rating move.
    expect(after.reportedWinnerId).toBe(p1.id);

    const [w, l] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: p1.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: p2.id } }),
    ]);
    expect(w.rating).toBeGreaterThan(1500);
    expect(l.rating).toBeLessThan(1500);
    expect(w.gamesPlayed).toBe(1);
    expect(l.gamesPlayed).toBe(1);
  });

  it("refuses a winner who was not in the set", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const stranger = await createTestUser();
    const match = await cancelledMatch(p1.id, p2.id);
    await expect(adminConfirmCancelledMatch(match.id, stranger.id)).rejects.toThrow();
  });

  it("refuses a set that was never cancelled", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, expiresAt: new Date(), status: MatchStatus.PENDING_REPORT },
    });
    await expect(adminConfirmCancelledMatch(match.id, p1.id)).rejects.toThrow();
  });

  // The whole safety argument: every rating after this point was computed
  // without this set in it, and nothing here recomputes a chain.
  it("refuses once either player has a rated set after it", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const later = await createTestUser();
    const match = await cancelledMatch(p1.id, p2.id, new Date(Date.now() - 3_600_000));

    expect(await cancelledMatchIsConvertible(prisma, match)).toBe(true);

    await prisma.ratingMatch.create({
      data: {
        player1Id: p2.id,
        player2Id: later.id,
        expiresAt: new Date(),
        status: MatchStatus.CONFIRMED,
        confirmedAt: new Date(),
        reportedWinnerId: p2.id,
      },
    });

    expect(await cancelledMatchIsConvertible(prisma, match)).toBe(false);
    await expect(adminConfirmCancelledMatch(match.id, p1.id)).rejects.toThrow();
  });

  it("refuses a set from before the current season", async () => {
    const season = await activeSeason();
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await cancelledMatch(p1.id, p2.id, new Date(season.startsAt.getTime() - 86_400_000));
    expect(await cancelledMatchIsConvertible(prisma, match)).toBe(false);
    await expect(adminConfirmCancelledMatch(match.id, p1.id)).rejects.toThrow();
  });

  it("leaves the rating alone when it refuses", async () => {
    const p1 = await createTestUser({ rating: 1500 });
    const p2 = await createTestUser({ rating: 1500 });
    const stranger = await createTestUser();
    const match = await cancelledMatch(p1.id, p2.id);
    await expect(adminConfirmCancelledMatch(match.id, stranger.id)).rejects.toThrow();
    const still = await prisma.user.findUniqueOrThrow({ where: { id: p1.id } });
    expect(still.rating).toBe(1500);
    expect(still.gamesPlayed).toBe(0);
  });
});
