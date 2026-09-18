import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { applyEloAndConfirm } from "@/lib/matches";
import { applyEloChainFix, findAffectedChain } from "@/lib/admin-elo-fix";
import { ConfirmationMethod, MatchStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

// Mirrors matches.integration.test.ts's own helper — creates a real
// CONFIRMED match the same way production does (via applyEloAndConfirm),
// so gamesPlayed/kFactor bookkeeping is grounded in actual match rows
// rather than a synthetic field, exactly like the live data this tool
// will run against.
async function createConfirmedMatch(winnerId: string, loserId: string) {
  const match = await prisma.ratingMatch.create({
    data: {
      player1Id: winnerId,
      player2Id: loserId,
      status: MatchStatus.PENDING_REPORT,
      expiresAt: new Date(),
      reportedWinnerId: winnerId,
      reportedById: winnerId,
      reportedAt: new Date(),
    },
  });
  await prisma.$transaction((tx) =>
    applyEloAndConfirm(tx, match, winnerId, ConfirmationMethod.SELF_CONFIRMED, { winnerId, reporterId: winnerId }),
  );
  return prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
}

describe("applyEloChainFix", () => {
  it("flips an isolated match's winner with no cascade when nobody played again after it", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const match = await createConfirmedMatch(a.id, b.id);
    expect(match.player1RatingAfter).toBeGreaterThan(match.player1RatingBefore!);

    const result = await prisma.$transaction((tx) => applyEloChainFix(tx, match.id, b.id));
    expect(result.matchCount).toBe(1);

    const fixed = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(fixed.reportedWinnerId).toBe(b.id);
    // B now won: B's after should be higher than before, A's after lower.
    expect(fixed.player1RatingAfter!).toBeLessThan(fixed.player1RatingBefore!);
    expect(fixed.player2RatingAfter!).toBeGreaterThan(fixed.player2RatingBefore!);

    const [aFinal, bFinal] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    expect(aFinal.rating).toBe(fixed.player1RatingAfter);
    expect(bFinal.rating).toBe(fixed.player2RatingAfter);
  });

  it("cascades the correction into a later match played by the same winner", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const c = await createTestUser();

    // A beats B, then (using A's now-higher rating) A beats C.
    const match1 = await createConfirmedMatch(a.id, b.id);
    const match2 = await createConfirmedMatch(a.id, c.id);
    const aRatingAfterMatch1Original = match1.player1RatingAfter!;
    expect(match2.player1RatingBefore).toBe(aRatingAfterMatch1Original);

    // Flip match1 so B wins instead — A's rating going into match2 must change too.
    const { matches: chain } = await prisma.$transaction((tx) => findAffectedChain(tx, match1.id));
    expect(chain.map((m) => m.id).sort()).toEqual([match1.id, match2.id].sort());

    const result = await prisma.$transaction((tx) => applyEloChainFix(tx, match1.id, b.id));
    expect(result.matchCount).toBe(2);

    const [fixedMatch1, fixedMatch2] = await Promise.all([
      prisma.ratingMatch.findUniqueOrThrow({ where: { id: match1.id } }),
      prisma.ratingMatch.findUniqueOrThrow({ where: { id: match2.id } }),
    ]);

    expect(fixedMatch1.reportedWinnerId).toBe(b.id);
    // A lost match1 now, so A's rating dropped instead of rose.
    expect(fixedMatch1.player1RatingAfter!).toBeLessThan(fixedMatch1.player1RatingBefore!);

    // Chain continuity: match2's ratingBefore for A must equal match1's NEW
    // ratingAfter for A, not the original (stale) value.
    expect(fixedMatch2.player1RatingBefore).toBe(fixedMatch1.player1RatingAfter);
    expect(fixedMatch2.player1RatingBefore).not.toBe(aRatingAfterMatch1Original);
    // match2's winner (A beat C) is untouched, but the numbers around it shifted.
    expect(fixedMatch2.reportedWinnerId).toBe(a.id);

    const [aFinal, bFinal, cFinal] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: b.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: c.id } }),
    ]);
    // Final live rating reflects the LAST match in each user's chain.
    expect(aFinal.rating).toBe(fixedMatch2.player1RatingAfter);
    expect(bFinal.rating).toBe(fixedMatch1.player2RatingAfter);
    expect(cFinal.rating).toBe(fixedMatch2.player2RatingAfter);

    // RatingHistory rows were updated in place, not duplicated.
    const [aHistory, cHistory] = await Promise.all([
      prisma.ratingHistory.findMany({ where: { userId: a.id } }),
      prisma.ratingHistory.findMany({ where: { userId: c.id } }),
    ]);
    expect(aHistory).toHaveLength(2);
    expect(cHistory).toHaveLength(1);
    const aMatch2History = aHistory.find((h) => h.matchId === match2.id)!;
    expect(aMatch2History.ratingBefore).toBe(fixedMatch2.player1RatingBefore);
    expect(aMatch2History.ratingAfter).toBe(fixedMatch2.player1RatingAfter);
  });

  it("does not cascade into an unrelated third player's own separate matches", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const c = await createTestUser();
    const d = await createTestUser();

    const match1 = await createConfirmedMatch(a.id, b.id);
    // c vs d never touches a or b — must not be pulled into the chain.
    const unrelated = await createConfirmedMatch(c.id, d.id);

    const { matches: chain } = await prisma.$transaction((tx) => findAffectedChain(tx, match1.id));
    expect(chain.map((m) => m.id)).toEqual([match1.id]);

    await prisma.$transaction((tx) => applyEloChainFix(tx, match1.id, b.id));

    const untouched = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: unrelated.id } });
    expect(untouched.player1RatingAfter).toBe(unrelated.player1RatingAfter);
    expect(untouched.reportedWinnerId).toBe(c.id);
  });

  it("dry run rolls back and leaves the database untouched", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const match = await createConfirmedMatch(a.id, b.id);

    await expect(
      prisma.$transaction(async (tx) => {
        await applyEloChainFix(tx, match.id, b.id);
        throw new Error("dry-run-abort");
      }),
    ).rejects.toThrow("dry-run-abort");

    const stillOriginal = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(stillOriginal.reportedWinnerId).toBe(a.id);
    expect(stillOriginal.player1RatingAfter).toBe(match.player1RatingAfter);
  });
});
