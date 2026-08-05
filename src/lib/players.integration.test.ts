import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import {
  getCareerStats,
  getCharacterUsage,
  getCurrentMatchForUser,
  getCurrentStreak,
  getPlayerMatchCount,
  getPlayerMatchHistory,
  getTopCharacters,
  getTopRivals,
  isCurrentlyInMatch,
} from "@/lib/players";
import { MatchStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

async function createConfirmedMatch(
  p1: string,
  p2: string,
  options: { reportedWinnerId?: string; player1IsPracticing?: boolean; player2IsPracticing?: boolean } = {},
) {
  return prisma.ratingMatch.create({
    data: {
      player1Id: p1,
      player2Id: p2,
      status: MatchStatus.CONFIRMED,
      expiresAt: new Date(),
      reportedWinnerId: options.reportedWinnerId,
      player1IsPracticing: options.player1IsPracticing ?? false,
      player2IsPracticing: options.player2IsPracticing ?? false,
    },
  });
}

async function createPendingMatch(p1: string, p2: string) {
  return prisma.ratingMatch.create({
    data: {
      player1Id: p1,
      player2Id: p2,
      status: MatchStatus.PENDING_REPORT,
      expiresAt: new Date(),
    },
  });
}

async function createGame(
  matchId: string,
  gameNumber: number,
  actorAId: string,
  actorACharacter: string | null,
  actorBId: string,
  actorBCharacter: string | null,
  winnerId: string | null,
  stage?: string | null,
) {
  return prisma.matchGame.create({
    data: {
      matchId,
      gameNumber,
      actorAId,
      actorAStrikes: 1,
      actorACharacter,
      actorBId,
      actorBStrikes: 2,
      actorBCharacter,
      winnerId,
      finalStage: stage ?? null,
    },
  });
}

describe("isCurrentlyInMatch", () => {
  it("is true while a match is pending report", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    await createPendingMatch(p1.id, p2.id);

    expect(await isCurrentlyInMatch(p1.id)).toBe(true);
    expect(await isCurrentlyInMatch(p2.id)).toBe(true);
  });

  it("is false once the match is confirmed", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    await createConfirmedMatch(p1.id, p2.id);

    expect(await isCurrentlyInMatch(p1.id)).toBe(false);
  });

  it("is false for a player with no matches at all", async () => {
    const player = await createTestUser();
    expect(await isCurrentlyInMatch(player.id)).toBe(false);
  });
});

describe("getCurrentMatchForUser", () => {
  it("returns the active match with the opponent and games", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createPendingMatch(p1.id, p2.id);
    await createGame(match.id, 1, p1.id, "Mario", p2.id, null, null);

    const current = await getCurrentMatchForUser(p1.id);
    expect(current).not.toBeNull();
    expect(current!.player2Id).toBe(p2.id);
    expect(current!.player2.username).toBe(p2.username);
    expect(current!.games).toHaveLength(1);
    expect(current!.games[0].actorACharacter).toBe("Mario");
    expect(current!.games[0].actorBCharacter).toBeNull();
  });

  it("returns null once the match is confirmed", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    await createConfirmedMatch(p1.id, p2.id, { reportedWinnerId: p1.id });

    expect(await getCurrentMatchForUser(p1.id)).toBeNull();
  });

  it("returns null for a player with no active match", async () => {
    const player = await createTestUser();
    expect(await getCurrentMatchForUser(player.id)).toBeNull();
  });
});

