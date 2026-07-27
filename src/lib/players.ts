import { prisma } from "@/lib/db";
import { MatchStatus } from "@/generated/prisma/enums";

export async function getPlayerProfile(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      rating: true,
      gamesPlayed: true,
      createdAt: true,
      region: true,
      wiredConnection: true,
      mainCharacter: true,
      startggSlug: true,
      startggGamerTag: true,
      noShowCount: true,
      cancelCount: true,
      status: true,
      lastKnownIp: true, // only ever rendered in the mod-only section of the profile page
      _count: { select: { connectionReportsReceived: true } },
    },
  });
}

export async function getPlayerMatchHistory(userId: string, limit = 20) {
  const matches = await prisma.ratingMatch.findMany({
    where: {
      status: MatchStatus.CONFIRMED,
      OR: [{ player1Id: userId }, { player2Id: userId }],
    },
    orderBy: { confirmedAt: "desc" },
    take: limit,
    include: {
      player1: { select: { id: true, username: true } },
      player2: { select: { id: true, username: true } },
    },
  });

  // Batched rather than per-match, since this list can be up to `limit` long.
  const games = await prisma.matchGame.findMany({
    where: { matchId: { in: matches.map((m) => m.id) }, winnerId: { not: null } },
    orderBy: { gameNumber: "asc" },
    select: { matchId: true, actorAId: true, actorACharacter: true, actorBId: true, actorBCharacter: true, winnerId: true },
  });
  const gamesByMatch = new Map<string, typeof games>();
  for (const g of games) {
    const list = gamesByMatch.get(g.matchId);
    if (list) list.push(g);
    else gamesByMatch.set(g.matchId, [g]);
  }

  return matches.map((match) => {
    const isPlayer1 = match.player1Id === userId;
    const opponent = isPlayer1 ? match.player2 : match.player1;
    const ratingBefore = isPlayer1 ? match.player1RatingBefore : match.player2RatingBefore;
    const ratingAfter = isPlayer1 ? match.player1RatingAfter : match.player2RatingAfter;
    const won = match.reportedWinnerId === userId;

    const matchGames = gamesByMatch.get(match.id) ?? [];
    let gamesWon = 0;
    let gamesLost = 0;
    const characters: string[] = [];
    for (const g of matchGames) {
      if (g.winnerId === userId) gamesWon++;
      else gamesLost++;
      const character = g.actorAId === userId ? g.actorACharacter : g.actorBCharacter;
      if (character && !characters.includes(character)) characters.push(character);
    }

    return {
      id: match.id,
      opponent,
      won,
      ratingBefore,
      ratingAfter,
      delta: (ratingAfter ?? 0) - (ratingBefore ?? 0),
      confirmedAt: match.confirmedAt,
      score: { wins: gamesWon, losses: gamesLost },
      characters,
    };
  });
}

// Collapses same-(UTC calendar day) points into one, keeping the rating
// from the last match of that day — so a chart point represents "rating
// after that day's session" rather than every individual game. Points must
// already be in ascending date order.
export function condenseByDay<T extends { date: Date; rating: number }>(points: T[]): T[] {
  const result: T[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    const sameDay = last && last.date.toISOString().slice(0, 10) === point.date.toISOString().slice(0, 10);
    if (sameDay) {
      result[result.length - 1] = point;
    } else {
      result.push(point);
    }
  }
  return result;
}

export async function getRatingChartPoints(userId: string, limit = 50) {
  const rows = await prisma.ratingHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { ratingAfter: true, createdAt: true },
  });
  const points = rows.reverse().map((r) => ({ date: r.createdAt, rating: r.ratingAfter }));
  return condenseByDay(points);
}

// Current streak: how many of the most recent confirmed matches in a row
// share the same result. Positive = win streak, negative = loss streak.
export function currentStreak(history: { won: boolean }[]) {
  if (history.length === 0) return 0;
  const leadingResult = history[0].won;
  let count = 0;
  for (const m of history) {
    if (m.won !== leadingResult) break;
    count++;
  }
  return leadingResult ? count : -count;
}

