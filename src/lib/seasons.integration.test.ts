import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { getActiveSeason, getPlayerSeasonAchievements, launchPreSeasonIfDue, PRE_SEASON_STARTS_AT } from "@/lib/seasons";
import { createTestUser } from "@/test/factories";

const before = new Date(PRE_SEASON_STARTS_AT.getTime() - 60_000);
const after = new Date(PRE_SEASON_STARTS_AT.getTime() + 60_000);

describe("launchPreSeasonIfDue", () => {
  it("does nothing before the launch moment", async () => {
    await prisma.season.create({ data: { name: "Season 1", startsAt: before } });
    const launched = await launchPreSeasonIfDue(before);
    expect(launched).toBe(false);
  });

  it("closes out the pre-launch season and resets ratings on first tick after launch", async () => {
    const testSeason = await prisma.season.create({ data: { name: "Season 1", startsAt: before } });
    const player = await createTestUser({ rating: 1820, gamesPlayed: 15 });
    await prisma.ratingMatch.create({
      data: {
        player1Id: player.id,
        player2Id: (await createTestUser()).id,
        status: "CONFIRMED",
        confirmedAt: before,
        expiresAt: before,
        seasonId: testSeason.id,
      },
    });

    const launched = await launchPreSeasonIfDue(after);
    expect(launched).toBe(true);

    const closedSeason = await prisma.season.findUniqueOrThrow({ where: { id: testSeason.id } });
    expect(closedSeason.endsAt).not.toBeNull();

    const active = await getActiveSeason();
    expect(active?.name).toBe("Preseason");
    expect(active?.id).not.toBe(testSeason.id);
    expect(active!.startsAt.getTime()).toBeGreaterThanOrEqual(PRE_SEASON_STARTS_AT.getTime());

    const resetPlayer = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
    expect(resetPlayer.rating).toBe(1500);
    expect(resetPlayer.gamesPlayed).toBe(0);
  });

  it("is idempotent — a second tick after launch does not reset again", async () => {
    await prisma.season.create({ data: { name: "Season 1", startsAt: before } });
    await launchPreSeasonIfDue(after);

    const player = await createTestUser({ rating: 1650, gamesPlayed: 8 });
    const secondTick = await launchPreSeasonIfDue(new Date(after.getTime() + 5 * 60_000));
    expect(secondTick).toBe(false);

    const untouched = await prisma.user.findUniqueOrThrow({ where: { id: player.id } });
    expect(untouched.rating).toBe(1650);
    expect(untouched.gamesPlayed).toBe(8);
  });

  it("creates Preseason outright if no season exists yet when launch time passes", async () => {
    const launched = await launchPreSeasonIfDue(after);
    expect(launched).toBe(true);
    const active = await getActiveSeason();
    expect(active?.name).toBe("Preseason");
  });
});

describe("getPlayerSeasonAchievements", () => {
  it("surfaces top-3 finishes as achieved, medal-labeled entries, most recent season first", async () => {
    const player = await createTestUser();
    const season1 = await prisma.season.create({ data: { name: "Season 1", startsAt: before } });
    const season2 = await prisma.season.create({ data: { name: "Season 2", startsAt: after } });
    await prisma.seasonStanding.create({
      data: { seasonId: season1.id, userId: player.id, finalRating: 1820, gamesPlayed: 40, rank: 3 },
    });
    await prisma.seasonStanding.create({
      data: { seasonId: season2.id, userId: player.id, finalRating: 1950, gamesPlayed: 30, rank: 1 },
    });

    const achievements = await getPlayerSeasonAchievements(player.id);

    expect(achievements).toHaveLength(2);
    expect(achievements.every((a) => a.achieved)).toBe(true);
    expect(achievements[0].label).toBe("🥇 Season 2 Champion");
    expect(achievements[1].label).toBe("🥉 Season 1 3rd Place");
  });

  it("excludes finishes outside the top 3", async () => {
    const player = await createTestUser();
    const season = await prisma.season.create({ data: { name: "Season 1", startsAt: before } });
    await prisma.seasonStanding.create({
      data: { seasonId: season.id, userId: player.id, finalRating: 1600, gamesPlayed: 20, rank: 4 },
    });

    const achievements = await getPlayerSeasonAchievements(player.id);
    expect(achievements).toHaveLength(0);
  });

  it("returns an empty list for a player with no season standings", async () => {
    const player = await createTestUser();
    const achievements = await getPlayerSeasonAchievements(player.id);
    expect(achievements).toHaveLength(0);
  });
});
