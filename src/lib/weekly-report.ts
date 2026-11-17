// A week of the ladder, written down.
//
// Every number here already existed somewhere — in /stats, on a profile, in
// the leaderboard — but only ever as "right now". Nothing on the site said
// what happened in a given week, which is both the question a community
// actually asks ("who climbed last week?") and the one piece of writing this
// site can produce that no other site can, since the matches are ours.
//
// Strictly counts, rates and dates. No reading of what any of it means for
// how the game is played: which fighter is strong, why a matchup goes a
// certain way, what a usage swing implies. The numbers are the content; the
// interpretation is the reader's.
import { MatchMode, MatchStatus, UserStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { DELETED_USERNAME } from "@/lib/account";
import { echoGroupCanonical, type SmashCharacter } from "@/lib/characters";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { LADDER_TIME_ZONE, dayKeyInTimeZone, zonedTimeToUtc } from "@/lib/timezone";

/**
 * A week is named by the calendar date of its Monday in ladder time —
 * "2026-11-09" — rather than an ISO week number. Same information, and a
 * reader can tell from the URL which week they are looking at without
 * counting weeks from January.
 */
export type WeekId = string;

const WEEK_ID = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** 0 = Sunday, as the weekday reads in ladder time rather than UTC. */
function weekdayInLadderZone(date: Date): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: LADDER_TIME_ZONE, weekday: "short" }).format(date);
  return Math.max(0, WEEKDAYS.indexOf(short));
}

/** Monday 00:00 ladder time of the week `date` falls in. */
export function weekStartFor(date: Date): Date {
  const [year, month, day] = dayKeyInTimeZone(date).split("-").map(Number);
  const backToMonday = (weekdayInLadderZone(date) + 6) % 7;
  // Date.UTC normalises a zero or negative day into the previous month, so
  // the subtraction needs no month arithmetic of its own.
  return zonedTimeToUtc({ year, month, day: day - backToMonday });
}

export function weekIdFor(date: Date): WeekId {
  return dayKeyInTimeZone(weekStartFor(date));
}

/** The half-open [start, end) instants of a week id, or null if malformed. */
export function weekBounds(id: WeekId): { start: Date; end: Date } | null {
  const match = WEEK_ID.exec(id);
  if (!match) return null;
  const [, y, m, d] = match;
  const start = zonedTimeToUtc({ year: Number(y), month: Number(m), day: Number(d) });
  if (Number.isNaN(start.getTime())) return null;
  // Not start + 7 days of milliseconds: the DST weekend is 23 or 25 hours
  // long, and the next Monday's local midnight is what the week actually ends
  // at. Re-resolving through the zone keeps the boundary on the hour the
  // reader would call midnight.
  const end = weekStartFor(new Date(start.getTime() + 7 * DAY_MS + DAY_MS / 2));
  return { start, end };
}

/** Most recent weeks first, starting with the one in progress. */
export function recentWeekIds(count: number, now: Date = new Date()): WeekId[] {
  const ids: WeekId[] = [];
  let cursor = weekStartFor(now);
  for (let i = 0; i < count; i++) {
    ids.push(dayKeyInTimeZone(cursor));
    cursor = weekStartFor(new Date(cursor.getTime() - DAY_MS / 2));
  }
  return ids;
}

export type CharacterLine = {
  character: SmashCharacter;
  games: number;
  /** Share of all character picks that week, as a percentage. */
  pickRate: number;
  wins: number;
  /** Percentage, or null when the fighter never had a decided game. */
  winRate: number | null;
};

export type PlayerLine = {
  id: string;
  username: string;
  sets: number;
  /** Rating points gained or lost across the week. */
  delta: number;
};

export type WeeklyReport = {
  id: WeekId;
  start: Date;
  /** Exclusive — the following Monday. */
  end: Date;
  /** False while the week is still running, which the page says out loud. */
  complete: boolean;
  sets: number;
  games: number;
  /** Distinct accounts that finished at least one set. */
  players: number;
  /** Of those, the ones whose first ever confirmed set landed this week. */
  debuts: number;
  newAccounts: number;
  byDay: { day: string; sets: number }[];
  byMode: { mode: MatchMode; sets: number }[];
  byRegion: { region: string; sets: number }[];
  characters: CharacterLine[];
  characterPicks: number;
  climbers: PlayerLine[];
  grinders: PlayerLine[];
};

// Ratings are hidden until a player is past provisional (see isRatingVisible),
// so a weekly climb — which is a difference of two ratings — can only name
// players whose rating is public. Same floor as the leaderboard, same
// exclusions.
const NAMEABLE = {
  gamesPlayed: { gte: LEADERBOARD_MIN_GAMES },
  status: { not: UserStatus.BANNED },
  username: { not: DELETED_USERNAME },
};