// Deliberately NOT reset by endActiveSeasonAndStartNext — only rating and
// gamesPlayed reset there. These read from history that survives forever,
// so a player has something that keeps growing across season resets.
export async function getCareerStats(userId: string) {
  const [wins, losses, peakRating, seasons, tournaments] = await Promise.all([
    prisma.ratingMatch.count({
      where: { status: MatchStatus.CONFIRMED, reportedWinnerId: userId },
    }),
    prisma.ratingMatch.count({
      where: {
        status: MatchStatus.CONFIRMED,
        OR: [{ player1Id: userId }, { player2Id: userId }],
        NOT: { reportedWinnerId: userId },
      },
    }),
    prisma.ratingHistory.aggregate({ where: { userId }, _max: { ratingAfter: true } }),
    prisma.ratingMatch.findMany({
      where: {
        status: MatchStatus.CONFIRMED,
        OR: [{ player1Id: userId }, { player2Id: userId }],
        seasonId: { not: null },
      },
      select: { seasonId: true },
      distinct: ["seasonId"],
    }),
    prisma.tournamentEntry.count({ where: { userId } }),
  ]);

  return {
    totalWins: wins,
    totalLosses: losses,
    peakRating: peakRating._max.ratingAfter,
    seasonsPlayed: seasons.length,
    tournamentsEntered: tournaments,
  };
}

// Top opponents by games played against them, with the head-to-head record.
export async function getTopRivals(userId: string, limit = 3) {
  const matches = await prisma.ratingMatch.findMany({
    where: { status: MatchStatus.CONFIRMED, OR: [{ player1Id: userId }, { player2Id: userId }] },
    select: { player1Id: true, player2Id: true, reportedWinnerId: true },
  });

  const record = new Map<string, { wins: number; losses: number }>();
  for (const m of matches) {
    const opponentId = m.player1Id === userId ? m.player2Id : m.player1Id;
    const entry = record.get(opponentId) ?? { wins: 0, losses: 0 };
    if (m.reportedWinnerId === userId) entry.wins++;
    else entry.losses++;
    record.set(opponentId, entry);
  }

  const topIds = [...record.entries()]
    .sort(([, a], [, b]) => b.wins + b.losses - (a.wins + a.losses))
    .slice(0, limit);
  if (topIds.length === 0) return [];

  const opponents = await prisma.user.findMany({
    where: { id: { in: topIds.map(([id]) => id) } },
    select: { id: true, username: true },
  });
  const usernameById = new Map(opponents.map((o) => [o.id, o.username]));

  return topIds.map(([id, rec]) => ({
    opponentId: id,
    username: usernameById.get(id) ?? "Unknown",
    ...rec,
  }));
}

export interface CharacterUsage {
  character: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number; // 0-100, rounded
  usagePercent: number; // 0-100, rounded, share of this player's qualifying games
}

// Per-character breakdown for the profile page's "Character Usage" card.
// Only counts games from confirmed matches with a recorded winner — same
// filter tallySetWins in match-games.ts uses to skip disputed/void games.
// Ordered by games played (usage) descending, ties broken alphabetically.
export async function getCharacterUsage(userId: string): Promise<CharacterUsage[]> {
  const games = await prisma.matchGame.findMany({
    where: {
      winnerId: { not: null },
      match: { status: MatchStatus.CONFIRMED },
      OR: [{ actorAId: userId }, { actorBId: userId }],
    },
    select: { actorAId: true, actorACharacter: true, actorBId: true, actorBCharacter: true, winnerId: true },
  });

  const stats = new Map<string, { games: number; wins: number }>();
  for (const g of games) {
    const character = g.actorAId === userId ? g.actorACharacter : g.actorBCharacter;
    if (!character) continue;
    const entry = stats.get(character) ?? { games: 0, wins: 0 };
    entry.games++;
    if (g.winnerId === userId) entry.wins++;
    stats.set(character, entry);
  }

  const totalGames = [...stats.values()].reduce((sum, s) => sum + s.games, 0);

  return [...stats.entries()]
    .sort(([nameA, a], [nameB, b]) => b.games - a.games || nameA.localeCompare(nameB))
    .map(([character, { games, wins }]) => ({
      character,
      games,
      wins,
      losses: games - wins,
      winRate: Math.round((wins / games) * 100),
      usagePercent: Math.round((games / totalGames) * 100),
    }));
}

// For the lobby's "who am I about to play" scouting line.
export async function getTopCharacters(userId: string, limit = 3) {
  const usage = await getCharacterUsage(userId);
  return usage.slice(0, limit).map((u) => u.character);
}
