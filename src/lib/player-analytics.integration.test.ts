import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { getPersonalAnalytics } from "@/lib/player-analytics";
import { MatchStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

async function createConfirmedMatch(
  p1: string,
  p2: string,
  opts: { player1IsPracticing?: boolean; player2IsPracticing?: boolean } = {},
) {
  return prisma.ratingMatch.create({
    data: {
      player1Id: p1,
      player2Id: p2,
      status: MatchStatus.CONFIRMED,
      expiresAt: new Date(),
      player1IsPracticing: opts.player1IsPracticing ?? false,
      player2IsPracticing: opts.player2IsPracticing ?? false,
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
  finalStage: string | null = "Battlefield",
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
      finalStage,
    },
  });
}

describe("getPersonalAnalytics", () => {
  it("computes win/loss counts per character the player used, from either actor slot", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Fox", opponent.id, "Marth", player.id);
    await createGame(match.id, 2, opponent.id, "Marth", player.id, "Fox", opponent.id);
    await createGame(match.id, 3, player.id, "Falco", opponent.id, "Marth", opponent.id);

    const { characterWinRates } = await getPersonalAnalytics(player.id);
    const fox = characterWinRates.find((r) => r.label === "Fox");
    const falco = characterWinRates.find((r) => r.label === "Falco");

    expect(fox).toEqual({ label: "Fox", wins: 1, losses: 1, total: 2, winRate: 0.5 });
    expect(falco).toEqual({ label: "Falco", wins: 0, losses: 1, total: 1, winRate: 0 });
  });

  it("computes win/loss counts per stage", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Fox", opponent.id, "Marth", player.id, "Pokémon Stadium 2");
    await createGame(match.id, 2, player.id, "Fox", opponent.id, "Marth", opponent.id, "Pokémon Stadium 2");

    const { stageWinRates } = await getPersonalAnalytics(player.id);
    expect(stageWinRates).toEqual([{ label: "Pokémon Stadium 2", wins: 1, losses: 1, total: 2, winRate: 0.5 }]);
  });

  it("excludes games from a match where this player's side was practicing", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id, { player1IsPracticing: true });
    await createGame(match.id, 1, player.id, "Fox", opponent.id, "Marth", player.id);

    const { characterWinRates, stageWinRates } = await getPersonalAnalytics(player.id);
    expect(characterWinRates).toEqual([]);
    expect(stageWinRates).toEqual([]);
  });

  it("includes a match where only the OTHER side was practicing", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id, { player2IsPracticing: true });
    await createGame(match.id, 1, player.id, "Fox", opponent.id, "Marth", player.id);

    const { characterWinRates } = await getPersonalAnalytics(player.id);
    expect(characterWinRates.find((r) => r.label === "Fox")?.wins).toBe(1);
  });

  it("ignores games with no decided winner", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    await createGame(match.id, 1, player.id, "Fox", opponent.id, "Marth", null);

    const { characterWinRates, stageWinRates } = await getPersonalAnalytics(player.id);
    expect(characterWinRates).toEqual([]);
    expect(stageWinRates).toEqual([]);
  });

  it("returns the rating trend in chronological order", async () => {
    const player = await createTestUser();
    const opponent = await createTestUser();
    const match = await createConfirmedMatch(player.id, opponent.id);
    const older = new Date(Date.now() - 60_000);
    const newer = new Date();
    await prisma.ratingHistory.create({
      data: { userId: player.id, matchId: match.id, ratingBefore: 1500, ratingAfter: 1550, delta: 50, createdAt: older },
    });
    await prisma.ratingHistory.create({
      data: { userId: player.id, matchId: match.id, ratingBefore: 1550, ratingAfter: 1530, delta: -20, createdAt: newer },
    });

    const { ratingTrend } = await getPersonalAnalytics(player.id);
    expect(ratingTrend.map((p) => p.rating)).toEqual([1550, 1530]);
  });
});
