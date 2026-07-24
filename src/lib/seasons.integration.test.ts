import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";
import { getActiveSeason, launchPreSeasonIfDue, PRE_SEASON_STARTS_AT } from "@/lib/seasons";
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
    expect(active?.name).toBe("Season 1");
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

  it("creates Season 1 outright if no season exists yet when launch time passes", async () => {
    const launched = await launchPreSeasonIfDue(after);
    expect(launched).toBe(true);
    const active = await getActiveSeason();
    expect(active?.name).toBe("Season 1");
  });
});
