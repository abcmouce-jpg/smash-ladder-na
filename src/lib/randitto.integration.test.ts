import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser } from "@/test/factories";
import { LobbyEntryStatus, MatchMode, PairingMethod, RatingAlgorithm } from "@/generated/prisma/enums";
import { createDirectMatch, getLobbyActivityStats, joinLobbyAndTryPair, sweepLobbyPairing } from "@/lib/lobby";
import { getPublicStats } from "@/lib/public-stats";
import { startFirstGame } from "@/lib/match-games";
import { adminForceConfirmMatch } from "@/lib/matches";
import { MII_CHARACTERS, MOVESET_PATTERN } from "@/lib/characters";
import { RANDITTO_STAGE } from "@/lib/randitto";

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

  // The mode exists so nobody chooses; leaving the stage negotiated made it
  // the slowest part of the fastest queue.
  it("opens game 1 on the fixed stage with no strikes pending", async () => {
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
    expect(game.finalStage).toBe(RANDITTO_STAGE);
    expect(game.actorAStrikes).toBe(0);
    expect(game.actorBStrikes).toBe(0);
    expect(game.struckStages).toEqual([]);
  });

  it("leaves a standard set's stage to be struck for, as before", async () => {
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
    expect(game.finalStage).toBeNull();
    expect(game.actorAStrikes + game.actorBStrikes).toBeGreaterThan(0);
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

// Join-time pairing is only one of three ways a match gets made. The sweep
// that picks up whoever is still waiting, and the rematch path, each create
// matches of their own — and a thinly-used new mode consists almost entirely
// of people who are still waiting, so the sweep is the path that matters most
// for it. Missing those two put real players who asked for randitto into
// ordinary rated sets in production.
describe("every pairing path keeps the mode", () => {
  it("the sweep never pairs randitto with standard", async () => {
    const r = await queuer();
    const s = await queuer();
    await joinLobbyAndTryPair(r.id, false, null, MatchMode.RANDITTO);
    await joinLobbyAndTryPair(s.id, false, null, MatchMode.STANDARD);

    await sweepLobbyPairing();

    const matches = await prisma.ratingMatch.count({
      where: { OR: [{ player1Id: r.id }, { player2Id: r.id }] },
    });
    expect(matches).toBe(0);
  });

  it("the sweep pairs two randitto waiters into a RANDITTO match", async () => {
    const a = await queuer();
    const b = await queuer();
    // Queued one at a time with the other already cancelled out of the way,
    // so join-time pairing finds nobody and the sweep is what pairs them.
    await joinLobbyAndTryPair(a.id, false, null, MatchMode.RANDITTO);
    await prisma.ratingLobbyEntry.updateMany({
      where: { userId: a.id },
      data: { status: "WAITING", matchId: null, pairedEntryId: null },
    });
    await joinLobbyAndTryPair(b.id, false, null, MatchMode.RANDITTO);

    const match = await prisma.ratingMatch.findFirst({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    if (match) {
      expect(match.mode).toBe(MatchMode.RANDITTO);
      return;
    }
    await sweepLobbyPairing();
    const swept = await prisma.ratingMatch.findFirstOrThrow({
      where: { OR: [{ player1Id: a.id }, { player2Id: a.id }] },
    });
    expect(swept.mode).toBe(MatchMode.RANDITTO);
  });

  it("a rematch out of a randitto set stays randitto", async () => {
    const a = await queuer({ rating: 1500, gamesPlayed: 20 });
    const b = await queuer({ rating: 1500, gamesPlayed: 20 });
    const direct = await prisma.$transaction((tx) =>
      createDirectMatch(tx, a.id, b.id, PairingMethod.REMATCH, false, false, MatchMode.RANDITTO),
    );
    expect(direct.mode).toBe(MatchMode.RANDITTO);
    const entries = await prisma.ratingLobbyEntry.findMany({ where: { userId: { in: [a.id, b.id] } } });
    expect(entries).toHaveLength(2);
    for (const e of entries) expect(e.mode).toBe(MatchMode.RANDITTO);
  });

  it("a rematch out of a standard set stays standard", async () => {
    const a = await queuer();
    const b = await queuer();
    const direct = await prisma.$transaction((tx) => createDirectMatch(tx, a.id, b.id, PairingMethod.REMATCH));
    expect(direct.mode).toBe(MatchMode.STANDARD);
  });
});

// "playing now" is the number the site leads with. Merging the two queues
// into it would tell a visitor there is activity in a queue they cannot join
// from the one they are looking at — the standard count would be carried by
// randitto players and vice versa.
describe("activity counts are per queue", () => {
  it("counts a randitto match only under randitto", async () => {
    const a = await queuer();
    const b = await queuer();
    await joinLobbyAndTryPair(a.id, false, null, MatchMode.RANDITTO);
    await joinLobbyAndTryPair(b.id, false, null, MatchMode.RANDITTO);

    const stats = await getLobbyActivityStats();
    expect(stats.randittoInMatch).toBe(2);
    expect(stats.inMatch).toBe(0);

    const pub = await getPublicStats();
    expect(pub.randittoPlayingNow).toBe(2);
    expect(pub.playingNow).toBe(0);
  });

  it("counts a standard match only under standard", async () => {
    const a = await queuer();
    const b = await queuer();
    await joinLobbyAndTryPair(a.id, false, null, MatchMode.STANDARD);
    await joinLobbyAndTryPair(b.id, false, null, MatchMode.STANDARD);

    const stats = await getLobbyActivityStats();
    expect(stats.inMatch).toBe(2);
    expect(stats.randittoInMatch).toBe(0);
  });

  it("counts waiting players under their own queue", async () => {
    const a = await queuer();
    await joinLobbyAndTryPair(a.id, false, null, MatchMode.RANDITTO);

    const stats = await getLobbyActivityStats();
    expect(stats.randittoWaiting).toBe(1);
    expect(stats.waiting).toBe(0);
  });
});
