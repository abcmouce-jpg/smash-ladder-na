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

  it("searching a broad region also finds players who set a specific state within it", async () => {
    const broad = await createTestUser({ gamesPlayed: 5, region: "USA East" });
    const granular = await createTestUser({ gamesPlayed: 5, region: "New York" });
    const outside = await createTestUser({ gamesPlayed: 5, region: "California" });

    const { players, totalCount } = await getLeaderboardPlayers({ region: "USA East" });
    const ids = players.map((p) => p.id);
    expect(totalCount).toBe(2);
    expect(ids).toEqual(expect.arrayContaining([broad.id, granular.id]));
    expect(ids).not.toContain(outside.id);
  });

  it("filters by country", async () => {
    const usPlayer = await createTestUser({ gamesPlayed: 5, region: "Texas" });
    const canadaPlayer = await createTestUser({ gamesPlayed: 5, region: "Ontario" });
    const mexicoPlayer = await createTestUser({ gamesPlayed: 5, region: "Mexico North" });
    const otherPlayer = await createTestUser({ gamesPlayed: 5, region: "Europe West" });

    const { players: us, totalCount: usCount } = await getLeaderboardPlayers({ country: "United States" });
    expect(usCount).toBe(1);
    expect(us[0].id).toBe(usPlayer.id);

    const { players: canada } = await getLeaderboardPlayers({ country: "Canada" });
    expect(canada.map((p) => p.id)).toEqual([canadaPlayer.id]);

    const { players: mexico } = await getLeaderboardPlayers({ country: "Mexico" });
    expect(mexico.map((p) => p.id)).toEqual([mexicoPlayer.id]);

    const { players: other } = await getLeaderboardPlayers({ country: "Other" });
    const otherIds = other.map((p) => p.id);
    expect(otherIds).toContain(otherPlayer.id);
    expect(otherIds).not.toEqual(expect.arrayContaining([usPlayer.id, canadaPlayer.id, mexicoPlayer.id]));
  });

  it("region takes precedence when both region and country are given", async () => {
    const texas = await createTestUser({ gamesPlayed: 5, region: "Texas" });
    const ontario = await createTestUser({ gamesPlayed: 5, region: "Ontario" });

    // A mismatched pair (region in a different country than requested)
    // defers to region — the more specific of the two filters.
    const { players, totalCount } = await getLeaderboardPlayers({ region: "Texas", country: "Canada" });
    expect(totalCount).toBe(1);
    expect(players[0].id).toBe(texas.id);
    expect(players.map((p) => p.id)).not.toContain(ontario.id);
  });

  it("excludes banned accounts", async () => {
    const target = await createTestUser({ gamesPlayed: 5, username: `NotBanned${Date.now()}` });
    const banned = await createTestUser({ gamesPlayed: 5, status: "BANNED", username: "Deleted User" });

    const { players } = await getLeaderboardPlayers({});
    const ids = players.map((p) => p.id);
    expect(ids).toContain(target.id);
    expect(ids).not.toContain(banned.id);
  });

  it("includes a player whose mainCharacter matches", async () => {
    const player = await createTestUser({ gamesPlayed: 5, mainCharacter: "Fox" });

    const { players } = await getLeaderboardPlayers({ character: "Fox" });
    expect(players.map((p) => p.id)).toContain(player.id);
  });

  it("includes a player who has the character as a secondary", async () => {
    const player = await createTestUser({
      gamesPlayed: 5,
      mainCharacter: "Fox",
      secondaryCharacters: ["Falco"],
    });

    const { players } = await getLeaderboardPlayers({ character: "Falco" });
    expect(players.map((p) => p.id)).toContain(player.id);
  });

  it("excludes a player who neither mains nor secondaries the character", async () => {
    await createTestUser({ gamesPlayed: 5, mainCharacter: "Fox", secondaryCharacters: ["Falco"] });

    const { players, totalCount } = await getLeaderboardPlayers({ character: "Cloud" });
    expect(totalCount).toBe(0);
    expect(players).toEqual([]);
  });

  it("counts echo fighters as the same character", async () => {
    const daisyMain = await createTestUser({ gamesPlayed: 5, mainCharacter: "Daisy" });
    const foxSecondary = await createTestUser({
      gamesPlayed: 5,
      mainCharacter: "Fox",
      secondaryCharacters: ["Daisy"],
    });

    const { players } = await getLeaderboardPlayers({ character: "Peach" });
    const ids = players.map((p) => p.id);
    expect(ids).toContain(daisyMain.id);
    expect(ids).toContain(foxSecondary.id);
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
