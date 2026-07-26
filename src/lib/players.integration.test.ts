import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { getCharacterUsage, getTopCharacters } from "@/lib/players";
import { MatchStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

async function createConfirmedMatch(p1: string, p2: string) {
  return prisma.ratingMatch.create({
    data: {
      player1Id: p1,
      player2Id: p2,
      status: MatchStatus.CONFIRMED,
      expiresAt: new Date(),
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
    },
  });
}

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
});
