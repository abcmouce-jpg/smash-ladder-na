import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser } from "@/test/factories";
import {
  startFirstGame,
  strikeGameStage,
  strikeSameBans,
  pickGameStage,
  pickSameStage,
  pickGameCharacter,
  getCurrentGame,
  getMatchGames,
  reportGameResult,
  escalateGameDispute,
  CHARACTER_TIMEOUT_MS,
  REPORT_TIMEOUT_MS,
} from "@/lib/match-games";
import { GAME_ONE_STAGES, COUNTERPICK_STAGES } from "@/lib/stages";

async function createMatch(p1: string, p2: string) {
  return prisma.ratingMatch.create({
    data: { player1Id: p1, player2Id: p2, expiresAt: new Date() },
  });
}

describe("auto-forfeit for a stale character pick", () => {
  it("does nothing before CHARACTER_TIMEOUT_MS has elapsed since the game was created", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await startFirstGame(p1.id, match.id);
    const game = await getCurrentGame(match.id);
    if (!game) throw new Error("expected game 1 to exist");
    await pickGameCharacter(game.actorAId, match.id, 1, "Mario"); // only one side locks in

    const games = await getMatchGames(match.id);
    expect(games.find((g) => g.gameNumber === 1)?.winnerId).toBeNull();
  });

  it("forfeits the game to whoever locked in once CHARACTER_TIMEOUT_MS has elapsed", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await startFirstGame(p1.id, match.id);
    const game = await getCurrentGame(match.id);
    if (!game) throw new Error("expected game 1 to exist");
    await pickGameCharacter(game.actorAId, match.id, 1, "Mario");
    await prisma.matchGame.update({
      where: { id: game.id },
      data: { createdAt: new Date(Date.now() - CHARACTER_TIMEOUT_MS - 1000) },
    });

    const games = await getMatchGames(match.id);
    const resolved = games.find((g) => g.gameNumber === 1);
    expect(resolved?.winnerId).toBe(game.actorAId);

    const opponent = await prisma.user.findUniqueOrThrow({
      where: { id: game.actorAId === p1.id ? p2.id : p1.id },
    });
    expect(opponent.noShowCount).toBe(1);
    expect(opponent.recentTimeoutCount).toBe(1);
    expect(opponent.queueCooldownUntil).not.toBeNull();
    expect(opponent.queueCooldownUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("escalates the cooldown on a second timeout", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser({
      recentTimeoutCount: 1,
      lastTimeoutAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago — still within the reset window
    });
    const match = await createMatch(p1.id, p2.id);
    await startFirstGame(p2.id, match.id);
    const game = await getCurrentGame(match.id);
    if (!game) throw new Error("expected game 1 to exist");
    // p1 (the non-ghost) locks in; p2 stays a no-show.
    const nonGhostId = game.actorAId === p2.id ? game.actorBId : game.actorAId;
    await pickGameCharacter(nonGhostId, match.id, 1, "Mario");
    await prisma.matchGame.update({
      where: { id: game.id },
      data: { createdAt: new Date(Date.now() - CHARACTER_TIMEOUT_MS - 1000) },
    });

    await getMatchGames(match.id);

    const ghost = await prisma.user.findUniqueOrThrow({ where: { id: p2.id } });
    expect(ghost.recentTimeoutCount).toBe(2);
    expect(ghost.noShowCount).toBe(1);
  });

  it("does nothing when neither side has locked in yet, even past the timeout", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await startFirstGame(p1.id, match.id);
    const game = await getCurrentGame(match.id);
    if (!game) throw new Error("expected game 1 to exist");
    await prisma.matchGame.update({
      where: { id: game.id },
      data: { createdAt: new Date(Date.now() - CHARACTER_TIMEOUT_MS - 1000) },
    });

    const games = await getMatchGames(match.id);
    expect(games.find((g) => g.gameNumber === 1)?.winnerId).toBeNull();
  });
});

