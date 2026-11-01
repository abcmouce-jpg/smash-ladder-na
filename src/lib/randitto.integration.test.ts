import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser } from "@/test/factories";
import { LobbyEntryStatus, MatchMode, RatingAlgorithm } from "@/generated/prisma/enums";
import { joinLobbyAndTryPair } from "@/lib/lobby";
import { startFirstGame } from "@/lib/match-games";
import { adminForceConfirmMatch } from "@/lib/matches";
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

  // Randitto has its own track, so the practice flag has nothing to express
  // on it — forced off even if the caller asked for it, so that a fourth
  // "practising at randitto" ladder cannot come into existence.
  it("never carries the practice flag", async () => {
    const a = await queuer();
    const b = await queuer();
    await joinLobbyAndTryPair(a.id, true, null, MatchMode.RANDITTO);
    await joinLobbyAndTryPair(b.id, true, null, MatchMode.RANDITTO);

    const match = await prisma.ratingMatch.findFirstOrThrow({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(match.player1IsPracticing).toBe(false);
    expect(match.player2IsPracticing).toBe(false);
  });

  it("pairs players who avoid practice opponents", async () => {
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

// The point of the separate track: three ladders that cannot bleed into each
// other. A randitto result moving `rating` would silently rate people on
// fighters they were handed; one moving `practiceRating` would make the
// practice number mean two different things at once.
describe("the randitto rating track", () => {
  async function playedRandittoSet() {
    await prisma.season.create({ data: { name: "Elo Season", algorithm: RatingAlgorithm.ELO } });
    const a = await queuer({ rating: 1500, gamesPlayed: 20 });
    const b = await queuer({ rating: 1500, gamesPlayed: 20 });
    await joinLobbyAndTryPair(a.id, false, null, MatchMode.RANDITTO);
    await joinLobbyAndTryPair(b.id, false, null, MatchMode.RANDITTO);
    const match = await prisma.ratingMatch.findFirstOrThrow({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    await adminForceConfirmMatch(match.id, a.id);
    const [after, loser] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: a.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: b.id } }),
    ]);
    return { after, loser, match };
  }

  it("moves randittoRating and leaves the main ladder untouched", async () => {
    const { after, loser } = await playedRandittoSet();
    expect(after.randittoRating).toBeGreaterThan(1500);
    expect(loser.randittoRating).toBeLessThan(1500);
    expect(after.randittoGamesPlayed).toBe(1);
    expect(loser.randittoGamesPlayed).toBe(1);

    expect(after.rating).toBe(1500);
    expect(loser.rating).toBe(1500);
    expect(after.gamesPlayed).toBe(20);
    expect(loser.gamesPlayed).toBe(20);
  });

  it("leaves the practice track untouched too", async () => {
    const { after, loser } = await playedRandittoSet();
    for (const u of [after, loser]) {
      expect(u.practiceRating).toBe(1500);
      expect(u.practiceGamesPlayed).toBe(0);
    }
  });

  // RatingHistory backs the rating-over-time chart and the peak-rating stat.
  it("writes no row to the main rating history", async () => {
    const { match } = await playedRandittoSet();
    const rows = await prisma.ratingHistory.count({ where: { matchId: match.id } });
    expect(rows).toBe(0);
  });

  it("rates a standard set onto the main ladder, as before", async () => {
    await prisma.season.create({ data: { name: "Elo Season", algorithm: RatingAlgorithm.ELO } });
    const a = await queuer({ rating: 1500, gamesPlayed: 20 });
    const b = await queuer({ rating: 1500, gamesPlayed: 20 });
    await joinLobbyAndTryPair(a.id, false, null, MatchMode.STANDARD);
    await joinLobbyAndTryPair(b.id, false, null, MatchMode.STANDARD);
    const match = await prisma.ratingMatch.findFirstOrThrow({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    await adminForceConfirmMatch(match.id, a.id);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
    expect(after.rating).toBeGreaterThan(1500);
    expect(after.gamesPlayed).toBe(21);
    expect(after.randittoRating).toBe(1500);
    expect(after.randittoGamesPlayed).toBe(0);
  });
});
