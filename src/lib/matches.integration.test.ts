import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { applyEloAndConfirm } from "@/lib/matches";
import { ConfirmationMethod, MatchStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

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
      applyEloAndConfirm(
        tx,
        match,
        winner.id,
        ConfirmationMethod.SELF_CONFIRMED,
        { winnerId: winner.id, reporterId: winner.id },
      ),
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
});
