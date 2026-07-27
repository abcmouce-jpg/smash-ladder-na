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
});
