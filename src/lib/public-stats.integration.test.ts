import { describe, it, expect } from "vitest";
import { MatchStatus, UserStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import {
  getMatchesPerDay,
  getMatchesTodayCount,
  getPublicStats,
  getRatingDistribution,
  getStatsTotals,
} from "@/lib/public-stats";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { DELETED_USERNAME } from "@/lib/account";
import { getMatchFeedStats } from "@/lib/match-feed";
import { startOfDayInTimeZone } from "@/lib/timezone";
import { createTestUser } from "@/test/factories";

async function createConfirmedMatch(p1: string, p2: string, confirmedAt: Date) {
  return prisma.ratingMatch.create({
    data: {
      player1Id: p1,
      player2Id: p2,
      status: MatchStatus.CONFIRMED,
      confirmedAt,
      expiresAt: new Date(),
    },
  });
}

describe("getMatchesPerDay", () => {
  it("returns confirmed match timestamps from inside the window", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const confirmedAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    await createConfirmedMatch(p1.id, p2.id, confirmedAt);

    expect(await getMatchesPerDay(30)).toContain(confirmedAt.toISOString());
  });

  it("excludes matches confirmed before the window", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago
    await createConfirmedMatch(p1.id, p2.id, old);

    expect(await getMatchesPerDay(30)).not.toContain(old.toISOString());
  });

  it("only counts CONFIRMED matches, even when a pending one has a confirmedAt", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const confirmedAt = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.PENDING_REPORT,
        confirmedAt,
        expiresAt: new Date(),
      },
    });

    expect(await getMatchesPerDay(30)).not.toContain(confirmedAt.toISOString());
  });

  it("returns an empty array when there are no matches at all", async () => {
    expect(await getMatchesPerDay(30)).toEqual([]);
  });
});

describe("getMatchesTodayCount", () => {
  it("counts a match created today regardless of status", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    expect(await getMatchesTodayCount()).toBe(1);
  });

  it("excludes a match created before today (ladder timezone)", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    const beforeToday = new Date(startOfDayInTimeZone(new Date()).getTime() - 60 * 1000);
    await prisma.ratingMatch.create({
      data: {
        player1Id: p1.id,
        player2Id: p2.id,
        status: MatchStatus.CONFIRMED,
        createdAt: beforeToday,
        confirmedAt: beforeToday,
        expiresAt: beforeToday,
      },
    });

    expect(await getMatchesTodayCount()).toBe(0);
  });

  // The whole point of unifying this: the homepage, the Sets feed, and the
  // admin overview must never disagree on "matches today" again the way
  // they used to (rolling 24h + CONFIRMED-only vs. calendar day + any
  // status, three different numbers for the same label).
  it("agrees with getPublicStats and getMatchFeedStats for the same data", async () => {
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    const [direct, publicStats, feedStats] = await Promise.all([
      getMatchesTodayCount(),
      getPublicStats(),
      getMatchFeedStats(),
    ]);

    expect(publicStats.matchesToday).toBe(direct);
    expect(feedStats.matchesToday).toBe(direct);
  });
});

