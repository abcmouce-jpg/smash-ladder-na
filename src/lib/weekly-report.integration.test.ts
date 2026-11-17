import { describe, expect, it } from "vitest";
import { MatchMode, MatchStatus, UserStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { DELETED_USERNAME } from "@/lib/account";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { getWeeklyReport, weekBounds, weeksWithSets } from "@/lib/weekly-report";
import { createTestUser } from "@/test/factories";

// A week well in the past, so nothing another test writes with a "now"
// timestamp can land inside it.
const WEEK = "2026-03-02";
const bounds = weekBounds(WEEK)!;
const MONDAY = new Date(bounds.start.getTime() + 10 * 60 * 60 * 1000);
const WEDNESDAY = new Date(bounds.start.getTime() + 2 * 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000);

async function confirmedSet(
  p1: string,
  p2: string,
  confirmedAt: Date,
  opts: { mode?: MatchMode; games?: { a: string; b: string; winner: string }[] } = {},
) {
  const match = await prisma.ratingMatch.create({
    data: {
      player1Id: p1,
      player2Id: p2,
      status: MatchStatus.CONFIRMED,
      mode: opts.mode ?? MatchMode.STANDARD,
      confirmedAt,
      expiresAt: new Date(),
    },
  });
  let gameNumber = 0;
  for (const game of opts.games ?? []) {
    gameNumber += 1;
    await prisma.matchGame.create({
      data: {
        matchId: match.id,
        gameNumber,
        actorAId: p1,
        actorAStrikes: 0,
        actorACharacter: game.a,
        actorBId: p2,
        actorBStrikes: 0,
        actorBCharacter: game.b,
        winnerId: game.winner,
      },
    });
  }
  return match;
}

describe("getWeeklyReport", () => {
  it("counts the sets, games and players inside the week only", async () => {
    const a = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES, region: "USA East" });
    const b = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES, region: "USA West" });

    await confirmedSet(a.id, b.id, MONDAY, {
      games: [
        { a: "Fox", b: "Marth", winner: a.id },
        { a: "Fox", b: "Marth", winner: b.id },
      ],
    });
    await confirmedSet(a.id, b.id, WEDNESDAY, { games: [{ a: "Fox", b: "Lucina", winner: a.id }] });
    // The Sunday before the week starts, and the Monday after it ends.
    await confirmedSet(a.id, b.id, new Date(bounds.start.getTime() - 60 * 60 * 1000));
    await confirmedSet(a.id, b.id, new Date(bounds.end.getTime() + 60 * 60 * 1000));

    const report = await getWeeklyReport(WEEK);
    expect(report).not.toBeNull();
    expect(report!.sets).toBe(2);
    expect(report!.games).toBe(3);
    expect(report!.players).toBe(2);
    expect(report!.complete).toBe(true);
  });

  it("buckets by the day a set was confirmed, in ladder time", async () => {
    const a = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });
    const b = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });
    await confirmedSet(a.id, b.id, WEDNESDAY);

    const report = await getWeeklyReport(WEEK);
    expect(report!.byDay).toHaveLength(7);
    expect(report!.byDay.find((d) => d.day === "2026-03-04")?.sets).toBe(1);
    expect(report!.byDay.reduce((sum, d) => sum + d.sets, 0)).toBe(report!.sets);
  });

  it("folds echoes into the fighter they echo", async () => {
    // Peach/Daisy are grouped; Marth/Lucina deliberately are not (see
    // ECHO_FIGHTER_GROUPS), so this asserts both halves of that rule.
    const a = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });
    const b = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });
    await confirmedSet(a.id, b.id, MONDAY, {
      games: [
        { a: "Peach", b: "Daisy", winner: a.id },
        { a: "Daisy", b: "Peach", winner: a.id },
        { a: "Marth", b: "Lucina", winner: a.id },
      ],
    });

    const report = await getWeeklyReport(WEEK);
    expect(report!.characters.find((line) => line.character === "Peach")?.games).toBe(4);
    expect(report!.characters.some((line) => line.character === "Daisy")).toBe(false);
    expect(report!.characters.find((line) => line.character === "Marth")?.games).toBe(1);
    expect(report!.characters.find((line) => line.character === "Lucina")?.games).toBe(1);
  });

  it("splits by mode and counts a region for each side of the table", async () => {
    const a = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES, region: "USA East" });
    const b = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES, region: "Canada East" });
    await confirmedSet(a.id, b.id, MONDAY);
    await confirmedSet(a.id, b.id, MONDAY, { mode: MatchMode.RANDITTO });

    const report = await getWeeklyReport(WEEK);
    expect(report!.byMode).toEqual(
      expect.arrayContaining([
        { mode: MatchMode.STANDARD, sets: 1 },
        { mode: MatchMode.RANDITTO, sets: 1 },
      ]),
    );
    expect(report!.byRegion.find((r) => r.region === "USA East")?.sets).toBe(2);
    expect(report!.byRegion.find((r) => r.region === "Canada East")?.sets).toBe(2);
  });

  it("names only players whose rating is public", async () => {
    const shown = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });
    const provisional = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES - 1 });
    const banned = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES, status: UserStatus.BANNED });
    const deleted = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES, username: DELETED_USERNAME });

    await confirmedSet(shown.id, provisional.id, MONDAY);
    await confirmedSet(banned.id, deleted.id, MONDAY);

    const report = await getWeeklyReport(WEEK);
    const named = new Set(report!.grinders.map((line) => line.id));
    expect(named.has(shown.id)).toBe(true);
    expect(named.has(provisional.id)).toBe(false);
    expect(named.has(banned.id)).toBe(false);
    expect(named.has(deleted.id)).toBe(false);
    // The headline count still includes everyone who played.
    expect(report!.players).toBe(4);
  });

  it("sums a week's rating movement into the climb", async () => {
    const a = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });
    const b = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });
    const match = await confirmedSet(a.id, b.id, MONDAY);
    await prisma.ratingHistory.createMany({
      data: [
        { userId: a.id, matchId: match.id, ratingBefore: 1500, ratingAfter: 1518, delta: 18, createdAt: MONDAY },
        { userId: b.id, matchId: match.id, ratingBefore: 1500, ratingAfter: 1482, delta: -18, createdAt: MONDAY },
        // Outside the week: must not count.
        {
          userId: a.id,
          matchId: match.id,
          ratingBefore: 1518,
          ratingAfter: 1600,
          delta: 82,
          createdAt: new Date(bounds.end.getTime() + 60 * 60 * 1000),
        },
      ],
    });

    const report = await getWeeklyReport(WEEK);
    expect(report!.climbers[0]).toMatchObject({ id: a.id, delta: 18 });
    expect(report!.climbers.at(-1)).toMatchObject({ id: b.id, delta: -18 });
  });

  it("counts a debut only for a player with no earlier confirmed set", async () => {
    const veteran = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });
    const rookie = await createTestUser({ gamesPlayed: 1 });
    await confirmedSet(veteran.id, rookie.id, new Date(bounds.start.getTime() - 7 * 24 * 60 * 60 * 1000));
    await confirmedSet(veteran.id, rookie.id, MONDAY);

    const report = await getWeeklyReport(WEEK);
    expect(report!.debuts).toBe(0);

    const debutant = await createTestUser({ gamesPlayed: 1 });
    await confirmedSet(veteran.id, debutant.id, MONDAY);
    expect((await getWeeklyReport(WEEK))!.debuts).toBe(1);
  });

  it("refuses a malformed week and a week that has not started", async () => {
    expect(await getWeeklyReport("whenever")).toBeNull();
    expect(await getWeeklyReport("2099-01-05")).toBeNull();
  });
});

describe("weeksWithSets", () => {
  it("lists weeks that have sets, newest first, with their own counts", async () => {
    const a = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });
    const b = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });
    const c = await createTestUser({ gamesPlayed: LEADERBOARD_MIN_GAMES });
    await confirmedSet(a.id, b.id, MONDAY);
    await confirmedSet(a.id, c.id, WEDNESDAY);
    const earlier = weekBounds("2026-02-23")!;
    await confirmedSet(a.id, b.id, new Date(earlier.start.getTime() + 10 * 60 * 60 * 1000));

    const weeks = await weeksWithSets(10);
    const ids = weeks.map((week) => week.id);
    expect(ids.indexOf("2026-03-02")).toBeLessThan(ids.indexOf("2026-02-23"));

    const week = weeks.find((w) => w.id === "2026-03-02");
    expect(week).toMatchObject({ sets: 2, players: 3 });
  });
});