describe("getTopCharacters", () => {
  it("returns an empty array when the player has no qualifying games", async () => {
    const player = await createTestUser();
    expect(await getTopCharacters(player.id)).toEqual([]);
  });

  it("returns a single character when only one was played", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", player.id);

    expect(await getTopCharacters(player.id)).toEqual(["Terry"]);
  });

  it("ranks characters by descending game count", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", player.id);
    await createGame(match.id, 2, player.id, "Terry", opponent.id, "Ken", player.id);
    await createGame(match.id, 3, player.id, "Cloud", opponent.id, "Ken", player.id);

    expect(await getTopCharacters(player.id)).toEqual(["Terry", "Cloud"]);
  });

  it("breaks ties alphabetically", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Cloud", opponent.id, "Ken", player.id);
    await createGame(match.id, 2, player.id, "Bowser", opponent.id, "Ken", player.id);

    expect(await getTopCharacters(player.id)).toEqual(["Bowser", "Cloud"]);
  });

  it("excludes games from matches that aren't confirmed", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createPendingMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", player.id);

    expect(await getTopCharacters(player.id)).toEqual([]);
  });

  it("excludes games with no winner (disputed/void)", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", null);

    expect(await getTopCharacters(player.id)).toEqual([]);
  });

  it("respects the limit parameter", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", player.id);
    await createGame(match.id, 2, player.id, "Cloud", opponent.id, "Ken", player.id);
    await createGame(match.id, 3, player.id, "Bowser", opponent.id, "Ken", player.id);

    expect(await getTopCharacters(player.id, 2)).toHaveLength(2);
  });

  it("uses actorBCharacter when the player is recorded on the B side", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(opponent.id, player.id);
    await createGame(match.id, 1, opponent.id, "Ken", player.id, "Terry", player.id);

    expect(await getTopCharacters(player.id)).toEqual(["Terry"]);
  });
});

describe("getCharacterUsage", () => {
  it("returns an empty array when the player has no qualifying games", async () => {
    const player = await createTestUser();
    expect(await getCharacterUsage(player.id)).toEqual([]);
  });

  it("computes games, wins, losses, win rate, and usage percent per character", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    // Terry: 2 games, 1 win. Cloud: 2 games, 2 wins. Total: 4 games.
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", player.id);
    await createGame(match.id, 2, player.id, "Terry", opponent.id, "Ken", opponent.id);
    await createGame(match.id, 3, player.id, "Cloud", opponent.id, "Ken", player.id);
    await createGame(match.id, 4, player.id, "Cloud", opponent.id, "Ken", player.id);

    expect(await getCharacterUsage(player.id)).toEqual([
      { character: "Cloud", games: 2, wins: 2, losses: 0, winRate: 100, usagePercent: 50 },
      { character: "Terry", games: 2, wins: 1, losses: 1, winRate: 50, usagePercent: 50 },
    ]);
  });

  it("orders by games played descending, ties broken alphabetically", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", player.id);
    await createGame(match.id, 2, player.id, "Terry", opponent.id, "Ken", player.id);
    await createGame(match.id, 3, player.id, "Cloud", opponent.id, "Ken", player.id);
    await createGame(match.id, 4, player.id, "Bowser", opponent.id, "Ken", player.id);

    const usage = await getCharacterUsage(player.id);
    expect(usage.map((u) => u.character)).toEqual(["Terry", "Bowser", "Cloud"]);
  });

  it("excludes games from matches that aren't confirmed", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createPendingMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", player.id);

    expect(await getCharacterUsage(player.id)).toEqual([]);
  });

  it("excludes games with no winner (disputed/void)", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", null);

    expect(await getCharacterUsage(player.id)).toEqual([]);
  });

  it("excludes games from a match where the player's own side was practicing", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id, { player1IsPracticing: true });
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", player.id);

    expect(await getCharacterUsage(player.id)).toEqual([]);
  });

  it("still counts a match for the opponent when only the player's side was practicing", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id, { player1IsPracticing: true });
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", opponent.id);

    expect(await getCharacterUsage(opponent.id)).toEqual([
      { character: "Ken", games: 1, wins: 1, losses: 0, winRate: 100, usagePercent: 100 },
    ]);
  });
});

