import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { MatchStatus } from "@/generated/prisma/enums";
import { liftExpiredSuspension } from "@/lib/account";
import { getActiveSeason } from "@/lib/seasons";
import { startOfDayInTimeZone } from "@/lib/timezone";

export async function getPlayerProfile(userId: string) {
  const player = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      discordUsername: true,
      avatarUrl: true,
      role: true,
      isSupporter: true,
      rating: true,
      gamesPlayed: true,
      practiceRating: true,
      practiceGamesPlayed: true,
      createdAt: true,
      region: true,
      wiredConnection: true,
      mainCharacter: true,
      secondaryCharacters: true,
      zenMode: true,
      startggSlug: true,
      startggPlayerId: true,
      startggGamerTag: true,
      twitchUsername: true,
      noShowCount: true,
      cancelCount: true,
      status: true,
      suspendedUntil: true,
      lastKnownIp: true, // only ever rendered in the mod-only section of the profile page
      _count: { select: { connectionReportsReceived: true } },
    },
  });
  if (!player) return player;

  // Without this, a suspension that's already expired keeps showing as
  // "suspended" on the profile (and to the mod tools below it) until the
  // suspended player themselves happens to hit requireActiveUser — which
  // never happens if they only play ranked. Lift it here too so the status
  // mods see is always current.
  const status = await liftExpiredSuspension(userId, player);
  return { ...player, status };
}

// Lightweight existence check for the profile page's "currently playing"
// badge — deliberately not reusing getUnresolvedMatchForUser (matches.ts),
// which pulls the full match (players, room code, etc.) for actually
// driving the live-match UI; this only ever needs a yes/no. REPORTED is
// legacy (nothing writes it anymore) but old rows can still carry it, same
// as everywhere else that checks match status.
export async function isCurrentlyInMatch(userId: string) {
  const match = await prisma.ratingMatch.findFirst({
    where: {
      OR: [{ player1Id: userId }, { player2Id: userId }],
      status: { in: [MatchStatus.PENDING_REPORT, MatchStatus.REPORTED] },
    },
    select: { id: true },
  });
  return match !== null;
}

