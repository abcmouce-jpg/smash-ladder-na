import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import {
  getMatchGames,
  strikeGameStage,
  unstrikeLastGameStage,
  STRIKE_TIMEOUT_MS,
  CHARACTER_PICK_TIMEOUT_MS,
} from "@/lib/match-games";
import { SMASH_CHARACTERS } from "@/lib/characters";
import { createTestUser } from "@/test/factories";

async function createMatch(p1: string, p2: string) {
  return prisma.ratingMatch.create({
    data: { player1Id: p1, player2Id: p2, expiresAt: new Date() },
  });
}

describe("unstrikeLastGameStage", () => {
  it("undoes the striking player's own most recent strike", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorBId: p2.id,
        actorBStrikes: 2,
        stagesRemaining: ["Small Battlefield", "Smashville"],
        struckStages: ["Battlefield"],
      },
    });

    await unstrikeLastGameStage(p1.id, match.id, 1);

    const updated = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(updated.struckStages).toEqual([]);
    expect(updated.stagesRemaining.sort()).toEqual(["Battlefield", "Small Battlefield", "Smashville"].sort());
  });

  it("rejects undoing a strike that belongs to the other player", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorBId: p2.id,
        actorBStrikes: 2,
        stagesRemaining: ["Small Battlefield", "Smashville"],
        struckStages: ["Battlefield"], // p1's strike — it's now p2's turn
      },
    });

    await expect(unstrikeLastGameStage(p2.id, match.id, 1)).rejects.toThrow(/only undo your own/i);
  });

  it("rejects undoing when nothing has been struck yet", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorBId: p2.id,
        actorBStrikes: 2,
        stagesRemaining: ["Battlefield", "Small Battlefield", "Smashville"],
      },
    });

    await expect(unstrikeLastGameStage(p1.id, match.id, 1)).rejects.toThrow(/nothing to undo/i);
  });
});

describe("stale turn auto-resolution", () => {
  it("leaves a fresh turn untouched", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorBId: p2.id,
        actorBStrikes: 2,
        stagesRemaining: ["Battlefield", "Small Battlefield", "Smashville"],
      },
    });

    const games = await getMatchGames(match.id);
    expect(games[0].struckStages).toEqual([]);
    expect(games[0].finalStage).toBeNull();
  });

  it("auto-strikes a random remaining stage once a turn goes stale", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorACharacter: "Mario", // already locked in — isolates the stage-timeout path
        actorBId: p2.id,
        actorBStrikes: 2,
        stagesRemaining: ["Battlefield", "Small Battlefield", "Smashville"],
        turnStartedAt: new Date(Date.now() - STRIKE_TIMEOUT_MS - 1000),
      },
    });

    const games = await getMatchGames(match.id);
    expect(games[0].struckStages).toHaveLength(1);
    expect(games[0].stagesRemaining).toHaveLength(2);
  });

  it("does NOT auto-strike or auto-lock a character just past the stage-strike timeout if no character is locked yet", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorBId: p2.id,
        actorBStrikes: 2,
        stagesRemaining: ["Battlefield", "Small Battlefield", "Smashville"],
        turnStartedAt: new Date(Date.now() - STRIKE_TIMEOUT_MS - 1000), // past the 60s stage timer...
      },
    });

    // ...but well within the longer character-pick grace period, so nothing
    // should be forced yet — this is the exact regression that was reported
    // in production: players getting auto-locked onto characters they
    // hadn't picked, because this used to share the 60s stage-strike clock.
    const games = await getMatchGames(match.id);
    expect(games[0].actorACharacter).toBeNull();
    expect(games[0].struckStages).toEqual([]);
  });

  it("backfills a character for the striker only after the longer character-pick grace period elapses", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorBId: p2.id,
        actorBStrikes: 2,
        stagesRemaining: ["Battlefield", "Small Battlefield", "Smashville"],
        turnStartedAt: new Date(Date.now() - CHARACTER_PICK_TIMEOUT_MS - 1000),
      },
    });

    const games = await getMatchGames(match.id);
    expect(games[0].actorACharacter).not.toBeNull();
    expect(SMASH_CHARACTERS).toContain(games[0].actorACharacter);
    expect(games[0].actorBCharacter).toBeNull(); // not their turn yet — untouched
    // Stage striking isn't auto-resolved in the same pass — the player gets
    // a fresh full STRIKE_TIMEOUT_MS window to actually act now that they
    // have a character, instead of the stage being forced immediately too.
    expect(games[0].struckStages).toEqual([]);
  });

  it("doesn't overwrite a character the striker already locked in", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorBId: p2.id,
        actorBStrikes: 2,
        actorACharacter: "Mario",
        stagesRemaining: ["Battlefield", "Small Battlefield", "Smashville"],
        turnStartedAt: new Date(Date.now() - STRIKE_TIMEOUT_MS - 1000),
      },
    });

    const games = await getMatchGames(match.id);
    expect(games[0].actorACharacter).toBe("Mario");
  });

  it("auto-picks a random final stage once a stale picking turn resolves", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorBId: p2.id,
        actorBStrikes: 1,
        actorBCharacter: "Luigi", // already locked in — isolates the stage-timeout path
        stagesRemaining: ["Smashville"],
        struckStages: ["Battlefield", "Small Battlefield"],
        turnStartedAt: new Date(Date.now() - STRIKE_TIMEOUT_MS - 1000),
      },
    });

    const games = await getMatchGames(match.id);
    expect(games[0].finalStage).toBe("Smashville");
  });

  it("resets turnStartedAt after a normal strike", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorBId: p2.id,
        actorBStrikes: 2,
        stagesRemaining: ["Battlefield", "Small Battlefield", "Smashville"],
        actorACharacter: "Mario",
        turnStartedAt: new Date(Date.now() - 30 * 1000), // old, but not stale yet
      },
    });

    await strikeGameStage(p1.id, match.id, 1, "Battlefield");

    const updated = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(Date.now() - updated.turnStartedAt.getTime()).toBeLessThan(5000);
  });
});