describe("getCareerStats", () => {
  it("counts wins and losses from confirmed matches", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    await createConfirmedMatch(player.id, opponent.id, { reportedWinnerId: player.id });
    await createConfirmedMatch(opponent.id, player.id, { reportedWinnerId: opponent.id });

    const stats = await getCareerStats(player.id);
    expect(stats.totalWins).toBe(1);
    expect(stats.totalLosses).toBe(1);
  });

  it("excludes a match from the player's own record when their side was practicing", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    await createConfirmedMatch(player.id, opponent.id, {
      reportedWinnerId: player.id,
      player1IsPracticing: true,
    });

    const stats = await getCareerStats(player.id);
    expect(stats.totalWins).toBe(0);
    expect(stats.totalLosses).toBe(0);
  });

  it("still counts the match for the non-practicing opponent", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    await createConfirmedMatch(player.id, opponent.id, {
      reportedWinnerId: opponent.id,
      player1IsPracticing: true,
    });

    const stats = await getCareerStats(opponent.id);
    expect(stats.totalWins).toBe(1);
    expect(stats.totalLosses).toBe(0);
  });

  async function createConfirmedMatchAt(
    p1: string,
    p2: string,
    reportedWinnerId: string,
    confirmedAt: Date,
  ) {
    return prisma.ratingMatch.create({
      data: { player1Id: p1, player2Id: p2, status: MatchStatus.CONFIRMED, expiresAt: new Date(), reportedWinnerId, confirmedAt },
    });
  }

  it("finds the longest win streak across the player's whole history, not just the current one", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const base = Date.now();
    // W W W L W W (in order) -> longest streak is 3, current streak is 2.
    const results = [true, true, true, false, true, true];
    for (let i = 0; i < results.length; i++) {
      await createConfirmedMatchAt(
        player.id,
        opponent.id,
        results[i] ? player.id : opponent.id,
        new Date(base + i * 1000),
      );
    }

    const stats = await getCareerStats(player.id);
    expect(stats.bestWinStreak).toBe(3);
  });

  it("is 0 for a player with no wins", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    await createConfirmedMatchAt(player.id, opponent.id, opponent.id, new Date());

    const stats = await getCareerStats(player.id);
    expect(stats.bestWinStreak).toBe(0);
  });

  it("excludes practice matches from the streak", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const base = Date.now();
    await createConfirmedMatchAt(player.id, opponent.id, player.id, new Date(base));
    await createConfirmedMatch(player.id, opponent.id, {
      reportedWinnerId: player.id,
      player1IsPracticing: true,
    });
    await createConfirmedMatchAt(player.id, opponent.id, player.id, new Date(base + 1000));

    const stats = await getCareerStats(player.id);
    // Only the two non-practice wins should count toward the streak.
    expect(stats.bestWinStreak).toBe(2);
  });
});

describe("getCurrentStreak", () => {
  async function createConfirmedMatchAt(
    p1: string,
    p2: string,
    reportedWinnerId: string,
    confirmedAt: Date,
  ) {
    return prisma.ratingMatch.create({
      data: { player1Id: p1, player2Id: p2, status: MatchStatus.CONFIRMED, expiresAt: new Date(), reportedWinnerId, confirmedAt },
    });
  }

  // Regression: the profile page used to feed currentStreak with the same
  // 20-match history it paginates with, so any streak longer than 20 read
  // as exactly 20. The DB-backed version must not have that ceiling.
  it("reports streaks longer than 20 in full", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const base = Date.now();
    // One loss, then 25 wins after it, so the current streak is 25.
    await createConfirmedMatchAt(player.id, opponent.id, opponent.id, new Date(base));
    for (let i = 1; i <= 25; i++) {
      await createConfirmedMatchAt(player.id, opponent.id, player.id, new Date(base + i * 1000));
    }

    expect(await getCurrentStreak(player.id)).toBe(25);
  });

  it("counts a leading run of losses as negative", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const base = Date.now();
    await createConfirmedMatchAt(player.id, opponent.id, player.id, new Date(base));
    await createConfirmedMatchAt(player.id, opponent.id, opponent.id, new Date(base + 1000));
    await createConfirmedMatchAt(player.id, opponent.id, opponent.id, new Date(base + 2000));
    await createConfirmedMatchAt(player.id, opponent.id, opponent.id, new Date(base + 3000));

    expect(await getCurrentStreak(player.id)).toBe(-3);
  });

  it("skips practice matches instead of counting them or breaking the streak", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const base = Date.now();
    await createConfirmedMatchAt(player.id, opponent.id, opponent.id, new Date(base));
    await createConfirmedMatchAt(player.id, opponent.id, player.id, new Date(base + 1000));
    await createConfirmedMatch(player.id, opponent.id, {
      reportedWinnerId: player.id,
      player1IsPracticing: true,
    });
    await createConfirmedMatchAt(player.id, opponent.id, player.id, new Date(base + 2000));

    expect(await getCurrentStreak(player.id)).toBe(2);
  });

  it("is 0 for a player with no matches or only practice matches", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    expect(await getCurrentStreak(player.id)).toBe(0);

    await createConfirmedMatch(player.id, opponent.id, {
      reportedWinnerId: player.id,
      player1IsPracticing: true,
    });
    expect(await getCurrentStreak(player.id)).toBe(0);
  });
});