describe("auto-confirm for a stale game report", () => {
  it("does nothing before REPORT_TIMEOUT_MS has elapsed since the stage was picked", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await startFirstGame(p1.id, match.id);
    const game = await getCurrentGame(match.id);
    if (!game) throw new Error("expected game 1 to exist");
    await prisma.matchGame.update({
      where: { id: game.id },
      data: {
        finalStage: "Final Destination",
        reportedById: p1.id,
        reportedWinnerId: p1.id,
        reportedAt: new Date(),
      },
    });

    const games = await getMatchGames(match.id);
    expect(games.find((g) => g.gameNumber === 1)?.winnerId).toBeNull();
  });

  it("auto-confirms a lone hanging report once REPORT_TIMEOUT_MS has elapsed, charging the silent side a no-show", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await startFirstGame(p1.id, match.id);
    const game = await getCurrentGame(match.id);
    if (!game) throw new Error("expected game 1 to exist");
    await prisma.matchGame.update({
      where: { id: game.id },
      data: {
        finalStage: "Final Destination",
        turnStartedAt: new Date(Date.now() - REPORT_TIMEOUT_MS - 1000),
        reportedById: p1.id,
        reportedWinnerId: p1.id,
        reportedAt: new Date(Date.now() - REPORT_TIMEOUT_MS - 1000),
      },
    });

    const games = await getMatchGames(match.id);
    const resolved = games.find((g) => g.gameNumber === 1);
    expect(resolved?.winnerId).toBe(p1.id);

    // The set isn't decided, so game 2 gets created and the match gets a fresh
    // deadline rather than expiring mid-set on the original one.
    expect(games.find((g) => g.gameNumber === 2)).toBeDefined();
    const updatedMatch = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(updatedMatch.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const ghost = await prisma.user.findUniqueOrThrow({ where: { id: p2.id } });
    expect(ghost.noShowCount).toBe(1);
    expect(ghost.recentTimeoutCount).toBe(1);
    expect(ghost.queueCooldownUntil).not.toBeNull();
    expect(ghost.queueCooldownUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("does nothing when nobody reported, even past the deadline", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await startFirstGame(p1.id, match.id);
    const game = await getCurrentGame(match.id);
    if (!game) throw new Error("expected game 1 to exist");
    await prisma.matchGame.update({
      where: { id: game.id },
      data: {
        finalStage: "Final Destination",
        turnStartedAt: new Date(Date.now() - REPORT_TIMEOUT_MS - 1000),
      },
    });

    const games = await getMatchGames(match.id);
    expect(games.find((g) => g.gameNumber === 1)?.winnerId).toBeNull();
  });

  it("does nothing for a disputed game, even past the deadline", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await startFirstGame(p1.id, match.id);
    const game = await getCurrentGame(match.id);
    if (!game) throw new Error("expected game 1 to exist");
    await prisma.matchGame.update({
      where: { id: game.id },
      data: {
        finalStage: "Final Destination",
        turnStartedAt: new Date(Date.now() - REPORT_TIMEOUT_MS - 1000),
        reportedById: p1.id,
        reportedWinnerId: p1.id,
        reportedAt: new Date(Date.now() - REPORT_TIMEOUT_MS - 1000),
        secondReportById: p2.id,
        secondReportWinnerId: p2.id,
        secondReportAt: new Date(Date.now() - REPORT_TIMEOUT_MS - 1000),
      },
    });

    const games = await getMatchGames(match.id);
    expect(games.find((g) => g.gameNumber === 1)?.winnerId).toBeNull();
  });
});

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

  it("still rejects a strike when only the striking player has locked in (opponent hasn't)", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await startFirstGame(p1.id, match.id);
    const game = await getCurrentGame(match.id);
    if (!game) throw new Error("expected game 1 to exist");

    await pickGameCharacter(game.actorAId, match.id, 1, "Mario");

    await expect(
      strikeGameStage(game.actorAId, match.id, 1, GAME_ONE_STAGES[0]),
    ).rejects.toThrow(/character/i);
  });

  it("allows a strike once both players have locked in a character", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await startFirstGame(p1.id, match.id);
    const game = await getCurrentGame(match.id);
    if (!game) throw new Error("expected game 1 to exist");
    const opponentId = game.actorAId === p1.id ? p2.id : p1.id;

    await pickGameCharacter(game.actorAId, match.id, 1, "Mario");
    await pickGameCharacter(opponentId, match.id, 1, "Luigi");
    await strikeGameStage(game.actorAId, match.id, 1, GAME_ONE_STAGES[0]);

    const updated = await getCurrentGame(match.id);
    expect(updated?.struckStages).toEqual([GAME_ONE_STAGES[0]]);
  });

  it("starts the stage-strike clock only once the second player locks in a character", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await startFirstGame(p1.id, match.id);
    const game = await getCurrentGame(match.id);
    if (!game) throw new Error("expected game 1 to exist");
    const opponentId = game.actorAId === p1.id ? p2.id : p1.id;

    await pickGameCharacter(game.actorAId, match.id, 1, "Mario");
    const afterFirstPick = await getCurrentGame(match.id);

    await pickGameCharacter(opponentId, match.id, 1, "Luigi");
    const afterSecondPick = await getCurrentGame(match.id);

    expect(afterSecondPick!.turnStartedAt.getTime()).toBeGreaterThan(
      afterFirstPick!.turnStartedAt.getTime(),
    );
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

  it("allows the final stage pick once both players have locked in a character", async () => {
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

describe("strikeSameBans", () => {
  async function seedCompletedThreeStrikeTurn(matchId: string, p1: string, p2: string) {
    await prisma.matchGame.create({
      data: {
        matchId,
        gameNumber: 2,
        actorAId: p1,
        actorAStrikes: 3,
        actorBId: p2,
        actorBStrikes: 0,
        struckStages: [COUNTERPICK_STAGES[0], COUNTERPICK_STAGES[1], COUNTERPICK_STAGES[2]],
        stagesRemaining: COUNTERPICK_STAGES.slice(3),
      },
    });
  }

  it("applies the same 3 stages as the player's last completed 3-strike turn", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await seedCompletedThreeStrikeTurn(match.id, p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 4,
        actorAId: p1.id,
        actorAStrikes: 3,
        actorBId: p2.id,
        actorBStrikes: 0,
        actorACharacter: "Mario",
        actorBCharacter: "Fox",
        stagesRemaining: [...COUNTERPICK_STAGES],
      },
    });

    await strikeSameBans(p1.id, match.id, 4);

    const updated = await prisma.matchGame.findUnique({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 4 } },
    });
    expect(updated?.struckStages).toEqual([COUNTERPICK_STAGES[0], COUNTERPICK_STAGES[1], COUNTERPICK_STAGES[2]]);
    expect(updated?.stagesRemaining).toEqual(COUNTERPICK_STAGES.slice(3));
  });

  it("rejects when it isn't the calling player's turn to strike", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await seedCompletedThreeStrikeTurn(match.id, p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 4,
        actorAId: p1.id,
        actorAStrikes: 3,
        actorBId: p2.id,
        actorBStrikes: 0,
        actorACharacter: "Mario",
        actorBCharacter: "Fox",
        stagesRemaining: [...COUNTERPICK_STAGES],
      },
    });

    await expect(strikeSameBans(p2.id, match.id, 4)).rejects.toThrow(/not your turn/i);
  });

  it("rejects the counterpick loser — actorB never has a strike turn to repeat", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await seedCompletedThreeStrikeTurn(match.id, p1.id, p2.id);
    // Game 4: p2 (actorA) already struck their 3 — it's the pick phase now,
    // not a strike turn at all, so p1 (actorB) hits "striking is done"
    // rather than a same-bans-specific rejection.
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 4,
        actorAId: p2.id,
        actorAStrikes: 3,
        actorBId: p1.id,
        actorBStrikes: 0,
        actorACharacter: "Fox",
        actorBCharacter: "Mario",
        struckStages: [COUNTERPICK_STAGES[0], COUNTERPICK_STAGES[1], COUNTERPICK_STAGES[2]],
        stagesRemaining: COUNTERPICK_STAGES.slice(3),
      },
    });

    await expect(strikeSameBans(p1.id, match.id, 4)).rejects.toThrow(/striking is done/i);
  });

  it("rejects when the player has already struck stages this turn", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await seedCompletedThreeStrikeTurn(match.id, p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 4,
        actorAId: p1.id,
        actorAStrikes: 3,
        actorBId: p2.id,
        actorBStrikes: 0,
        actorACharacter: "Mario",
        actorBCharacter: "Fox",
        struckStages: [COUNTERPICK_STAGES[0]],
        stagesRemaining: COUNTERPICK_STAGES.slice(1),
      },
    });

    await expect(strikeSameBans(p1.id, match.id, 4)).rejects.toThrow(/already struck/i);
  });

  it("rejects when there is no prior 3-strike turn to repeat", async () => {
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
        actorACharacter: "Mario",
        actorBCharacter: "Fox",
        stagesRemaining: [...COUNTERPICK_STAGES],
      },
    });

    await expect(strikeSameBans(p1.id, match.id, 2)).rejects.toThrow(/no prior bans/i);
  });

  it("rejects before both characters are locked in", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await seedCompletedThreeStrikeTurn(match.id, p1.id, p2.id);
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 4,
        actorAId: p1.id,
        actorAStrikes: 3,
        actorBId: p2.id,
        actorBStrikes: 0,
        actorACharacter: "Mario",
        stagesRemaining: [...COUNTERPICK_STAGES],
      },
    });

    await expect(strikeSameBans(p1.id, match.id, 4)).rejects.toThrow(/character/i);
  });
});