// Full active-match snapshot for the profile page's "currently in a match"
// card (opponent + games). Deliberately a pure read — no autoResolveStale*
// side effects like getMatchGames in the lobby — since profile pages get
// viewed by people who aren't in the session, so they shouldn't advance the
// match. Same PENDING_REPORT/REPORTED filter as isCurrentlyInMatch.
export async function getCurrentMatchForUser(userId: string) {
  return prisma.ratingMatch.findFirst({
    where: {
      OR: [{ player1Id: userId }, { player2Id: userId }],
      status: { in: [MatchStatus.PENDING_REPORT, MatchStatus.REPORTED] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      player1Id: true,
      player2Id: true,
      player1: { select: { id: true, username: true, avatarUrl: true, rating: true } },
      player2: { select: { id: true, username: true, avatarUrl: true, rating: true } },
      games: {
        orderBy: { gameNumber: "asc" },
        select: {
          gameNumber: true,
          actorAId: true,
          actorBId: true,
          actorACharacter: true,
          actorBCharacter: true,
          winnerId: true,
          reportedWinnerId: true,
          secondReportWinnerId: true,
        },
      },
    },
  });
}

function matchHistoryWhere(userId: string) {
  return {
    status: MatchStatus.CONFIRMED,
    OR: [{ player1Id: userId }, { player2Id: userId }],
  };
}

// Paired with getPlayerMatchHistory below for pagination — same where
// clause (every confirmed match involving this player, practice included),
// kept as a separate query rather than folded into that function's return
// shape so the many callers that just want a plain array (lobby's streak
// badge, the stream overlay's recent-matches panel) don't all need to
// change to destructure a {entries, totalCount} object just because the
// player profile page's "Recent matches" section needs a page count.
export async function getPlayerMatchCount(userId: string) {
  return prisma.ratingMatch.count({ where: matchHistoryWhere(userId) });
}

// One game within a history entry — the per-game detail behind the profile
// page's match-details modal. Games with no decided winner (disputed or
// admin-reset) are included with won: null so the modal reflects the full
// set, but they're ignored by the score/characters summary above.
export interface MatchHistoryGame {
  gameNumber: number;
  /** The querying player's character this game, if one was locked in. */
  character: string | null;
  /** The opponent's character this game, if one was locked in. */
  opponentCharacter: string | null;
  /** The stage the game was played on, once picked. */
  stage: string | null;
  /** Whether the querying player won. null = no decided winner. */
  won: boolean | null;
}

export interface MatchHistoryEntryData {
  id: string;
  opponent: { id: string; username: string };
  won: boolean;
  isPracticing: boolean;
  ratingBefore: number | null;
  ratingAfter: number | null;
  delta: number;
  confirmedAt: Date | null;
  score: { wins: number; losses: number };
  characters: string[];
  opponentCharacters: string[];
  games: MatchHistoryGame[];
}

export async function getPlayerMatchHistory(
  userId: string,
  { limit = 20, skip = 0 }: { limit?: number; skip?: number } = {},
): Promise<MatchHistoryEntryData[]> {
  const matches = await prisma.ratingMatch.findMany({
    where: matchHistoryWhere(userId),
    orderBy: { confirmedAt: "desc" },
    take: limit,
    skip,
    include: {
      player1: { select: { id: true, username: true } },
      player2: { select: { id: true, username: true } },
    },
  });

  // Batched rather than per-match, since this list can be up to `limit`
  // long. Every game is fetched — decided ones drive the score/characters
  // summary, and the rest still appear (as undecided) in the per-game
  // details the modal shows.
  const games = await prisma.matchGame.findMany({
    where: { matchId: { in: matches.map((m) => m.id) } },
    orderBy: { gameNumber: "asc" },
    select: {
      matchId: true,
      gameNumber: true,
      actorAId: true,
      actorACharacter: true,
      actorBId: true,
      actorBCharacter: true,
      finalStage: true,
      winnerId: true,
    },
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
    // Shown in the list so a practice win/loss reads as what it is instead
    // of silently vanishing or blending into the real record — the
    // ratingBefore/After above are still real numbers (practiceRating's,
    // not rating's, when this is true), just not ones that ever touched
    // this player's actual rating. Callers must exclude isPracticing
    // entries from any win/loss tally or streak themselves; this function
    // no longer does it for them (see notPracticingFor's callers elsewhere
    // in this file for the "never touches your main profile" filter).
    const isPracticing = isPlayer1 ? match.player1IsPracticing : match.player2IsPracticing;

    const matchGames = gamesByMatch.get(match.id) ?? [];
    let gamesWon = 0;
    let gamesLost = 0;
    const characters: string[] = [];
    const opponentCharacters: string[] = [];
    const games: MatchHistoryGame[] = [];
    for (const g of matchGames) {
      const character = g.actorAId === userId ? g.actorACharacter : g.actorBCharacter;
      const opponentCharacter = g.actorAId === userId ? g.actorBCharacter : g.actorACharacter;
      // Games with no decided winner (disputed/void) don't count toward the
      // score or the aggregated character list — same rule the score test
      // enforces — but they're still listed in the per-game details so a
      // closed-out set's modal shows the full picture.
      if (g.winnerId !== null) {
        if (g.winnerId === userId) gamesWon++;
        else gamesLost++;
        if (character && !characters.includes(character)) characters.push(character);
        if (opponentCharacter && !opponentCharacters.includes(opponentCharacter)) {
          opponentCharacters.push(opponentCharacter);
        }
      }
      games.push({
        gameNumber: g.gameNumber,
        character,
        opponentCharacter,
        stage: g.finalStage,
        won: g.winnerId === null ? null : g.winnerId === userId,
      });
    }

    return {
      id: match.id,
      opponent,
      won,
      isPracticing,
      ratingBefore,
      ratingAfter,
      delta: (ratingAfter ?? 0) - (ratingBefore ?? 0),
      confirmedAt: match.confirmedAt,
      score: { wins: gamesWon, losses: gamesLost },
      characters,
      opponentCharacters,
      games,
    };
  });
}

// Returns the most recent rating snapshots, raw — one per match, ascending.
// The client condenses these into one point per *viewer-local* calendar day:
// the server doesn't know the viewer's timezone, and UTC day boundaries can
// merge matches that fall on different local days (e.g. 10pm and midnight in
// a timezone behind UTC).
export async function getRatingChartPoints(userId: string, limit = 50) {
  const rows = await prisma.ratingHistory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { ratingAfter: true, createdAt: true },
  });
  return rows.reverse().map((r) => ({ date: r.createdAt, rating: r.ratingAfter }));
}

// Current streak: how many of the most recent confirmed matches in a row
// share the same result. Positive = win streak, negative = loss streak.
// Practice matches are invisible here too — skipped rather than counted or
// treated as breaking the streak, since they say nothing about competitive
// performance either way.
export function currentStreak(history: { won: boolean; isPracticing?: boolean }[]) {
  const real = history.filter((m) => !m.isPracticing);
  if (real.length === 0) return 0;
  const leadingResult = real[0].won;
  let count = 0;
  for (const m of real) {
    if (m.won !== leadingResult) break;
    count++;
  }
  return leadingResult ? count : -count;
}

