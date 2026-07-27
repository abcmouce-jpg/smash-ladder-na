import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getRankTier, LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { getCareerStats, getPlayerMatchHistory } from "@/lib/players";
import { MatchStatus } from "@/generated/prisma/enums";
import { RankBadge } from "@/components/rank-badge";
import { CharacterIcon } from "@/components/character-icon";
import { StreamRefreshPoller } from "@/components/stream-refresh-poller";

// Broadcast overlay meant to be captured directly by OBS as a Browser Source
// (see layout.tsx's isStreamOverlay branch for the chrome-less,
// transparent-background shell this renders inside).
//
// URL: /stream/overlay/{id}
// The {id} is the ladder user's ID (same as /players/{id}).

export default async function StreamOverlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      rating: true,
      gamesPlayed: true,
      region: true,
    },
  });

  if (!user) {
    notFound();
  }

  // Leaderboard rank and total player count
  const totalPlayers = await prisma.user.count({
    where: { gamesPlayed: { gte: LEADERBOARD_MIN_GAMES } },
  });
  const rank = user.gamesPlayed >= LEADERBOARD_MIN_GAMES && totalPlayers > 0
    ? (await prisma.user.count({
        where: { gamesPlayed: { gte: LEADERBOARD_MIN_GAMES }, rating: { gt: user.rating } },
      })) + 1
    : null;

  const [recentMatches, currentMatch, stats] = await Promise.all([
    getPlayerMatchHistory(user.id, 5),
    prisma.ratingMatch.findFirst({
      where: {
        OR: [{ player1Id: user.id }, { player2Id: user.id }],
        status: { in: [MatchStatus.PENDING_REPORT, MatchStatus.REPORTED] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        player1: { select: { id: true, username: true } },
        player2: { select: { id: true, username: true } },
      },
    }),
    getCareerStats(user.id),
  ]);

  const currentMatchGames = currentMatch
    ? await prisma.matchGame.findMany({
        where: { matchId: currentMatch.id },
        orderBy: { gameNumber: "asc" },
        select: {
          gameNumber: true,
          winnerId: true,
          actorACharacter: true,
          actorBCharacter: true,
        },
      })
    : [];

  // Determine characters used by each player in the current match
  const isUserPlayer1 = currentMatch?.player1.id === user.id;
  const userCharacters = currentMatchGames
    .map((g) => (isUserPlayer1 ? g.actorACharacter : g.actorBCharacter))
    .filter((c): c is string => !!c);
  const opponentCharacters = currentMatchGames
    .map((g) => (isUserPlayer1 ? g.actorBCharacter : g.actorACharacter))
    .filter((c): c is string => !!c);
  const uniqueUserChars = [...new Set(userCharacters)];
  const uniqueOpponentChars = [...new Set(opponentCharacters)];

  // Count games won by each player
  const userWins = currentMatchGames.filter((g) => g.winnerId === user.id).length;
  const opponentWins = currentMatchGames.filter(
    (g) => g.winnerId && g.winnerId !== user.id,
  ).length;
  const totalCompletedGames = userWins + opponentWins;

  const tier = getRankTier(user.rating, user.gamesPlayed);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent font-sans">
      <StreamRefreshPoller intervalMs={10000} />

      {/* Top-left: Player info panel */}
      <div className="absolute left-6 top-6">
        <div className="rounded-lg border border-white/10 bg-zinc-900 px-5 py-4 shadow-2xl">
          <span className="text-[10px] font-semibold tracking-[0.15em] text-white/50 uppercase">
            Rating
          </span>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-4xl font-bold tabular-nums text-white drop-shadow-lg">
              {user.rating}
            </span>
            <RankBadge rating={user.rating} gamesPlayed={user.gamesPlayed} />
          </div>
          {tier && (
            <span className="mt-0.5 block text-xs font-medium text-white/70">
              {tier.name}
            </span>
          )}
          {rank && (
            <span className="mt-1 block text-xs text-white/50">
              Rank #{rank}/{totalPlayers}
            </span>
          )}

          <div className="mt-3 flex items-center gap-3 text-xs">
            <span className="text-emerald-400 font-medium">
              {stats.totalWins}W
            </span>
            <span className="text-red-400 font-medium">
              {stats.totalLosses}L
            </span>
            {user.region && (
              <span className="text-white/50">&#8226; {user.region}</span>
            )}
          </div>
        </div>
      </div>

      {/* Top-center: Current match — scoreboard style */}
      {currentMatch && (
        <div className="absolute left-1/2 top-6 -translate-x-1/2 flex flex-col items-center">

          {/* Scoreboard */}
          <div className="flex items-stretch overflow-hidden rounded-md shadow-2xl">
            {/* Player 1 side */}
            <div className="flex min-w-64 max-w-64 flex-1 items-center justify-end gap-3 bg-sky-700 px-5 py-3">
              <span className="truncate text-lg font-bold text-white drop-shadow-sm">
                {currentMatch.player1.username}
              </span>
              <div className="flex shrink-0 -space-x-1.5">
                {(isUserPlayer1 ? uniqueUserChars : uniqueOpponentChars).map((c) => (
                  <CharacterIcon key={c} name={c} size={26} />
                ))}
              </div>
            </div>

            {/* Score divider */}
            <div className="flex items-center justify-center gap-2.5 bg-zinc-900 px-6 py-3">
              <span className="text-2xl font-bold tabular-nums leading-none text-emerald-400">
                {isUserPlayer1 ? userWins : opponentWins}
              </span>
              <span className="text-base font-bold tracking-widest text-zinc-500">VS</span>
              <span className="text-2xl font-bold tabular-nums leading-none text-red-400">
                {isUserPlayer1 ? opponentWins : userWins}
              </span>
            </div>

            {/* Player 2 side */}
            <div className="flex min-w-64 max-w-64 flex-1 items-center justify-start gap-3 bg-red-700 px-5 py-3">
              <div className="flex shrink-0 -space-x-1.5">
                {(isUserPlayer1 ? uniqueOpponentChars : uniqueUserChars).map((c) => (
                  <CharacterIcon key={c} name={c} size={26} />
                ))}
              </div>
              <span className="truncate text-lg font-bold text-white drop-shadow-sm">
                {currentMatch.player2.username}
              </span>
            </div>
          </div>

          {/* Game count footer */}
          <div className="mt-0.5 rounded-b-md bg-zinc-900 px-4 py-0.5">
            <span className="text-[11px] font-medium text-white/60">
              Game {totalCompletedGames + 1}
            </span>
          </div>
        </div>
      )}

      {/* Top-right: Recent matches (moved down 96px and left 24px from its default position) */}
      <div className="absolute" style={{ right: "calc(1.5rem + 24px)", top: "calc(1.5rem + 96px)" }}>
        <div className="rounded-lg border border-white/10 bg-zinc-900 px-4 py-3 shadow-2xl">
          <span className="text-[10px] font-semibold tracking-[0.15em] text-white/50 uppercase">
            Recent matches
          </span>
          <div className="mt-2 flex flex-col gap-1">
            {recentMatches.length === 0 ? (
              <span className="text-xs text-white/40">No matches yet</span>
            ) : (
              recentMatches.map((match) => (
                <div
                  key={match.id}
                  className="flex items-center gap-2 text-sm"
                >
                  <span
                    className={`w-4 text-center text-xs font-bold ${
                      match.won ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {match.won ? "W" : "L"}
                  </span>
                  <span className="text-white/80">{match.opponent.username}</span>
                  <span
                    className={`ml-auto tabular-nums text-xs font-medium ${
                      match.delta >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {match.delta >= 0 ? "+" : ""}
                    {match.delta}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
