import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser } from "@/test/factories";
import { LobbyEntryStatus, MatchMode } from "@/generated/prisma/enums";
import { joinLobbyAndTryPair } from "@/lib/lobby";
import { startFirstGame } from "@/lib/match-games";
import { MII_CHARACTERS, MOVESET_PATTERN } from "@/lib/characters";

// Region is required to queue (see joinLobbyAndTryPair), and a wide rating gap
// keeps these tests about the mode rather than about matchmaking.
async function queuer(overrides: Record<string, unknown> = {}) {
  return createTestUser({ region: "USA East", maxRatingGap: 5000, gamesPlayed: 20, ...overrides });
}

describe("randitto queue", () => {
  it("pairs two randitto joins and marks the match RANDITTO", async () => {
    const a = await queuer();
    const b = await queuer();
    await joinLobbyAndTryPair(a.id, false, null, MatchMode.RANDITTO);
    await joinLobbyAndTryPair(b.id, false, null, MatchMode.RANDITTO);

    const match = await prisma.ratingMatch.findFirst({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(match).not.toBeNull();
    expect(match?.mode).toBe(MatchMode.RANDITTO);
  });

  // The two modes are separate queues. Pairing across them would hand someone
  // who asked for assigned fighters a normal set, or the reverse.
  it("never pairs a randitto join with a standard one", async () => {
    const a = await queuer();
    const b = await queuer();
    await joinLobbyAndTryPair(a.id, false, null, MatchMode.RANDITTO);
    await joinLobbyAndTryPair(b.id, false, null, MatchMode.STANDARD);

    const matches = await prisma.ratingMatch.count({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(matches).toBe(0);
    const entries = await prisma.ratingLobbyEntry.findMany({
      where: { userId: { in: [a.id, b.id] } },
      select: { status: true, mode: true },
    });
    expect(entries).toHaveLength(2);
    for (const e of entries) expect(e.status).toBe(LobbyEntryStatus.WAITING);
  });

  // A set played on a fighter you were handed says nothing about ladder
  // standing, so it goes to the practice track and the main rating is left
  // alone. Forced regardless of what the caller passed.
  it("always rates onto the practice track", async () => {
    const a = await queuer();
    const b = await queuer();
    await joinLobbyAndTryPair(a.id, false, null, MatchMode.RANDITTO);
    await joinLobbyAndTryPair(b.id, false, null, MatchMode.RANDITTO);

    const match = await prisma.ratingMatch.findFirstOrThrow({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(match.player1IsPracticing).toBe(true);
    expect(match.player2IsPracticing).toBe(true);
  });

  // Somebody who set "don't match me with people who are practicing" would
  // otherwise be unable to use randitto at all, since randitto forces the
  // practice flag on both sides.
  it("still pairs players who avoid practice opponents", async () => {
    const a = await queuer({ avoidPracticeOpponents: true });
    const b = await queuer({ avoidPracticeOpponents: true });
    await joinLobbyAndTryPair(a.id, false, null, MatchMode.RANDITTO);
    await joinLobbyAndTryPair(b.id, false, null, MatchMode.RANDITTO);

    const match = await prisma.ratingMatch.findFirst({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(match).not.toBeNull();
  });

  it("starts game 1 with both fighters already assigned", async () => {
    const a = await queuer();
    const b = await queuer();
    await joinLobbyAndTryPair(a.id, false, null, MatchMode.RANDITTO);
    await joinLobbyAndTryPair(b.id, false, null, MatchMode.RANDITTO);
    const match = await prisma.ratingMatch.findFirstOrThrow({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });

    await startFirstGame(a.id, match.id);

    const game = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(game.actorACharacter).not.toBeNull();
    expect(game.actorBCharacter).not.toBeNull();
    expect(game.actorACharacter).not.toBe("Random");
    expect(game.actorBCharacter).not.toBe("Random");
    // A Mii without a moveset would leave the game looking half-picked.
    for (const [character, moveset] of [
      [game.actorACharacter, game.actorAMoveset],
      [game.actorBCharacter, game.actorBMoveset],
    ] as const) {
      if ((MII_CHARACTERS as readonly string[]).includes(character as string)) {
        expect(moveset).toMatch(MOVESET_PATTERN);
      }
    }
  });

  it("leaves a standard set's characters unassigned, as before", async () => {
    const a = await queuer();
    const b = await queuer();
    await joinLobbyAndTryPair(a.id, false, null, MatchMode.STANDARD);
    await joinLobbyAndTryPair(b.id, false, null, MatchMode.STANDARD);
    const match = await prisma.ratingMatch.findFirstOrThrow({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });

    await startFirstGame(a.id, match.id);

    const game = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(match.mode).toBe(MatchMode.STANDARD);
    expect(game.actorACharacter).toBeNull();
    expect(game.actorBCharacter).toBeNull();
  });
});
