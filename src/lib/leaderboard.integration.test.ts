import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { getUnrankedPlayers } from "@/lib/leaderboard";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { DELETED_USERNAME } from "@/lib/account";
import { UserStatus } from "@/generated/prisma/enums";
import { createTestUser } from "@/test/factories";

// The leaderboard starts at LEADERBOARD_MIN_GAMES, which is right for a
// ranking and leaves a new instance looking empty while people are in fact
// signing up. This is the list that shows them.
describe("getUnrankedPlayers", () => {
  it("lists a player who has signed up but hasn't played enough to rank", async () => {
    const newcomer = await createTestUser({ gamesPlayed: 0 });
    const ranked = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });

    const ids = (await getUnrankedPlayers(10)).map((p) => p.id);

    expect(ids).toContain(newcomer.id);
    expect(ids).not.toContain(ranked.id);
  });

  it("puts the newest arrival first, which is what makes it read as 'who just joined'", async () => {
    const older = await createTestUser({ gamesPlayed: 1, createdAt: new Date("2026-01-01T00:00:00Z") });
    const newer = await createTestUser({ gamesPlayed: 1, createdAt: new Date("2026-06-01T00:00:00Z") });

    const ids = (await getUnrankedPlayers(10)).map((p) => p.id);

    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
  });

  it("leaves out banned accounts and deleted ones", async () => {
    const banned = await createTestUser({ gamesPlayed: 0, status: UserStatus.BANNED });
    const deleted = await createTestUser({ gamesPlayed: 0, username: DELETED_USERNAME });

    const ids = (await getUnrankedPlayers(10)).map((p) => p.id);

    expect(ids).not.toContain(banned.id);
    expect(ids).not.toContain(deleted.id);
  });

  it("honours the limit, so an established instance doesn't list every lapsed signup", async () => {
    for (let i = 0; i < 5; i++) await createTestUser({ gamesPlayed: 0 });
    expect(await getUnrankedPlayers(3)).toHaveLength(3);
  });

  it("returns no rating — a provisional one isn't public and this doesn't change that", async () => {
    await createTestUser({ gamesPlayed: 0, rating: 1640 });
    const [player] = await getUnrankedPlayers(1);
    expect(player).not.toHaveProperty("rating");
    expect(player.gamesPlayed).toBe(0);
  });
});

// Guards the one assumption the page makes about its own empty state.
describe("the board's own cutoff", () => {
  it("is a positive number of sets, so 'unranked' is a real category", async () => {
    expect(LEADERBOARD_MIN_GAMES).toBeGreaterThan(0);
    await prisma.user.count();
  });
});
