import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { getCharacterLeaderboard, recomputeCharacterUsage } from "@/lib/character-stats";
import { MatchStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

async function createConfirmedMatch(p1: string, p2: string) {
  return prisma.ratingMatch.create({
    data: { player1Id: p1, player2Id: p2, status: MatchStatus.CONFIRMED, expiresAt: new Date() },
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
    data: { matchId, gameNumber, actorAId, actorAStrikes: 1, actorACharacter, actorBId, actorBStrikes: 2, actorBCharacter, winnerId },
  });
}

describe("recomputeCharacterUsage", () => {
  it("sets mainCharacter to whichever character was actually played the most", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Fox", opponent.id, "Marth", player.id);
    await createGame(match.id, 2, player.id, "Fox", opponent.id, "Marth", opponent.id);
    await createGame(match.id, 3, player.id, "Falco", opponent.id, "Marth", player.id);

    await prisma.$transaction((tx) => recomputeCharacterUsage(player.id, tx));

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
    expect(updated.mainCharacter).toBe("Fox");
    expect(updated.secondaryCharacters).toEqual(["Falco"]);
  });

  it("promotes a newly-dominant character over a stale main", async () => {
    const player = await createTestUser({ mainCharacter: "Fox", secondaryCharacters: [] });
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    // 2 Fox + 3 Falco = 5 total — Fox at 40% clears the 30% secondary floor.
    await createGame(match.id, 1, player.id, "Fox", opponent.id, "Marth", player.id);
    await createGame(match.id, 2, player.id, "Fox", opponent.id, "Marth", player.id);
    await createGame(match.id, 3, player.id, "Falco", opponent.id, "Marth", player.id);
    await createGame(match.id, 4, player.id, "Falco", opponent.id, "Marth", player.id);
    await createGame(match.id, 5, player.id, "Falco", opponent.id, "Marth", opponent.id);

    await prisma.$transaction((tx) => recomputeCharacterUsage(player.id, tx));

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
    expect(updated.mainCharacter).toBe("Falco");
    expect(updated.secondaryCharacters).toEqual(["Fox"]);
  });

  it("clears mainCharacter to null when there's no qualifying game history", async () => {
    const player = await createTestUser({ mainCharacter: "Fox" });

    await prisma.$transaction((tx) => recomputeCharacterUsage(player.id, tx));

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
    expect(updated.mainCharacter).toBeNull();
    expect(updated.secondaryCharacters).toEqual([]);
  });

  it("excludes a secondary that falls short of the usage threshold", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    // 8 Fox games + 2 Falco games = 10 total — Falco lands at 20%, short of 30%.
    for (let i = 1; i <= 8; i++) {
      await createGame(match.id, i, player.id, "Fox", opponent.id, "Marth", player.id);
    }
    await createGame(match.id, 9, player.id, "Falco", opponent.id, "Marth", player.id);
    await createGame(match.id, 10, player.id, "Falco", opponent.id, "Marth", player.id);

    await prisma.$transaction((tx) => recomputeCharacterUsage(player.id, tx));

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
    expect(updated.mainCharacter).toBe("Fox");
    expect(updated.secondaryCharacters).toEqual([]);
  });

  it("includes a secondary at exactly the usage threshold — 30% or more qualifies", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    // 7 Fox games + 3 Falco games = 10 total — Falco lands at exactly 30%.
    for (let i = 1; i <= 7; i++) {
      await createGame(match.id, i, player.id, "Fox", opponent.id, "Marth", player.id);
    }
    await createGame(match.id, 8, player.id, "Falco", opponent.id, "Marth", player.id);
    await createGame(match.id, 9, player.id, "Falco", opponent.id, "Marth", player.id);
    await createGame(match.id, 10, player.id, "Falco", opponent.id, "Marth", player.id);

    await prisma.$transaction((tx) => recomputeCharacterUsage(player.id, tx));

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
    expect(updated.mainCharacter).toBe("Fox");
    expect(updated.secondaryCharacters).toEqual(["Falco"]);
  });
});

describe("getCharacterLeaderboard", () => {
  it("includes a player whose mainCharacter matches", async () => {
    const player = await createTestUser({ mainCharacter: "Fox", gamesPlayed: 10 });
    const results = await getCharacterLeaderboard("Fox");
    expect(results.map((p) => p.id)).toContain(player.id);
  });

  it("includes a player whose secondaryCharacters matches, not just mainCharacter", async () => {
    const player = await createTestUser({ mainCharacter: "Fox", secondaryCharacters: ["Falco"], gamesPlayed: 10 });
    const results = await getCharacterLeaderboard("Falco");
    expect(results.map((p) => p.id)).toContain(player.id);
  });

  it("excludes players below the games-played threshold", async () => {
    const player = await createTestUser({ mainCharacter: "Fox", gamesPlayed: 0 });
    const results = await getCharacterLeaderboard("Fox");
    expect(results.map((p) => p.id)).not.toContain(player.id);
  });
});