describe("pickSameStage", () => {
  it("picks the previous game's stage when it's still available", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: { matchId: match.id, gameNumber: 1, actorAId: p1.id, actorAStrikes: 1, actorBId: p2.id, actorBStrikes: 2, stagesRemaining: [], finalStage: COUNTERPICK_STAGES[0] },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 2,
        actorAId: p2.id, // game 1's winner strikes first
        actorAStrikes: 3,
        actorBId: p1.id,
        actorBStrikes: 0,
        actorACharacter: "Fox",
        actorBCharacter: "Mario",
        struckStages: COUNTERPICK_STAGES.slice(1, 4),
        stagesRemaining: COUNTERPICK_STAGES.filter((s) => !COUNTERPICK_STAGES.slice(1, 4).includes(s)),
      },
    });

    await pickSameStage(p1.id, match.id, 2);

    const updated = await prisma.matchGame.findUnique({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 2 } },
    });
    expect(updated?.finalStage).toBe(COUNTERPICK_STAGES[0]);
  });

  it("rejects when the previous stage was struck this game", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: { matchId: match.id, gameNumber: 1, actorAId: p1.id, actorAStrikes: 1, actorBId: p2.id, actorBStrikes: 2, stagesRemaining: [], finalStage: COUNTERPICK_STAGES[0] },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 2,
        actorAId: p2.id,
        actorAStrikes: 3,
        actorBId: p1.id,
        actorBStrikes: 0,
        actorACharacter: "Fox",
        actorBCharacter: "Mario",
        struckStages: COUNTERPICK_STAGES.slice(0, 3), // includes game 1's stage
        stagesRemaining: COUNTERPICK_STAGES.slice(3),
      },
    });

    await expect(pickSameStage(p1.id, match.id, 2)).rejects.toThrow(/isn't available/i);
  });

  it("rejects on game 1 — there's no previous game to repeat", async () => {
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
        actorBCharacter: "Fox",
        struckStages: GAME_ONE_STAGES.slice(0, 3),
        stagesRemaining: GAME_ONE_STAGES.slice(3),
      },
    });

    await expect(pickSameStage(p1.id, match.id, 1)).rejects.toThrow(/no previous game/i);
  });

  it("rejects when it isn't the calling player's turn to pick", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await prisma.matchGame.create({
      data: { matchId: match.id, gameNumber: 1, actorAId: p1.id, actorAStrikes: 1, actorBId: p2.id, actorBStrikes: 2, stagesRemaining: [], finalStage: COUNTERPICK_STAGES[0] },
    });
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 2,
        actorAId: p2.id,
        actorAStrikes: 3,
        actorBId: p1.id,
        actorBStrikes: 0,
        actorACharacter: "Fox",
        actorBCharacter: "Mario",
        struckStages: COUNTERPICK_STAGES.slice(1, 4),
        stagesRemaining: COUNTERPICK_STAGES.filter((s) => !COUNTERPICK_STAGES.slice(1, 4).includes(s)),
      },
    });

    await expect(pickSameStage(p2.id, match.id, 2)).rejects.toThrow(/not your turn/i);
  });
});

