import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import {
  getMatchGames,
  strikeGameStage,
  unstrikeLastGameStage,
  STRIKE_TIMEOUT_MS,
  CHARACTER_TIMEOUT_MS,
} from "@/lib/match-games";
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
        actorACharacter: "Mario",
        actorBId: p2.id,
        actorBStrikes: 2,
        actorBCharacter: "Luigi",
        stagesRemaining: ["Battlefield", "Small Battlefield", "Smashville"],
        turnStartedAt: new Date(Date.now() - STRIKE_TIMEOUT_MS - 1000),
      },
    });

    const games = await getMatchGames(match.id);
    expect(games[0].struckStages).toHaveLength(1);
    expect(games[0].stagesRemaining).toHaveLength(2);
  });

  it("does not auto-strike while either character is still unlocked, even past the strike timeout", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorACharacter: "Mario", // only actorA has locked in
        actorBId: p2.id,
        actorBStrikes: 2,
        stagesRemaining: ["Battlefield", "Small Battlefield", "Smashville"],
        turnStartedAt: new Date(Date.now() - STRIKE_TIMEOUT_MS - 1000),
      },
    });

    const games = await getMatchGames(match.id);
    expect(games[0].struckStages).toEqual([]);
    expect(games[0].stagesRemaining).toHaveLength(3);
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
        actorACharacter: "Mario",
        actorBId: p2.id,
        actorBStrikes: 1,
        actorBCharacter: "Luigi",
        stagesRemaining: ["Smashville"],
        struckStages: ["Battlefield", "Small Battlefield"],
        turnStartedAt: new Date(Date.now() - STRIKE_TIMEOUT_MS - 1000),
      },
    });

    const games = await getMatchGames(match.id);
    expect(games[0].finalStage).toBe("Smashville");
    // actorAStrikes === actorBStrikes here, so picker() falls to actorB (the `<` tie-break)
    expect(games[0].actorBCharacter).not.toBeNull();
  });

  it("resets the clock once a strike hands the turn to the next player", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorACharacter: "Mario", // strikeGameStage requires both to have locked in first
        actorBId: p2.id,
        actorBStrikes: 2,
        actorBCharacter: "Luigi",
        stagesRemaining: ["Battlefield", "Small Battlefield", "Smashville"],
        turnStartedAt: new Date(Date.now() - 30 * 1000), // old, but not stale yet
      },
    });

    await strikeGameStage(p1.id, match.id, 1, "Battlefield");

    const updated = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    // p1's single strike ends their turn and passes it to p2, so p2 gets a fresh clock.
    expect(Date.now() - updated.turnStartedAt.getTime()).toBeLessThan(5000);
  });

  it("keeps one continuous clock across a player's consecutive strikes", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    const turnStartedAt = new Date(Date.now() - 30 * 1000); // p2's turn started 30s ago
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorACharacter: "Mario",
        actorBId: p2.id,
        actorBStrikes: 2,
        actorBCharacter: "Luigi",
        struckStages: ["Battlefield"], // p1's single strike is done — it's p2's 2-strike turn
        stagesRemaining: ["Small Battlefield", "Smashville", "Pokémon Stadium 2"],
        turnStartedAt,
      },
    });

    // p2's first strike — still owes one more, so the turn clock keeps running.
    await strikeGameStage(p2.id, match.id, 1, "Small Battlefield");
    let updated = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(updated.turnStartedAt.getTime()).toBe(turnStartedAt.getTime());

    // p2's second strike completes the turn — the picker gets a fresh clock.
    await strikeGameStage(p2.id, match.id, 1, "Smashville");
    updated = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(updated.turnStartedAt.getTime()).toBeGreaterThan(turnStartedAt.getTime());
  });

  it("keeps the turn clock running when the player unstrikes", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    const turnStartedAt = new Date(Date.now() - 30 * 1000);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorACharacter: "Mario",
        actorBId: p2.id,
        actorBStrikes: 2,
        actorBCharacter: "Luigi",
        struckStages: ["Battlefield", "Small Battlefield"], // p1's + p2's first — still p2's turn
        stagesRemaining: ["Smashville", "Pokémon Stadium 2"],
        turnStartedAt,
      },
    });

    await unstrikeLastGameStage(p2.id, match.id, 1);

    const updated = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(updated.struckStages).toEqual(["Battlefield"]);
    // Undoing a strike hands the turn back to the same player, so the clock is untouched.
    expect(updated.turnStartedAt.getTime()).toBe(turnStartedAt.getTime());
  });

  it("auto-bans the whole stale turn's allotment at once, then hands the next player a fresh clock", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    const turnStartedAt = new Date(Date.now() - STRIKE_TIMEOUT_MS - 1000); // already stale
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorACharacter: "Mario",
        actorBId: p2.id,
        actorBStrikes: 2,
        actorBCharacter: "Luigi",
        struckStages: ["Battlefield"], // p1's strike is done — p2's 2-strike turn is stale
        stagesRemaining: ["Small Battlefield", "Smashville", "Pokémon Stadium 2"],
        turnStartedAt,
      },
    });

    // One read: p2's ENTIRE 2-strike allotment auto-applies at the turn's
    // single deadline — not one strike per check.
    const games = await getMatchGames(match.id);
    expect(games[0].struckStages).toHaveLength(3); // p1's + p2's two, all at once
    expect(games[0].stagesRemaining).toHaveLength(1); // one stage left for the picker
    // The turn passed to the picker, who gets a fresh clock.
    expect(Date.now() - games[0].turnStartedAt.getTime()).toBeLessThan(5000);
  });

  it("auto-bans all 3 of a stale counterpick winner's strikes at once", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 2,
        actorAId: p1.id,
        actorAStrikes: 3,
        actorACharacter: "Mario",
        actorBId: p2.id,
        actorBStrikes: 0,
        actorBCharacter: "Luigi",
        stagesRemaining: ["Battlefield", "Small Battlefield", "Smashville", "Final Destination"],
        turnStartedAt: new Date(Date.now() - STRIKE_TIMEOUT_MS - 1000),
      },
    });

    const games = await getMatchGames(match.id);
    expect(games[0].struckStages).toHaveLength(3); // all three owed bans, applied at once
    expect(games[0].stagesRemaining).toHaveLength(1); // loser still has a stage to pick
  });
});

