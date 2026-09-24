import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/db";
import * as discordBot from "@/lib/discord-bot";
import { MatchStatus } from "@/generated/prisma/enums";
import {
  getActiveSeason,
  getPlayerSeasonAchievements,
  getSeasonEndsAt,
  endActiveSeasonAndStartNext,
  endActiveSeasonIfDue,
  launchPreSeasonIfDue,
  PRE_SEASON_NAME,
  PRE_SEASON_STARTS_AT,
} from "@/lib/seasons";
import { createTestUser } from "@/test/factories";

async function createTestMatch(status: MatchStatus, confirmedAt: Date | null = null) {
  const player1 = await createTestUser();
  const player2 = await createTestUser();
  return prisma.ratingMatch.create({
    data: {
      player1Id: player1.id,
      player2Id: player2.id,
      status,
      confirmedAt,
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
}

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

describe("getSeasonEndsAt", () => {
  it("prefers endsAt once a season is actually over", () => {
    const endsAt = new Date("2026-01-01");
    const scheduledEndAt = new Date("2026-06-01");
    expect(getSeasonEndsAt({ endsAt, scheduledEndAt })).toBe(endsAt);
  });

  it("falls back to scheduledEndAt for a still-active season", () => {
    const scheduledEndAt = new Date("2026-06-01");
    expect(getSeasonEndsAt({ endsAt: null, scheduledEndAt })).toBe(scheduledEndAt);
  });

  it("is null for a manual-only season", () => {
    expect(getSeasonEndsAt({ endsAt: null, scheduledEndAt: null })).toBeNull();
  });
});

describe("endActiveSeasonAndStartNext", () => {
  it("cancels every unresolved match, no-ops on already-terminal ones, and DMs both sides of each cancellation", async () => {
    vi.spyOn(discordBot, "sendDiscordDM").mockResolvedValue(undefined);
    await prisma.season.create({ data: { name: "Season 1", startsAt: before } });

    const pending = await createTestMatch(MatchStatus.PENDING_REPORT);
    const reported = await createTestMatch(MatchStatus.REPORTED);
    const disputed = await createTestMatch(MatchStatus.DISPUTED);
    const confirmed = await createTestMatch(MatchStatus.CONFIRMED, new Date());
    const alreadyCancelled = await createTestMatch(MatchStatus.CANCELLED);

    await endActiveSeasonAndStartNext("Season 2", after);

    const statuses = await prisma.ratingMatch.findMany({
      where: { id: { in: [pending.id, reported.id, disputed.id, confirmed.id, alreadyCancelled.id] } },
      select: { id: true, status: true },
    });
    const byId = new Map(statuses.map((m) => [m.id, m.status]));
    expect(byId.get(pending.id)).toBe("CANCELLED");
    expect(byId.get(reported.id)).toBe("CANCELLED");
    expect(byId.get(disputed.id)).toBe("CANCELLED");
    expect(byId.get(confirmed.id)).toBe("CONFIRMED"); // untouched — already settled
    expect(byId.get(alreadyCancelled.id)).toBe("CANCELLED"); // untouched, was already terminal

    // 3 newly-cancelled matches x 2 players each = 6 DMs; the pre-cancelled
    // and confirmed matches' players are never contacted.
    expect(discordBot.sendDiscordDM).toHaveBeenCalledTimes(6);
  });

  it("sets the next season's scheduledEndAt when given one, and leaves it null otherwise", async () => {
    await prisma.season.create({ data: { name: "Season 1", startsAt: before } });
    const nextEnd = new Date(after.getTime() + 30 * 24 * 60 * 60 * 1000);

    await endActiveSeasonAndStartNext("Season 2", after, nextEnd);

    const active = await getActiveSeason();
    expect(active?.name).toBe("Season 2");
    expect(active?.scheduledEndAt?.getTime()).toBe(nextEnd.getTime());
  });
});

describe("endActiveSeasonIfDue", () => {
  it("does nothing for a season with no scheduledEndAt", async () => {
    await prisma.season.create({ data: { name: "Season 1", startsAt: before } });
    const result = await endActiveSeasonIfDue(after);
    expect(result).toBe(false);
    expect((await getActiveSeason())?.name).toBe("Season 1");
  });

  it("does nothing before the scheduled end passes", async () => {
    const scheduledEndAt = new Date(before.getTime() + 60 * 60 * 1000);
    await prisma.season.create({ data: { name: "Season 1", startsAt: before, scheduledEndAt } });
    const result = await endActiveSeasonIfDue(before);
    expect(result).toBe(false);
  });

  it("rolls over and cancels unresolved matches once the scheduled end passes", async () => {
    vi.spyOn(discordBot, "sendDiscordDM").mockResolvedValue(undefined);
    const scheduledEndAt = new Date(before.getTime() + 60 * 60 * 1000);
    await prisma.season.create({ data: { name: "Season 1", startsAt: before, scheduledEndAt } });
    const inFlight = await createTestMatch(MatchStatus.PENDING_REPORT);

    const dueAt = new Date(scheduledEndAt.getTime() + 60_000);
    const result = await endActiveSeasonIfDue(dueAt);
    expect(result).toBe(true);

    const active = await getActiveSeason();
    expect(active?.name).toBe("Season 2");
    expect(active?.scheduledEndAt).toBeNull();

    const cancelledMatch = await prisma.ratingMatch.findUniqueOrThrow({ where: { id: inFlight.id } });
    expect(cancelledMatch.status).toBe("CANCELLED");
  });

  it('names the season after the preseason "Season 1", not the generic count-based default', async () => {
    const scheduledEndAt = new Date(before.getTime() + 60 * 60 * 1000);
    await prisma.season.create({ data: { name: PRE_SEASON_NAME, startsAt: before, scheduledEndAt } });

    await endActiveSeasonIfDue(new Date(scheduledEndAt.getTime() + 60_000));

    const active = await getActiveSeason();
    expect(active?.name).toBe("Season 1");
  });
});