// Same semantics as currentStreak, but computed in the database so a long
// run isn't silently truncated by whichever `limit` a caller passed to
// getPlayerMatchHistory (the profile page's default 20 used to cap the
// streak badge at 20). Peeks backwards through history in batches until
// the streak breaks or the player's whole history is exhausted, so an
// undefeated player reports their true, possibly unbounded streak.
export async function getCurrentStreak(userId: string) {
  const BATCH_SIZE = 50;
  let leadingResult: boolean | null = null;
  let count = 0;
  let skip = 0;
  while (true) {
    const matches = await prisma.ratingMatch.findMany({
      where: matchHistoryWhere(userId),
      orderBy: { confirmedAt: "desc" },
      take: BATCH_SIZE,
      skip,
      select: {
        player1Id: true,
        player2Id: true,
        player1IsPracticing: true,
        player2IsPracticing: true,
        reportedWinnerId: true,
      },
    });
    if (matches.length === 0) break;
    for (const m of matches) {
      const isPracticing = m.player1Id === userId ? m.player1IsPracticing : m.player2IsPracticing;
      if (isPracticing) continue;
      const won = m.reportedWinnerId === userId;
      if (leadingResult === null) {
        leadingResult = won;
        count = 1;
      } else if (won !== leadingResult) {
        return leadingResult ? count : -count;
      } else {
        count++;
      }
    }
    if (matches.length < BATCH_SIZE) break;
    skip += BATCH_SIZE;
  }
  if (leadingResult === null) return 0;
  return leadingResult ? count : -count;
}

// A match where this player's own side queued isPracticing doesn't count
// toward their real win/loss record or character usage — same "never
// touches your main profile" promise the separate practiceRating makes for
// the rating number itself. Matches the two ways of being in a match
// (player1 or player2), checking only the querying side's own flag.
function notPracticingFor(userId: string) {
  return [
    { player1Id: userId, player1IsPracticing: false },
    { player2Id: userId, player2IsPracticing: false },
  ];
}

// Today's win/loss record — used by the stream overlay so viewers see
// how the player is doing for that session, not their career totals.
export async function getDailyStats(userId: string) {
  const todayStart = startOfDayInTimeZone(new Date());

  const [wins, losses] = await Promise.all([
    prisma.ratingMatch.count({
      where: {
        status: MatchStatus.CONFIRMED,
        reportedWinnerId: userId,
        confirmedAt: { gte: todayStart },
        OR: notPracticingFor(userId),
      },
    }),
    prisma.ratingMatch.count({
      where: {
        status: MatchStatus.CONFIRMED,
        confirmedAt: { gte: todayStart },
        OR: notPracticingFor(userId),
        NOT: { reportedWinnerId: userId },
      },
    }),
  ]);

  return { totalWins: wins, totalLosses: losses };
}

