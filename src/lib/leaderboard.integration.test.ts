import { describe, it, expect } from "vitest";
import { getLeaderboardPlayers } from "@/lib/leaderboard";
import { createTestUser } from "@/test/factories";

describe("getLeaderboardPlayers", () => {
  it("filters by region", async () => {
    await createTestUser({ gamesPlayed: 5, region: "USA East" });
    await createTestUser({ gamesPlayed: 5, region: "Europe West" });

    const { players, totalCount } = await getLeaderboardPlayers({ region: "USA East" });
    expect(totalCount).toBe(1);
    expect(players.every((p) => p.id)).toBe(true);
  });

  it("combines region with the other filters", async () => {
    const target = await createTestUser({
      gamesPlayed: 5,
      region: "USA East",
      mainCharacter: "Fox",
      username: `RegionCombo${Date.now()}`,
    });
    await createTestUser({ gamesPlayed: 5, region: "USA East", mainCharacter: "Falco" });
    await createTestUser({ gamesPlayed: 5, region: "Europe West", mainCharacter: "Fox" });

    const { players, totalCount } = await getLeaderboardPlayers({
      region: "USA East",
      character: "Fox",
    });
    expect(totalCount).toBe(1);
    expect(players[0].id).toBe(target.id);
  });

  it("returns everyone when no region is given", async () => {
    await createTestUser({ gamesPlayed: 5, region: "USA East" });
    await createTestUser({ gamesPlayed: 5, region: null });

    const { totalCount } = await getLeaderboardPlayers({});
    expect(totalCount).toBeGreaterThanOrEqual(2);
  });

  it("excludes banned accounts", async () => {
    const target = await createTestUser({ gamesPlayed: 5, username: `NotBanned${Date.now()}` });
    const banned = await createTestUser({ gamesPlayed: 5, status: "BANNED", username: "Deleted User" });

    const { players } = await getLeaderboardPlayers({});
    const ids = players.map((p) => p.id);
    expect(ids).toContain(target.id);
    expect(ids).not.toContain(banned.id);
  });

  it("matches a secondary character, not just mainCharacter", async () => {
    const target = await createTestUser({
      gamesPlayed: 5,
      mainCharacter: "Inkling",
      secondaryCharacters: ["Cloud"],
      username: `Secondary${Date.now()}`,
    });

    const { players, totalCount } = await getLeaderboardPlayers({ character: "Cloud" });
    expect(totalCount).toBe(1);
    expect(players[0].id).toBe(target.id);
  });

  it("excludes an ACTIVE account still named 'Deleted User' (Discord self-deletion, not a ban)", async () => {
    const target = await createTestUser({ gamesPlayed: 5, username: `StillActive${Date.now()}` });
    const selfDeleted = await createTestUser({ gamesPlayed: 5, status: "ACTIVE", username: "Deleted User" });

    const { players } = await getLeaderboardPlayers({});
    const ids = players.map((p) => p.id);
    expect(ids).toContain(target.id);
    expect(ids).not.toContain(selfDeleted.id);
  });

  it("still excludes 'Deleted User' when combined with a search query", async () => {
    await createTestUser({ gamesPlayed: 5, username: "Deleted User" });
    const target = await createTestUser({ gamesPlayed: 5, username: `DeletedSomething${Date.now()}` });

    const { players } = await getLeaderboardPlayers({ query: "Deleted" });
    const ids = players.map((p) => p.id);
    expect(ids).toContain(target.id);
    expect(players.every((p) => p.username !== "Deleted User")).toBe(true);
  });
});
