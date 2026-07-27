import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { getCharacterLeaderboard, reportOpponentCharacter } from "@/lib/character-stats";
import { createTestUser } from "@/test/factories";

async function createMatch(p1: string, p2: string) {
  return prisma.ratingMatch.create({
    data: { player1Id: p1, player2Id: p2, expiresAt: new Date() },
  });
}

describe("reportOpponentCharacter", () => {
  it("sets mainCharacter on the first report", async () => {
    const reporter = await createTestUser();
    const opponent = await createTestUser();
    const match = await createMatch(reporter.id, opponent.id);

    await reportOpponentCharacter(reporter.id, match.id, "Fox");

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: opponent.id } });
    expect(updated.mainCharacter).toBe("Fox");
    expect(updated.secondaryCharacters).toEqual([]);
  });

  it("accumulates a different character into secondaryCharacters instead of overwriting mainCharacter", async () => {
    const reporter = await createTestUser();
    const opponent = await createTestUser({ mainCharacter: "Fox" });
    const match = await createMatch(reporter.id, opponent.id);

    await reportOpponentCharacter(reporter.id, match.id, "Falco");

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: opponent.id } });
    expect(updated.mainCharacter).toBe("Fox");
    expect(updated.secondaryCharacters).toEqual(["Falco"]);
  });

  it("doesn't duplicate a character already in secondaryCharacters", async () => {
    const reporter = await createTestUser();
    const opponent = await createTestUser({ mainCharacter: "Fox", secondaryCharacters: ["Falco"] });
    const match = await createMatch(reporter.id, opponent.id);

    await reportOpponentCharacter(reporter.id, match.id, "Falco");

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: opponent.id } });
    expect(updated.secondaryCharacters).toEqual(["Falco"]);
  });

  it("doesn't add anything once the secondary list is at the cap", async () => {
    const reporter = await createTestUser();
    const opponent = await createTestUser({
      mainCharacter: "Fox",
      secondaryCharacters: ["Falco", "Marth", "Cloud", "Roy", "Ike"],
    });
    const match = await createMatch(reporter.id, opponent.id);

    await reportOpponentCharacter(reporter.id, match.id, "Pikachu");

    const updated = await prisma.user.findUniqueOrThrow({ where: { id: opponent.id } });
    expect(updated.secondaryCharacters).toEqual(["Falco", "Marth", "Cloud", "Roy", "Ike"]);
  });

  it("rejects a non-participant", async () => {
    const outsider = await createTestUser();
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const match = await createMatch(p1.id, p2.id);

    await expect(reportOpponentCharacter(outsider.id, match.id, "Fox")).rejects.toThrow(/participant/i);
  });

  it("rejects an unrecognized character", async () => {
    const reporter = await createTestUser();
    const opponent = await createTestUser();
    const match = await createMatch(reporter.id, opponent.id);

    await expect(reportOpponentCharacter(reporter.id, match.id, "Not A Real Fighter")).rejects.toThrow(
      /not a recognized character/i,
    );
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