export async function getWeeklyReport(id: WeekId): Promise<WeeklyReport | null> {
  const bounds = weekBounds(id);
  if (!bounds) return null;
  const { start, end } = bounds;
  if (start.getTime() > Date.now()) return null;

  const window = { status: MatchStatus.CONFIRMED, confirmedAt: { gte: start, lt: end } };

  const [matches, games, newAccounts] = await Promise.all([
    prisma.ratingMatch.findMany({
      where: window,
      select: {
        id: true,
        mode: true,
        confirmedAt: true,
        player1Id: true,
        player2Id: true,
        player1: { select: { region: true } },
        player2: { select: { region: true } },
      },
    }),
    prisma.matchGame.findMany({
      where: { winnerId: { not: null }, match: window },
      select: { actorAId: true, actorACharacter: true, actorBId: true, actorBCharacter: true, winnerId: true },
    }),
    prisma.user.count({ where: { createdAt: { gte: start, lt: end } } }),
  ]);

  const byDay = new Map<string, number>();
  for (let cursor = new Date(start); cursor < end; cursor = new Date(cursor.getTime() + DAY_MS)) {
    byDay.set(dayKeyInTimeZone(cursor), 0);
  }
  const byMode = new Map<MatchMode, number>();
  const byRegion = new Map<string, number>();
  const setsPerPlayer = new Map<string, number>();

  for (const match of matches) {
    if (match.confirmedAt) {
      const day = dayKeyInTimeZone(match.confirmedAt);
      if (byDay.has(day)) byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    byMode.set(match.mode, (byMode.get(match.mode) ?? 0) + 1);
    // A set is counted once per region involved, so a cross-region set shows
    // up in both — the column answers "how busy was this region", not "how
    // many sets happened there", which has no single answer.
    for (const region of new Set([match.player1.region, match.player2.region])) {
      if (region) byRegion.set(region, (byRegion.get(region) ?? 0) + 1);
    }
    for (const playerId of [match.player1Id, match.player2Id]) {
      setsPerPlayer.set(playerId, (setsPerPlayer.get(playerId) ?? 0) + 1);
    }
  }

  const picks = new Map<SmashCharacter, { games: number; wins: number }>();
  for (const game of games) {
    for (const [actorId, raw] of [
      [game.actorAId, game.actorACharacter],
      [game.actorBId, game.actorBCharacter],
    ] as const) {
      if (!raw) continue;
      const character = echoGroupCanonical(raw as SmashCharacter);
      const line = picks.get(character) ?? { games: 0, wins: 0 };
      line.games += 1;
      if (game.winnerId === actorId) line.wins += 1;
      picks.set(character, line);
    }
  }
  const characterPicks = [...picks.values()].reduce((sum, line) => sum + line.games, 0);
  const characters: CharacterLine[] = [...picks.entries()]
    .map(([character, line]) => ({
      character,
      games: line.games,
      pickRate: characterPicks === 0 ? 0 : Math.round((line.games / characterPicks) * 1000) / 10,
      wins: line.wins,
      winRate: line.games === 0 ? null : Math.round((line.wins / line.games) * 100),
    }))
    .sort((a, b) => b.games - a.games || a.character.localeCompare(b.character));

  const playerIds = [...setsPerPlayer.keys()];
  const [nameable, deltas, debuts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: playerIds }, ...NAMEABLE },
      select: { id: true, username: true },
    }),
    prisma.ratingHistory.groupBy({
      by: ["userId"],
      where: { userId: { in: playerIds }, createdAt: { gte: start, lt: end } },
      _sum: { delta: true },
    }),
    // First confirmed set ever, landing inside this week. Counted rather than
    // listed: a debut is a fact about the week, not about a player who may
    // not want a page written about their first game.
    prisma.user.count({
      where: {
        id: { in: playerIds },
        // Nothing confirmed before this week on either side of the table.
        matchesAsP1: { none: { status: MatchStatus.CONFIRMED, confirmedAt: { lt: start } } },
        matchesAsP2: { none: { status: MatchStatus.CONFIRMED, confirmedAt: { lt: start } } },
      },
    }),
  ]);

  const names = new Map(nameable.map((user) => [user.id, user.username]));
  const deltaById = new Map(deltas.map((row) => [row.userId, row._sum.delta ?? 0]));

  const lines: PlayerLine[] = [...names.entries()].map(([id, username]) => ({
    id,
    username,
    sets: setsPerPlayer.get(id) ?? 0,
    delta: Math.round(deltaById.get(id) ?? 0),
  }));

  return {
    id,
    start,
    end,
    complete: end.getTime() <= Date.now(),
    sets: matches.length,
    games: games.length,
    players: setsPerPlayer.size,
    debuts,
    newAccounts,
    byDay: [...byDay.entries()].map(([day, sets]) => ({ day, sets })),
    byMode: [...byMode.entries()].map(([mode, sets]) => ({ mode, sets })).sort((a, b) => b.sets - a.sets),
    byRegion: [...byRegion.entries()].map(([region, sets]) => ({ region, sets })).sort((a, b) => b.sets - a.sets),
    characters,
    characterPicks,
    climbers: [...lines].sort((a, b) => b.delta - a.delta || b.sets - a.sets).slice(0, 10),
    grinders: [...lines].sort((a, b) => b.sets - a.sets || b.delta - a.delta).slice(0, 10),
  };
}

export type WeekSummary = { id: WeekId; sets: number; players: number };

/**
 * Weeks that actually have sets in them, newest first — one query, for the
 * index and the sitemap.
 *
 * Postgres truncates to Monday too, so `date_trunc('week', ...)` agrees with
 * weekStartFor by construction; the timestamp is shifted into ladder time
 * first so a Sunday-night set does not land in the next week the way it would
 * under UTC.
 */
export async function weeksWithSets(limit: number): Promise<WeekSummary[]> {
  const rows = await prisma.$queryRaw<{ week: string; sets: bigint; players: bigint }[]>`
    SELECT week, count(*) / 2 AS sets, count(DISTINCT player) AS players
    FROM (
      SELECT
        to_char(date_trunc('week', "confirmedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${LADDER_TIME_ZONE}), 'YYYY-MM-DD') AS week,
        unnest(ARRAY["player1Id", "player2Id"]) AS player
      FROM "RatingMatch"
      WHERE status = 'CONFIRMED' AND "confirmedAt" IS NOT NULL
    ) AS sides
    GROUP BY week
    ORDER BY week DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({ id: row.week, sets: Number(row.sets), players: Number(row.players) }));
}