describe("getPlayerMatchHistory", () => {
  it("includes the per-game score and the distinct characters played", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", player.id);
    await createGame(match.id, 2, player.id, "Terry", opponent.id, "Ken", opponent.id);
    await createGame(match.id, 3, player.id, "Cloud", opponent.id, "Ken", player.id);

    const [entry] = await getPlayerMatchHistory(player.id);
    expect(entry.score).toEqual({ wins: 2, losses: 1 });
    expect(entry.characters).toEqual(["Terry", "Cloud"]);
    expect(entry.opponentCharacters).toEqual(["Ken"]);
  });

  it("ignores games with no decided winner when computing score", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", player.id);
    await createGame(match.id, 2, player.id, null, opponent.id, null, null);

    const [entry] = await getPlayerMatchHistory(player.id);
    expect(entry.score).toEqual({ wins: 1, losses: 0 });
    expect(entry.characters).toEqual(["Terry"]);
  });

  it("returns an empty score and character list when no games were recorded", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    await createConfirmedMatch(player.id, opponent.id);

    const [entry] = await getPlayerMatchHistory(player.id);
    expect(entry.score).toEqual({ wins: 0, losses: 0 });
    expect(entry.characters).toEqual([]);
    expect(entry.opponentCharacters).toEqual([]);
    expect(entry.games).toEqual([]);
  });

  it("includes per-game characters, stage, and winner for each game", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", player.id, "Pokémon Stadium 2");
    await createGame(match.id, 2, player.id, "Terry", opponent.id, "Ken", opponent.id, "Final Destination");
    await createGame(match.id, 3, player.id, "Cloud", opponent.id, "Ken", player.id);

    const [entry] = await getPlayerMatchHistory(player.id);
    expect(entry.games).toEqual([
      { gameNumber: 1, character: "Terry", opponentCharacter: "Ken", stage: "Pokémon Stadium 2", won: true },
      { gameNumber: 2, character: "Terry", opponentCharacter: "Ken", stage: "Final Destination", won: false },
      { gameNumber: 3, character: "Cloud", opponentCharacter: "Ken", stage: null, won: true },
    ]);
  });

  it("lists undecided games in the per-game details but excludes them from the score", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Terry", opponent.id, "Ken", player.id, "Small Battlefield");
    await createGame(match.id, 2, player.id, "Mario", opponent.id, "Kirby", null, "Final Destination");

    const [entry] = await getPlayerMatchHistory(player.id);
    expect(entry.score).toEqual({ wins: 1, losses: 0 });
    expect(entry.games).toEqual([
      { gameNumber: 1, character: "Terry", opponentCharacter: "Ken", stage: "Small Battlefield", won: true },
      { gameNumber: 2, character: "Mario", opponentCharacter: "Kirby", stage: "Final Destination", won: null },
    ]);
  });

  // Real bug: a practice win showed up in the "Recent matches" record (and
  // its win-rate/streak badges, which are both derived from this list) even
  // though it's excluded from getCareerStats' lifetime record — same match
  // looked like a win in one place and didn't exist in the other, with no
  // indication why. Practice matches must stay invisible to the main
  // profile everywhere, not just in career totals.
  it("includes a match where the player's own side was practicing, flagged as such", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const practiceMatch = await createConfirmedMatch(player.id, opponent.id, {
      reportedWinnerId: player.id,
      player1IsPracticing: true,
    });
    const realMatch = await createConfirmedMatch(player.id, opponent.id, { reportedWinnerId: opponent.id });

    const history = await getPlayerMatchHistory(player.id);
    expect(history).toHaveLength(2);
    const practiceEntry = history.find((m) => m.id === practiceMatch.id);
    const realEntry = history.find((m) => m.id === realMatch.id);
    expect(practiceEntry?.isPracticing).toBe(true);
    expect(realEntry?.isPracticing).toBe(false);
  });

  it("flags isPracticing based on the querying player's own side, not the opponent's", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id, {
      reportedWinnerId: player.id,
      player2IsPracticing: true,
    });

    const [entry] = await getPlayerMatchHistory(player.id);
    expect(entry.id).toBe(match.id);
    expect(entry.isPracticing).toBe(false);
  });

  it("paginates with limit/skip, newest first", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const base = Date.now();
    const matches = [];
    for (let i = 0; i < 5; i++) {
      matches.push(
        await prisma.ratingMatch.create({
          data: {
            player1Id: player.id,
            player2Id: opponent.id,
            status: MatchStatus.CONFIRMED,
            expiresAt: new Date(),
            reportedWinnerId: player.id,
            confirmedAt: new Date(base + i * 1000),
          },
        }),
      );
    }
    // Newest (index 4) first.
    const expectedOrder = [...matches].reverse().map((m) => m.id);

    const page1 = await getPlayerMatchHistory(player.id, { limit: 2, skip: 0 });
    const page2 = await getPlayerMatchHistory(player.id, { limit: 2, skip: 2 });
    const page3 = await getPlayerMatchHistory(player.id, { limit: 2, skip: 4 });

    expect(page1.map((m) => m.id)).toEqual(expectedOrder.slice(0, 2));
    expect(page2.map((m) => m.id)).toEqual(expectedOrder.slice(2, 4));
    expect(page3.map((m) => m.id)).toEqual(expectedOrder.slice(4, 5));
  });
});

