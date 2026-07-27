import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser } from "@/test/factories";
import {
  startFirstGame,
  strikeGameStage,
  pickGameStage,
  pickGameCharacter,
  getCurrentGame,
  getMatchGames,
  reportGameResult,
  bannedPracticeCharacter,
  CHARACTER_TIMEOUT_MS,
} from "@/lib/match-games";
import { GAME_ONE_STAGES } from "@/lib/stages";

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

describe("practice-mode character ban", () => {
  it("reports no ban for a non-practicing side even with a mainCharacter set", async () => {
    const p1 = await createTestUser({ mainCharacter: "Fox" });
    const p2 = await createTestUser();
    const match = await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, expiresAt: new Date() },
    });

    expect(await bannedPracticeCharacter(match.id, p1.id)).toBeNull();
  });

  it("bans the practicing player's own mainCharacter and no one else's", async () => {
    const p1 = await createTestUser({ mainCharacter: "Fox" });
    const p2 = await createTestUser({ mainCharacter: "Falco" });
    const match = await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        expiresAt: new Date(),
        player1IsPracticing: true,
      },
    });

    expect(await bannedPracticeCharacter(match.id, p1.id)).toBe("Fox");
    expect(await bannedPracticeCharacter(match.id, p2.id)).toBeNull();
  });

  it("rejects picking the banned character and allows any other", async () => {
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

    await expect(pickGameCharacter(p1.id, match.id, 1, "Fox")).rejects.toThrow(/banned/i);
    await expect(pickGameCharacter(p1.id, match.id, 1, "Falco")).resolves.not.toThrow();

    const updated = await getCurrentGame(match.id);
    expect(p1IsActorA ? updated?.actorACharacter : updated?.actorBCharacter).toBe("Falco");
  });
});