describe("progressSet tolerates an already-existing next game", () => {
  // Reproduces a real incident: a mod clearing an earlier game's winner via
  // adminSetGameWinner (e.g. to let a disputed game replay) doesn't delete
  // whatever later game already got created off the old outcome. Deciding
  // that earlier game again then used to crash on the [matchId, gameNumber]
  // unique constraint when trying to recreate the next game — this locked a
  // player out of ever confirming their own win.
  it("doesn't crash confirming a game when the next one already exists", async () => {
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
        finalStage: "Battlefield",
        reportedWinnerId: p1.id,
        reportedById: p1.id,
        reportedAt: new Date(),
      },
    });
    // Simulates the orphaned state: game 2 already exists even though game 1
    // was never actually decided (winnerId still null).
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber: 2,
        actorAId: p1.id,
        actorAStrikes: 3,
        actorBId: p2.id,
        actorBStrikes: 0,
        stagesRemaining: ["Final Destination"],
      },
    });

    await expect(reportGameResult(p2.id, match.id, 1, false)).resolves.not.toThrow();

    const game1 = await prisma.matchGame.findUnique({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(game1?.winnerId).toBe(p1.id);

    const game2 = await prisma.matchGame.findUnique({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 2 } },
    });
    expect(game2).not.toBeNull(); // untouched, not duplicated or errored on
  });
});

