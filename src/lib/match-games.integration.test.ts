import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser } from "@/test/factories";
import {
  startFirstGame,
  strikeGameStage,
  pickGameStage,
  pickGameCharacter,
  getCurrentGame,
} from "@/lib/match-games";
import { GAME_ONE_STAGES } from "@/lib/stages";

async function createMatch(p1: string, p2: string) {
  return prisma.ratingMatch.create({
    data: { player1Id: p1, player2Id: p2, expiresAt: new Date() },
  });
}

describe("character lock-in gates stage striking", () => {
  it("rejects a strike from a player who hasn't locked in a character yet", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await startFirstGame(p1.id, match.id);
    const game = await getCurrentGame(match.id);
    if (!game) throw new Error("expected game 1 to exist");

    await expect(
      strikeGameStage(game.actorAId, match.id, 1, GAME_ONE_STAGES[0]),
    ).rejects.toThrow(/character/i);
  });

  it("allows a strike once the striking player has locked in a character", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await startFirstGame(p1.id, match.id);
    const game = await getCurrentGame(match.id);
    if (!game) throw new Error("expected game 1 to exist");

    await pickGameCharacter(game.actorAId, match.id, 1, "Mario");
    await strikeGameStage(game.actorAId, match.id, 1, GAME_ONE_STAGES[0]);

    const updated = await getCurrentGame(match.id);
    expect(updated?.struckStages).toEqual([GAME_ONE_STAGES[0]]);
  });

  it("rejects the final stage pick from a player who hasn't locked in a character yet", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    // Manually seed game 2 already past the strike phase (actorB is the
    // 0-strike counterpick loser, so it's straight to their pick).
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 2,
        actorAId: p1.id,
        actorAStrikes: 3,
        actorBId: p2.id,
        actorBStrikes: 0,
        stagesRemaining: ["Final Destination"],
        struckStages: ["Battlefield", "Small Battlefield", "Smashville"],
      },
    });

    await expect(
      pickGameStage(p2.id, match.id, 2, "Final Destination"),
    ).rejects.toThrow(/character/i);
  });

  it("allows the final stage pick once that player has locked in a character", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 2,
        actorAId: p1.id,
        actorAStrikes: 3,
        actorBId: p2.id,
        actorBStrikes: 0,
        stagesRemaining: ["Final Destination"],
        struckStages: ["Battlefield", "Small Battlefield", "Smashville"],
      },
    });

    await pickGameCharacter(p1.id, match.id, 2, "Mario"); // actorA locks in first, per game 2+ rules
    await pickGameCharacter(p2.id, match.id, 2, "Fox");
    await pickGameStage(p2.id, match.id, 2, "Final Destination");

    const updated = await prisma.matchGame.findUnique({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 2 } },
    });
    expect(updated?.finalStage).toBe("Final Destination");
  });
});