// Deliberately NOT reset by endActiveSeasonAndStartNext — only rating and
// gamesPlayed reset there. These read from history that survives everywhere,
// so a player has something that keeps growing across season resets.
export async function getCareerStats(userId: string) {
  const [wins, losses, peakRating, seasons, tournaments, resultsInOrder] = await Promise.all([
    prisma.ratingMatch.count({
      where: { status: MatchStatus.CONFIRMED, reportedWinnerId: userId, OR: notPracticingFor(userId) },
    }),
    prisma.ratingMatch.count({
      where: {
        status: MatchStatus.CONFIRMED,
        OR: notPracticingFor(userId),
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
    // Full history, oldest first, purely to walk it once for the longest
    // win streak ever hit — unlike currentStreak (rank-tier.ts/players.ts
    // history helper), which only looks at the most recent N matches and
    // resets across seasons in spirit, this is a lifetime best and needs
    // every confirmed match in order.
    prisma.ratingMatch.findMany({
      where: { status: MatchStatus.CONFIRMED, reportedWinnerId: { not: null }, OR: notPracticingFor(userId) },
      orderBy: { confirmedAt: "asc" },
      select: { reportedWinnerId: true },
    }),
  ]);

  let bestWinStreak = 0;
  let running = 0;
  for (const m of resultsInOrder) {
    if (m.reportedWinnerId === userId) {
      running++;
      bestWinStreak = Math.max(bestWinStreak, running);
    } else {
      running = 0;
    }
  }

  return {
    totalWins: wins,
    totalLosses: losses,
    peakRating: peakRating._max.ratingAfter,
    seasonsPlayed: seasons.length,
    tournamentsEntered: tournaments,
    bestWinStreak,
  };
}

// The active season's record/peak/streak for the season card on the profile
// — same shape as getCareerStats but scoped to the current season's matches,
// so these reset along with rating/gamesPlayed at season rollover. Returns
// null if no season is active (nothing to scope the stats to).
export async function getSeasonStats(userId: string) {
  const activeSeason = await getActiveSeason();
  if (!activeSeason) return null;

  const [wins, losses, peakRating, resultsInOrder] = await Promise.all([
    prisma.ratingMatch.count({
      where: {
        status: MatchStatus.CONFIRMED,
        seasonId: activeSeason.id,
        reportedWinnerId: userId,
        OR: notPracticingFor(userId),
      },
    }),
    prisma.ratingMatch.count({
      where: {
        status: MatchStatus.CONFIRMED,
        seasonId: activeSeason.id,
        OR: notPracticingFor(userId),
        NOT: { reportedWinnerId: userId },
      },
    }),
    // Highest rating reached this season — RatingHistory has no seasonId, so
    // scope it through the match the entry belongs to. A player with no
    // matches yet this season has no rows, hence the null/"—" fallback.
    prisma.ratingHistory.aggregate({
      where: { userId, match: { seasonId: activeSeason.id } },
      _max: { ratingAfter: true },
    }),
    prisma.ratingMatch.findMany({
      where: {
        status: MatchStatus.CONFIRMED,
        seasonId: activeSeason.id,
        reportedWinnerId: { not: null },
        OR: notPracticingFor(userId),
      },
      orderBy: { confirmedAt: "asc" },
      select: { reportedWinnerId: true },
    }),
  ]);

  let bestWinStreak = 0;
  let running = 0;
  for (const m of resultsInOrder) {
    if (m.reportedWinnerId === userId) {
      running++;
      bestWinStreak = Math.max(bestWinStreak, running);
    } else {
      running = 0;
    }
  }

  return {
    seasonName: activeSeason.name,
    totalWins: wins,
    totalLosses: losses,
    peakRating: peakRating._max.ratingAfter,
    bestWinStreak,
  };
}

// Top opponents by games played against them, with the head-to-head record.
export async function getTopRivals(userId: string, limit = 3) {
  const matches = await prisma.ratingMatch.findMany({
    where: { status: MatchStatus.CONFIRMED, OR: notPracticingFor(userId) },
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

export interface HeadToHead {
  wins: number;
  losses: number;
}

// The viewer's own record against one specific opponent — narrower than
// getTopRivals above (which ranks all of the profile owner's opponents),
// for the "your record vs this person" line shown to a signed-in viewer on
// someone else's profile. Only the viewer's own practicing flag is checked,
// same convention as notPracticingFor's other callers.
export async function getHeadToHead(viewerId: string, opponentId: string): Promise<HeadToHead | null> {
  const matches = await prisma.ratingMatch.findMany({
    where: {
      status: MatchStatus.CONFIRMED,
      AND: [
        { OR: notPracticingFor(viewerId) },
        {
          OR: [
            { player1Id: viewerId, player2Id: opponentId },
            { player1Id: opponentId, player2Id: viewerId },
          ],
        },
      ],
    },
    select: { reportedWinnerId: true },
  });
  if (matches.length === 0) return null;

  const wins = matches.filter((m) => m.reportedWinnerId === viewerId).length;
  return { wins, losses: matches.length - wins };
}

export interface CharacterUsage {
  character: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number; // 0-100, rounded
  usagePercent: number; // 0-100, rounded, share of this player's qualifying games
}

// Per-character breakdown for the profile page's "Character Usage" card —
// also the source of truth recomputeCharacterUsage (character-stats.ts)
// derives mainCharacter/secondaryCharacters from. Only counts games from
// confirmed matches with a recorded winner — same filter tallySetWins in
// match-games.ts uses to skip disputed/void games. Ordered by games played
// (usage) descending, ties broken alphabetically. Accepts a transaction
// client so a recompute right after a match's own confirmation (still
// in-flight in the same tx) sees that match's games too.
export async function getCharacterUsage(
  userId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<CharacterUsage[]> {
  const games = await client.matchGame.findMany({
    where: {
      winnerId: { not: null },
      match: { status: MatchStatus.CONFIRMED, OR: notPracticingFor(userId) },
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