describe("stale character-pick auto-resolution", () => {
  it("does nothing before the character-select timeout elapses", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorACharacter: "Mario",
        actorBId: p2.id,
        actorBStrikes: 2,
        stagesRemaining: ["Battlefield", "Small Battlefield", "Smashville"],
      },
    });

    const games = await getMatchGames(match.id);
    expect(games[0].winnerId).toBeNull();
  });

  it("forfeits the whole match to whichever player locked in, and dings the ghost's noShowCount, once the timeout elapses", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorACharacter: "Mario", // p1 locked in; p2 never did
        actorBId: p2.id,
        actorBStrikes: 2,
        stagesRemaining: ["Battlefield", "Small Battlefield", "Smashville"],
        createdAt: new Date(Date.now() - CHARACTER_TIMEOUT_MS - 1000),
      },
    });

    const games = await getMatchGames(match.id);
    expect(games[0].winnerId).toBe(p1.id);

    const updatedP2 = await prisma.user.findUniqueOrThrow({ where: { id: p2.id } });
    expect(updatedP2.noShowCount).toBe(1);

    // A ghost who never locked in isn't coming back for game 2 either — the
    // whole match is forfeited to p1, so no game 2 ever gets created.
    const game2 = await prisma.matchGame.findUnique({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 2 } },
    });
    expect(game2).toBeNull();

    const updatedMatch = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updatedMatch.status).toBe("CONFIRMED");
    expect(updatedMatch.reportedWinnerId).toBe(p1.id);
  });

  it("does nothing once the character-select timeout has elapsed if neither player locked in", async () => {
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
        createdAt: new Date(Date.now() - CHARACTER_TIMEOUT_MS - 1000),
      },
    });

    const games = await getMatchGames(match.id);
    expect(games[0].winnerId).toBeNull();
  });

  it("does nothing once both characters are already locked in, no matter how old the game row is", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 1,
        actorAId: p1.id,
        actorAStrikes: 1,
        actorACharacter: "Mario",
        actorBId: p2.id,
        actorBStrikes: 2,
        actorBCharacter: "Luigi",
        stagesRemaining: ["Battlefield", "Small Battlefield", "Smashville"],
        createdAt: new Date(Date.now() - CHARACTER_TIMEOUT_MS - 1000),
      },
    });

    const games = await getMatchGames(match.id);
    expect(games[0].winnerId).toBeNull();
  });
});
