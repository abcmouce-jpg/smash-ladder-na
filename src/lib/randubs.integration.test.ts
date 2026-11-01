import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { createTestUser } from "@/test/factories";
import { LobbyEntryStatus, MatchMode, MatchStatus, RatingAlgorithm } from "@/generated/prisma/enums";
import { joinLobbyAndTryPair, sweepLobbyPairing } from "@/lib/lobby";
import { adminForceConfirmMatch, getUnresolvedMatchForUser } from "@/lib/matches";
import { startFirstGame } from "@/lib/match-games";
import { RANDITTO_STAGE } from "@/lib/randitto";

async function queuer(overrides: Record<string, unknown> = {}) {
  return createTestUser({ region: "USA East", maxRatingGap: 5000, gamesPlayed: 20, ...overrides });
}

async function queueFour(mode = MatchMode.RANDUBS) {
  const players = [];
  for (let i = 0; i < 4; i++) players.push(await queuer());
  for (const p of players) await joinLobbyAndTryPair(p.id, false, null, mode);
  return players;
}

describe("randubs pairing", () => {
  it("waits for four and then makes one match with two teams of two", async () => {
    const players = await queueFour();
    const ids = players.map((p) => p.id);

    const matches = await prisma.ratingMatch.findMany({ where: { mode: MatchMode.RANDUBS } });
    expect(matches).toHaveLength(1);
    const m = matches[0];
    expect(m.player1PartnerId).not.toBeNull();
    expect(m.player2PartnerId).not.toBeNull();

    const onMatch = [m.player1Id, m.player2Id, m.player1PartnerId, m.player2PartnerId].sort();
    expect(onMatch).toEqual([...ids].sort());
  });

  it("makes nobody wait alone once a fourth arrives", async () => {
    const players = [];
    for (let i = 0; i < 3; i++) {
      const p = await queuer();
      players.push(p);
      await joinLobbyAndTryPair(p.id, false, null, MatchMode.RANDUBS);
    }
    expect(await prisma.ratingMatch.count({ where: { mode: MatchMode.RANDUBS } })).toBe(0);

    const fourth = await queuer();
    await joinLobbyAndTryPair(fourth.id, false, null, MatchMode.RANDUBS);
    expect(await prisma.ratingMatch.count({ where: { mode: MatchMode.RANDUBS } })).toBe(1);
  });

  // Both partners have to be able to find the set they are playing in —
  // the lookups used to key on player1Id/player2Id only.
  it("lets all four find the match", async () => {
    const players = await queueFour();
    for (const p of players) {
      const found = await getUnresolvedMatchForUser(p.id);
      expect(found, `${p.username} cannot see their own match`).not.toBeNull();
      expect(found?.mode).toBe(MatchMode.RANDUBS);
    }
  });

  it("marks all four lobby entries as paired", async () => {
    const players = await queueFour();
    const entries = await prisma.ratingLobbyEntry.findMany({
      where: { userId: { in: players.map((p) => p.id) } },
    });
    expect(entries).toHaveLength(4);
    for (const e of entries) expect(e.status).toBe(LobbyEntryStatus.PAIRED);
  });

  // The sweep pairs two at a time; a half-built four-way there would make
  // two-player "doubles" matches.
  it("is never paired two-at-a-time by the sweep", async () => {
    const a = await queuer();
    const b = await queuer();
    await joinLobbyAndTryPair(a.id, false, null, MatchMode.RANDUBS);
    await joinLobbyAndTryPair(b.id, false, null, MatchMode.RANDUBS);
    await sweepLobbyPairing();
    expect(await prisma.ratingMatch.count({ where: { mode: MatchMode.RANDUBS } })).toBe(0);
  });

  it("never mixes randubs with another queue", async () => {
    for (let i = 0; i < 3; i++) {
      const p = await queuer();
      await joinLobbyAndTryPair(p.id, false, null, MatchMode.RANDUBS);
    }
    const standard = await queuer();
    await joinLobbyAndTryPair(standard.id, false, null, MatchMode.STANDARD);

    expect(await prisma.ratingMatch.count({ where: { mode: MatchMode.RANDUBS } })).toBe(0);
    const theirs = await prisma.ratingMatch.count({
      where: { OR: [{ player1Id: standard.id }, { player2Id: standard.id }] },
    });
    expect(theirs).toBe(0);
  });
});

describe("randubs sets", () => {
  it("opens on the fixed stage with no picks and no strikes to make", async () => {
    const players = await queueFour();
    const match = await prisma.ratingMatch.findFirstOrThrow({ where: { mode: MatchMode.RANDUBS } });

    await startFirstGame(players[0].id, match.id);

    const game = await prisma.matchGame.findUniqueOrThrow({
      where: { matchId_gameNumber: { matchId: match.id, gameNumber: 1 } },
    });
    expect(game.finalStage).toBe(RANDITTO_STAGE);
    expect(game.actorAStrikes).toBe(0);
    expect(game.actorBStrikes).toBe(0);
    // Four players do not fit two character columns, so nothing is recorded.
    expect(game.actorACharacter).toBeNull();
    expect(game.actorBCharacter).toBeNull();
  });

  it("moves all four randubs ratings and leaves every other track alone", async () => {
    await prisma.season.create({ data: { name: "Elo Season", algorithm: RatingAlgorithm.ELO } });
    const players = await queueFour();
    const match = await prisma.ratingMatch.findFirstOrThrow({ where: { mode: MatchMode.RANDUBS } });

    await adminForceConfirmMatch(match.id, match.player1Id);

    const winners = [match.player1Id, match.player1PartnerId!];
    const losers = [match.player2Id, match.player2PartnerId!];
    for (const id of winners) {
      const u = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect(u.randubsRating, "winner should gain").toBeGreaterThan(1500);
      expect(u.randubsGamesPlayed).toBe(1);
    }
    for (const id of losers) {
      const u = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect(u.randubsRating, "loser should drop").toBeLessThan(1500);
      expect(u.randubsGamesPlayed).toBe(1);
    }
    for (const p of players) {
      const u = await prisma.user.findUniqueOrThrow({ where: { id: p.id } });
      expect(u.rating, "main ladder must not move").toBe(1500);
      expect(u.gamesPlayed).toBe(20);
      expect(u.randittoRating).toBe(1500);
      expect(u.practiceRating).toBe(1500);
    }
  });

  it("writes no row to the main rating history", async () => {
    await prisma.season.create({ data: { name: "Elo Season", algorithm: RatingAlgorithm.ELO } });
    await queueFour();
    const match = await prisma.ratingMatch.findFirstOrThrow({ where: { mode: MatchMode.RANDUBS } });
    await adminForceConfirmMatch(match.id, match.player1Id);
    expect(await prisma.ratingHistory.count({ where: { matchId: match.id } })).toBe(0);
  });

  it("confirms as a normal set does", async () => {
    await prisma.season.create({ data: { name: "Elo Season", algorithm: RatingAlgorithm.ELO } });
    await queueFour();
    const match = await prisma.ratingMatch.findFirstOrThrow({ where: { mode: MatchMode.RANDUBS } });
    await adminForceConfirmMatch(match.id, match.player1Id);
    const after = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: match.id } });
    expect(after.status).toBe(MatchStatus.CONFIRMED);
    expect(after.reportedWinnerId).toBe(match.player1Id);
  });
});