describe("getRatingDistribution", () => {
  it("buckets ranked players' current ratings and reports their stats", async () => {
    await createTestUser({ rating: 1500, gamesPlayed: LEADERBOARD_MIN_GAMES });
    await createTestUser({ rating: 1500, gamesPlayed: LEADERBOARD_MIN_GAMES });

    const { buckets, total, median, average } = await getRatingDistribution();
    expect(total).toBe(2);
    expect(buckets).toEqual([{ min: 1500, max: 1524, count: 2 }]);
    expect(median).toBe(1500);
    expect(average).toBe(1500);
  });

  it("excludes players below the games floor", async () => {
    await createTestUser({ rating: 1500, gamesPlayed: LEADERBOARD_MIN_GAMES });
    await createTestUser({ rating: 2600, gamesPlayed: LEADERBOARD_MIN_GAMES - 1 });

    const { total } = await getRatingDistribution();
    expect(total).toBe(1);
  });

  it("excludes banned players and self-deleted accounts", async () => {
    await createTestUser({ rating: 1500, gamesPlayed: LEADERBOARD_MIN_GAMES });
    await createTestUser({ rating: 1500, gamesPlayed: LEADERBOARD_MIN_GAMES, status: UserStatus.BANNED });
    await createTestUser({ rating: 1500, gamesPlayed: LEADERBOARD_MIN_GAMES, username: DELETED_USERNAME });

    const { total, buckets } = await getRatingDistribution();
    expect(total).toBe(1);
    expect(buckets.reduce((sum, b) => sum + b.count, 0)).toBe(1);
  });

  it("keeps the buckets contiguous, empty ones included", async () => {
    await createTestUser({ rating: 1500, gamesPlayed: LEADERBOARD_MIN_GAMES });
    await createTestUser({ rating: 3000, gamesPlayed: LEADERBOARD_MIN_GAMES });

    const { buckets } = await getRatingDistribution();
    // A 1500-point spread lands on 100-wide bins: 1500–1599 … 3000–3099.
    expect(buckets).toHaveLength(16);
    expect(buckets[0]).toEqual({ min: 1500, max: 1599, count: 1 });
    expect(buckets[buckets.length - 1]).toEqual({ min: 3000, max: 3099, count: 1 });
    expect(buckets.filter((b) => b.count === 0)).toHaveLength(14);
  });

  it("returns an empty distribution when no one qualifies", async () => {
    const { buckets, total, median, average } = await getRatingDistribution();
    expect(buckets).toEqual([]);
    expect(total).toBe(0);
    expect(median).toBe(0);
    expect(average).toBe(0);
  });
});

describe("getStatsTotals", () => {
  async function createConfirmedMatchInSeason(p1: string, p2: string, seasonId: string | null) {
    return prisma.ratingMatch.create({
      data: {
        player1Id: p1,
        player2Id: p2,
        status: MatchStatus.CONFIRMED,
        seasonId,
        confirmedAt: new Date(),
        expiresAt: new Date(),
      },
    });
  }

  it("counts confirmed matches for the active season and all time, plus ranked players", async () => {
    const active = await prisma.season.create({ data: { name: "Active" } });
    const past = await prisma.season.create({ data: { name: "Past", endsAt: new Date() } });
    const p1 = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });
    const p2 = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });
    const p3 = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });
    await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES - 1 }); // below the leaderboard floor

    await createConfirmedMatchInSeason(p1.id, p2.id, active.id);
    await createConfirmedMatchInSeason(p2.id, p3.id, active.id);
    await createConfirmedMatchInSeason(p1.id, p3.id, past.id);

    const { matchesThisSeason, matchesAllTime, rankedPlayers } = await getStatsTotals();
    expect(matchesThisSeason).toBe(2);
    expect(matchesAllTime).toBe(3);
    expect(rankedPlayers).toBe(3);
  });

  it("ignores unconfirmed matches", async () => {
    await prisma.season.create({ data: { name: "Active" } });
    const p1 = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });
    const p2 = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });
    await prisma.ratingMatch.create({
      data: { player1Id: p1.id, player2Id: p2.id, status: MatchStatus.PENDING_REPORT, expiresAt: new Date() },
    });

    const { matchesThisSeason, matchesAllTime } = await getStatsTotals();
    expect(matchesThisSeason).toBe(0);
    expect(matchesAllTime).toBe(0);
  });

  it("reports zero for the season count when no season is active", async () => {
    const past = await prisma.season.create({ data: { name: "Past", endsAt: new Date() } });
    const p1 = await createTestUser();
    const p2 = await createTestUser();
    await createConfirmedMatchInSeason(p1.id, p2.id, past.id);

    const { matchesThisSeason, matchesAllTime } = await getStatsTotals();
    expect(matchesThisSeason).toBe(0);
    expect(matchesAllTime).toBe(1);
  });
});
