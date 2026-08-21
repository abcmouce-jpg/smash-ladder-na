import { prisma } from "@/lib/db";
import { MatchStatus } from "@/generated/prisma/enums";
import { getLiveTwitchUsernames } from "@/lib/twitch-helix";
import { getMatchesTodayCount } from "@/lib/public-stats";

// "Recent" here means the public feed's finished-match tail, not the mod
// live-matches page's week-long "did anyone miss reporting this" window
// (see RECENTLY_EXPIRED_WINDOW_MS in lib/disputes.ts) — this is meant to
// read like a live activity ticker, not a history browser.
const RECENT_FINISHED_WINDOW_MS = 3 * 60 * 60 * 1000;
const FEED_LIMIT = 40;

const feedPlayerSelect = {
  id: true,
  username: true,
  avatarUrl: true,
  rating: true,
  gamesPlayed: true,
  mainCharacter: true,
  twitchUsername: true,
  twitchDisplayName: true,
  region: true,
} as const;

const matchFeedSelect = {
  id: true,
  status: true,
  createdAt: true,
  confirmedAt: true,
  reportedWinnerId: true,
  player1: { select: feedPlayerSelect },
  player2: { select: feedPlayerSelect },
  games: {
    select: {
      gameNumber: true,
      winnerId: true,
      actorAId: true,
      actorACharacter: true,
      actorBId: true,
      actorBCharacter: true,
    },
  },
} as const;

export type MatchFeedEntry = Awaited<ReturnType<typeof getMatchFeed>>[number];

// Character shown next to a player's name on the feed: the one they're
// playing (or last played) in THIS set, taken from the newest game with a
// locked pick — not the all-time mainCharacter on their profile. Falls back
// to the profile main only while game 1's blind picks are still pending and
// no character has been recorded yet.
function characterForPlayer(
  games: {
    gameNumber: number;
    actorAId: string;
    actorACharacter: string | null;
    actorBId: string;
    actorBCharacter: string | null;
  }[],
  playerId: string,
  fallback: string | null,
) {
  const newestFirst = [...games].sort((a, b) => b.gameNumber - a.gameNumber);
  for (const game of newestFirst) {
    const character =
      game.actorAId === playerId ? game.actorACharacter : game.actorBId === playerId ? game.actorBCharacter : null;
    if (character) return character;
  }
  return fallback;
}

// Public-safe feed of in-progress and recently-finished sets — no room
// codes or arena passwords (see roomCode's own "never rendered outside the
// paired pair's own view" comment in schema.prisma), just what's already
// shown on public profiles/leaderboard. Sets with a currently-live streamer
// on either side are sorted to the top so viewers can jump straight to a
// stream; order within each group stays newest-first via Array#sort's
// stability, since the query itself is already ordered that way.
export async function getMatchFeed() {
  const since = new Date(Date.now() - RECENT_FINISHED_WINDOW_MS);

  // In-progress matches are fetched with no LIMIT, separately from finished
  // ones, and always kept in full — a single combined query with one flat
  // `take: FEED_LIMIT` (sorted by createdAt across every status) let a burst
  // of newly-finished matches push an older still-in-progress match (with a
  // live stream on it) out of the top 40 entirely, even though it was the
  // one thing actually worth surfacing (#129). In-progress sets don't pile
  // up the way finished ones do — every one auto-resolves within a bounded
  // window — so this is never unbounded in practice.
  const [inProgressMatches, finishedMatches] = await Promise.all([
    prisma.ratingMatch.findMany({
      where: { status: { in: [MatchStatus.PENDING_REPORT, MatchStatus.REPORTED, MatchStatus.DISPUTED] } },
      orderBy: { createdAt: "desc" },
      select: matchFeedSelect,
    }),
    prisma.ratingMatch.findMany({
      where: {
        status: { in: [MatchStatus.CONFIRMED, MatchStatus.CANCELLED, MatchStatus.EXPIRED] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: Math.max(0, FEED_LIMIT - 1), // -1: worst case leaves room for at least one in-progress match
      select: matchFeedSelect,
    }),
  ]);
  const matches = [...inProgressMatches, ...finishedMatches];

  const twitchUsernames = matches.flatMap((m) =>
    [m.player1.twitchUsername, m.player2.twitchUsername].filter((u): u is string => !!u),
  );
  const liveUsernames = await getLiveTwitchUsernames(twitchUsernames);

  const entries = matches.map((match) => {
    const wins = { player1: 0, player2: 0 };
    for (const game of match.games) {
      if (game.winnerId === match.player1.id) wins.player1++;
      else if (game.winnerId === match.player2.id) wins.player2++;
    }

    // "Live" only means something for a set still actually being played —
    // a player streaming (this match or something else entirely) after
    // their set already went Final/Cancelled/Disputed/Expired isn't a
    // stream of THIS set, so pinning it to the top and badging it live
    // would just send viewers to a stream with nothing left to watch.
    const isInProgress = match.status === MatchStatus.PENDING_REPORT || match.status === MatchStatus.REPORTED;
    const player1Live =
      isInProgress && !!match.player1.twitchUsername && liveUsernames.has(match.player1.twitchUsername.toLowerCase());
    const player2Live =
      isInProgress && !!match.player2.twitchUsername && liveUsernames.has(match.player2.twitchUsername.toLowerCase());

    return {
      ...match,
      player1: {
        ...match.player1,
        currentCharacter: characterForPlayer(match.games, match.player1.id, match.player1.mainCharacter),
      },
      player2: {
        ...match.player2,
        currentCharacter: characterForPlayer(match.games, match.player2.id, match.player2.mainCharacter),
      },
      wins,
      player1Live,
      player2Live,
      hasLiveStreamer: player1Live || player2Live,
    };
  });

  entries.sort((a, b) => Number(b.hasLiveStreamer) - Number(a.hasLiveStreamer));

  return entries;
}

// Feed-header stats. "In progress" mirrors the feed's own notion of a
// current (non-terminal) set; matchesToday is the same shared definition
// getMatchesTodayCount uses everywhere else it's shown.
export async function getMatchFeedStats() {
  const [inProgress, matchesToday] = await Promise.all([
    prisma.ratingMatch.count({
      where: { status: { in: [MatchStatus.PENDING_REPORT, MatchStatus.REPORTED, MatchStatus.DISPUTED] } },
    }),
    getMatchesTodayCount(),
  ]);
  return { inProgress, matchesToday };
}
