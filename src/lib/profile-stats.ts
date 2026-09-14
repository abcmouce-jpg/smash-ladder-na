import { prisma } from "@/lib/db";
import { MatchStatus } from "@/generated/prisma/enums";

// A match where this player's own side queued isPracticing doesn't count
// toward their real record/usage — same convention as the private
// notPracticingFor in lib/players.ts, which isn't exported. The new profile
// views (character matchups, head-to-head opponents, season records) all
// need the identical "only your ranked side" filter, so it lives here once
// instead of being re-inlined per query.
function nonPracticingSideOf(userId: string) {
  return [
    { player1Id: userId, player1IsPracticing: false },
    { player2Id: userId, player2IsPracticing: false },
  ];
}

export interface CharacterMatchup {
  opponentCharacter: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number; // 0-100, rounded
}

export interface CharacterMatchups {
  character: string;
  games: number;
  wins: number;
  losses: number;
  matchups: CharacterMatchup[];
}

// Per-character opponent breakdown for the profile page's Characters tab.
// Mirrors getCharacterUsage's exact WHERE (decided games from confirmed,
// non-practicing matches where this player is one of the actors) and then
// slices each game by the opponent's character, so a row reads "when I play
// Fox, I go X–Y against their Sheik." Rows missing either side's character
// are skipped entirely — there's no opponent to bucket them under. Uses the
// raw DB character names (no echo grouping) so rows line up 1:1 with the
// usage list and CharacterIcon slugs. Sorted by games played descending.
export async function getCharacterMatchups(userId: string): Promise<CharacterMatchups[]> {
  const games = await prisma.matchGame.findMany({
    where: {
      winnerId: { not: null },
      match: { status: MatchStatus.CONFIRMED, OR: nonPracticingSideOf(userId) },
      OR: [{ actorAId: userId }, { actorBId: userId }],
    },
    select: { actorAId: true, actorACharacter: true, actorBId: true, actorBCharacter: true, winnerId: true },
  });

  const byCharacter = new Map<
    string,
    { games: number; wins: number; matchups: Map<string, { games: number; wins: number }> }
  >();
  for (const g of games) {
    const userIsA = g.actorAId === userId;
    const character = userIsA ? g.actorACharacter : g.actorBCharacter;
    const opponentCharacter = userIsA ? g.actorBCharacter : g.actorACharacter;
    if (!character || !opponentCharacter) continue;

    const entry = byCharacter.get(character) ?? {
      games: 0,
      wins: 0,
      matchups: new Map<string, { games: number; wins: number }>(),
    };
    entry.games++;
    if (g.winnerId === userId) entry.wins++;
    byCharacter.set(character, entry);

    const opponent = entry.matchups.get(opponentCharacter) ?? { games: 0, wins: 0 };
    opponent.games++;
    if (g.winnerId === userId) opponent.wins++;
    entry.matchups.set(opponentCharacter, opponent);
  }

  return [...byCharacter.entries()]
    .sort(([nameA, a], [nameB, b]) => b.games - a.games || nameA.localeCompare(nameB))
    .map(([character, { games: totalGames, wins: totalWins, matchups }]) => ({
      character,
      games: totalGames,
      wins: totalWins,
      losses: totalGames - totalWins,
      matchups: [...matchups.entries()]
        .sort(([nameA, a], [nameB, b]) => b.games - a.games || nameA.localeCompare(nameB))
        .map(([opponentCharacter, { games, wins }]) => ({
          opponentCharacter,
          games,
          wins,
          losses: games - wins,
          winRate: Math.round((wins / games) * 100),
        })),
    }));
}

export interface HeadToHeadOpponent {
  opponentId: string;
  username: string;
  avatarUrl: string | null;
  /** The opponent's current rating from their user row. */
  rating: number;
  games: number;
  wins: number;
  losses: number;
  winRate: number; // 0-100, rounded
}

// Every distinct opponent this player has faced in confirmed, non-practicing
// matches, aggregated into a head-to-head record — the data behind the
// profile page's Head 2 Head tab. Same WHERE as getTopRivals, capped to the
// most-played `limit` opponents so an extremely long career can't balloon the
// payload; sorted by games played descending.
export async function getHeadToHeadOpponents(userId: string, limit = 100): Promise<HeadToHeadOpponent[]> {
  const matches = await prisma.ratingMatch.findMany({
    where: { status: MatchStatus.CONFIRMED, OR: nonPracticingSideOf(userId) },
    select: { player1Id: true, player2Id: true, reportedWinnerId: true },
  });

  const record = new Map<string, { games: number; wins: number }>();
  for (const m of matches) {
    const opponentId = m.player1Id === userId ? m.player2Id : m.player1Id;
    const entry = record.get(opponentId) ?? { games: 0, wins: 0 };
    entry.games++;
    if (m.reportedWinnerId === userId) entry.wins++;
    record.set(opponentId, entry);
  }

  const topIds = [...record.entries()].sort(([, a], [, b]) => b.games - a.games || b.wins - a.wins).slice(0, limit);
  if (topIds.length === 0) return [];

  const opponents = await prisma.user.findMany({
    where: { id: { in: topIds.map(([id]) => id) } },
    select: { id: true, username: true, avatarUrl: true, rating: true },
  });
  const opponentById = new Map(opponents.map((o) => [o.id, o]));

  return topIds.map(([opponentId, { games, wins }]) => ({
    opponentId,
    username: opponentById.get(opponentId)?.username ?? "Unknown",
    avatarUrl: opponentById.get(opponentId)?.avatarUrl ?? null,
    rating: opponentById.get(opponentId)?.rating ?? 0,
    games,
    wins,
    losses: games - wins,
    winRate: Math.round((wins / games) * 100),
  }));
}

export interface PlayerSeasonRecord {
  seasonId: string;
  wins: number;
  losses: number;
}

// The player's W-L record per season, from confirmed non-practicing matches
// that carry a seasonId — grouped in JS rather than SQL since the season
// tab also needs the standings rows and season list anyway. Empty when the
// player has never played a ranked set in any season.
export async function getPlayerSeasonRecords(userId: string): Promise<PlayerSeasonRecord[]> {
  const matches = await prisma.ratingMatch.findMany({
    where: {
      status: MatchStatus.CONFIRMED,
      seasonId: { not: null },
      OR: nonPracticingSideOf(userId),
    },
    select: { seasonId: true, reportedWinnerId: true },
  });

  const bySeason = new Map<string, { wins: number; losses: number }>();
  for (const m of matches) {
    if (!m.seasonId) continue;
    const entry = bySeason.get(m.seasonId) ?? { wins: 0, losses: 0 };
    if (m.reportedWinnerId === userId) entry.wins++;
    else entry.losses++;
    bySeason.set(m.seasonId, entry);
  }

  return [...bySeason.entries()].map(([seasonId, record]) => ({ seasonId, ...record }));
}
