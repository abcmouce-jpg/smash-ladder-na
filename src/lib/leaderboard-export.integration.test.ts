import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { getRankingsForExport } from "@/lib/leaderboard";
import { DELETED_USERNAME } from "@/lib/account";
import { UserStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";

// The export is what SPSP seeds from, so a wrong rank here becomes a wrong
// seed in a real bracket.
describe("getRankingsForExport", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany({});
  });

  it("gives tied players the same rank and skips the next, like the leaderboard", async () => {
    await createTestUser({ username: "Top", rating: 1900, gamesPlayed: 20 });
    await createTestUser({ username: "TieA", rating: 1700, gamesPlayed: 20 });
    await createTestUser({ username: "TieB", rating: 1700, gamesPlayed: 20 });
    await createTestUser({ username: "Below", rating: 1500, gamesPlayed: 20 });

    const { players } = await getRankingsForExport(10, 0);
    expect(players.map((p) => [p.username, p.rank])).toEqual([
      ["Top", 1],
      ["TieA", 2],
      ["TieB", 2],
      ["Below", 4],
    ]);
  });

  it("keeps ranks right when a tie straddles a page boundary", async () => {
    // The case that a count-along-the-page implementation gets wrong: page 2
    // cannot see the tied row left behind on page 1, so every later rank comes
    // out too small.
    await createTestUser({ username: "P1", rating: 1900, gamesPlayed: 20 });
    await createTestUser({ username: "P2", rating: 1700, gamesPlayed: 20 });
    await createTestUser({ username: "P3", rating: 1700, gamesPlayed: 20 });
    await createTestUser({ username: "P4", rating: 1700, gamesPlayed: 20 });
    await createTestUser({ username: "P5", rating: 1200, gamesPlayed: 20 });

    const page1 = await getRankingsForExport(2, 0);
    const page2 = await getRankingsForExport(3, 2);

    expect(page1.players.map((p) => p.rank)).toEqual([1, 2]);
    // Two more at 1700 share rank 2, then 1200 is 5th — not 3rd.
    expect(page2.players.map((p) => p.rank)).toEqual([2, 2, 5]);
    expect(page2.players.at(-1)?.username).toBe("P5");
  });

  it("applies the same eligibility rule as the public leaderboard", async () => {
    await createTestUser({ username: "Ranked", rating: 1600, gamesPlayed: LEADERBOARD_MIN_GAMES });
    await createTestUser({ username: "TooFew", rating: 1900, gamesPlayed: LEADERBOARD_MIN_GAMES - 1 });
    await createTestUser({ username: "Banned", rating: 1900, gamesPlayed: 20, status: UserStatus.BANNED });
    await createTestUser({ username: DELETED_USERNAME, rating: 1900, gamesPlayed: 20 });

    const { players, totalCount } = await getRankingsForExport(10, 0);
    expect(players.map((p) => p.username)).toEqual(["Ranked"]);
    expect(totalCount).toBe(1);
  });

  it("exposes start.gg only for players who connected it", async () => {
    await createTestUser({
      username: "Linked",
      rating: 1800,
      gamesPlayed: 20,
      startggUserId: "sgg-user-1",
      startggPlayerId: "sgg-player-1",
      startggSlug: "user/linked",
      startggGamerTag: "Linked",
    });
    await createTestUser({ username: "Unlinked", rating: 1700, gamesPlayed: 20 });

    const { players } = await getRankingsForExport(10, 0);
    expect(players[0].startgg).toEqual({
      userId: "sgg-user-1",
      playerId: "sgg-player-1",
      slug: "user/linked",
      gamerTag: "Linked",
    });
    // Listed, not omitted — a seeder should be able to see who it can't match.
    expect(players[1].username).toBe("Unlinked");
    expect(players[1].startgg).toBeNull();
  });
});
