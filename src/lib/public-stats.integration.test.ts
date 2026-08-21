import { describe, it, expect } from "vitest";
import { MatchStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { getMatchesPerDay, getMatchesTodayCount, getPublicStats } from "@/lib/public-stats";
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