describe("getPlayerMatchCount", () => {
  it("counts every confirmed match, including practice ones", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    await createConfirmedMatch(player.id, opponent.id, { reportedWinnerId: player.id });
    await createConfirmedMatch(player.id, opponent.id, {
      reportedWinnerId: player.id,
      player1IsPracticing: true,
    });

    expect(await getPlayerMatchCount(player.id)).toBe(2);
  });

  it("returns 0 for a player with no confirmed matches", async () => {
    const player = await createTestUser();
    expect(await getPlayerMatchCount(player.id)).toBe(0);
  });
});

describe("getTopRivals", () => {
  it("excludes matches where the player's own side was practicing", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    await createConfirmedMatch(player.id, opponent.id, {
      reportedWinnerId: player.id,
      player1IsPracticing: true,
    });

    const rivals = await getTopRivals(player.id);
    expect(rivals).toEqual([]);
  });

  it("tallies wins and losses against the same opponent", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    await createConfirmedMatch(player.id, opponent.id, { reportedWinnerId: player.id });
    await createConfirmedMatch(player.id, opponent.id, { reportedWinnerId: opponent.id });

    const [rival] = await getTopRivals(player.id);
    expect(rival).toMatchObject({ opponentId: opponent.id, wins: 1, losses: 1 });
  });
});