describe("practice mode character picks", () => {
  it("allows a practicing player to pick their own mainCharacter", async () => {
    const p1 = await createTestUser({ mainCharacter: "Fox" });
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        expiresAt: new Date(),
        player1IsPracticing: true,
      },
    });
    await startFirstGame(p1.id, match.id);
    const game = await getCurrentGame(match.id);
    if (!game) throw new Error("expected game 1 to exist");
    const p1IsActorA = game.actorAId === p1.id;

    await expect(pickGameCharacter(p1.id, match.id, 1, "Fox")).resolves.not.toThrow();

    const updated = await getCurrentGame(match.id);
    expect(p1IsActorA ? updated?.actorACharacter : updated?.actorBCharacter).toBe("Fox");
  });
});

describe("conflicting game reports", () => {
  async function createPlayedGame(matchId: string) {
    return prisma.matchGame.create({
      data: {
        matchId,
        gameNumber: 1,
        actorAId: (await prisma.ratingMatch.findUniqueOrThrow({ where: { id: matchId } })).player1Id,
        actorAStrikes: 1,
        actorBId: (await prisma.ratingMatch.findUniqueOrThrow({ where: { id: matchId } })).player2Id,
        actorBStrikes: 2,
        finalStage: "Battlefield",
      },
    });
  }

  it("contests the game on a conflicting second report instead of escalating it", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await createPlayedGame(match.id);

    await reportGameResult(p1.id, match.id, 1, true);
    await reportGameResult(p2.id, match.id, 1, true); // both claim the win

    const game = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(game.winnerId).toBeNull();
    expect(game.reportedWinnerId).toBe(p1.id);
    expect(game.secondReportWinnerId).toBe(p2.id);
    expect(game.disputeRequestedAt).toBeNull();
    const matchRow = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(matchRow.disputeReason).toBeNull();
  });

  it("resolves the game when a player changes their contested claim to match the opponent", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await createPlayedGame(match.id);

    await reportGameResult(p1.id, match.id, 1, true);
    await reportGameResult(p2.id, match.id, 1, true); // contested
    await reportGameResult(p2.id, match.id, 1, false); // p2 concedes — flip

    const game = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(game.winnerId).toBe(p1.id);
    expect(game.disputeRequestedAt).toBeNull();
  });

  it("resolves the game when the first reporter changes their contested claim to match", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await createPlayedGame(match.id);

    await reportGameResult(p1.id, match.id, 1, true);
    await reportGameResult(p2.id, match.id, 1, true); // contested
    await reportGameResult(p1.id, match.id, 1, false); // p1 concedes — flip

    const game = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(game.winnerId).toBe(p2.id);
    expect(game.disputeRequestedAt).toBeNull();
  });

  it("records one side's re-confirmation without escalating until the other confirms", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await createPlayedGame(match.id);

    await reportGameResult(p1.id, match.id, 1, true);
    await reportGameResult(p2.id, match.id, 1, true); // contested
    await reportGameResult(p1.id, match.id, 1, true); // p1 re-confirms

    const game = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(game.reporterConfirmedAt).not.toBeNull();
    expect(game.secondReporterConfirmedAt).toBeNull();
    expect(game.disputeRequestedAt).toBeNull();
    expect(game.winnerId).toBeNull();
  });

  it("escalates to a mod dispute once both sides re-confirm their conflicting claims", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await createPlayedGame(match.id);

    await reportGameResult(p1.id, match.id, 1, true);
    await reportGameResult(p2.id, match.id, 1, true); // contested
    await reportGameResult(p1.id, match.id, 1, true); // p1 re-confirms
    await reportGameResult(p2.id, match.id, 1, true); // p2 re-confirms → escalate

    const game = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(game.disputeRequestedAt).not.toBeNull();
    expect(game.winnerId).toBeNull();
    const matchRow = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(matchRow.disputeReason).toBe("Disagreement on game 1's winner");
  });

  it("escalates immediately via the dispute action without needing both confirmations", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);
    await createPlayedGame(match.id);

    await reportGameResult(p1.id, match.id, 1, true);
    await reportGameResult(p2.id, match.id, 1, true); // contested
    await escalateGameDispute(p1.id, match.id, 1);

    const game = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(game.disputeRequestedAt).not.toBeNull();
    expect(game.winnerId).toBeNull();
    expect(game.reporterConfirmedAt).toBeNull(); // no re-confirmation happened
  });
});
