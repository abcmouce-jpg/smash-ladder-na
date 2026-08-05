import { prisma } from "@/lib/db";
import { MatchStatus } from "@/generated/prisma/enums";
import { getLiveTwitchUsernames } from "@/lib/twitch-helix";

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

export type MatchFeedEntry = Awaited<ReturnType<typeof getMatchFeed>>[number];

// Public-safe feed of in-progress and recently-finished sets — no room
// codes or arena passwords (see roomCode's own "never rendered outside the
// paired pair's own view" comment in schema.prisma), just what's already
// shown on public profiles/leaderboard. Sets with a currently-live streamer
// on either side are sorted to the top so viewers can jump straight to a
// stream; order within each group stays newest-first via Array#sort's
// stability, since the query itself is already ordered that way.
export async function getMatchFeed() {
  const since = new Date(Date.now() - RECENT_FINISHED_WINDOW_MS);

  const matches = await prisma.ratingMatch.findMany({
    where: {
      OR: [
        { status: { in: [MatchStatus.PENDING_REPORT, MatchStatus.REPORTED, MatchStatus.DISPUTED] } },
        {
          status: { in: [MatchStatus.CONFIRMED, MatchStatus.CANCELLED, MatchStatus.EXPIRED] },
          createdAt: { gte: since },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: FEED_LIMIT,
    select: {
      id: true,
      status: true,
      createdAt: true,
      confirmedAt: true,
      reportedWinnerId: true,
      player1: { select: feedPlayerSelect },
      player2: { select: feedPlayerSelect },
      games: { select: { winnerId: true } },
    },
  });

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

    const player1Live = !!match.player1.twitchUsername && liveUsernames.has(match.player1.twitchUsername.toLowerCase());
    const player2Live = !!match.player2.twitchUsername && liveUsernames.has(match.player2.twitchUsername.toLowerCase());

    return { ...match, wins, player1Live, player2Live, hasLiveStreamer: player1Live || player2Live };
  });

  entries.sort((a, b) => Number(b.hasLiveStreamer) - Number(a.hasLiveStreamer));

  return entries;
}
