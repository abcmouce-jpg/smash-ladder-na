import Image from "next/image";
import { notFound } from "next/navigation";
import { MapPin, Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import { getDailyStats, getPlayerMatchHistory } from "@/lib/players";
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
//
// Query params:
//   hideRecentMatches=1 — hides the recent matches panel
//   hideRatingCard=1   — hides the rating card (top-left panel)

export default async function StreamOverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    hideRecentMatches?: string;
    hideRatingCard?: string;
  }>;
}) {
  const { id } = await params;
  const { hideRecentMatches, hideRatingCard } = await searchParams;

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
  const rank =
    user.gamesPlayed >= LEADERBOARD_MIN_GAMES && totalPlayers > 0
      ? (await prisma.user.count({
          where: {
            gamesPlayed: { gte: LEADERBOARD_MIN_GAMES },
            rating: { gt: user.rating },
          },
        })) + 1
      : null;

  const [recentMatchesRaw, currentMatch, dailyStats] = await Promise.all([
    getPlayerMatchHistory(user.id, { limit: 5 }),
    prisma.ratingMatch.findFirst({
      where: {
        OR: [{ player1Id: user.id }, { player2Id: user.id }],
        status: { in: [MatchStatus.PENDING_REPORT, MatchStatus.REPORTED] },
      },
      orderBy: { createdAt: "desc" },
      include: {
        player1: {
          select: { id: true, username: true, rating: true, gamesPlayed: true },
        },
        player2: {
          select: { id: true, username: true, rating: true, gamesPlayed: true },
        },
      },
    }),
    getDailyStats(user.id),
  ]);
  // Practice matches now show up in getPlayerMatchHistory (labeled, on the
  // profile page) but there's no room for that label in this compact
  // broadcast graphic — simplest to just leave them off the overlay.
  const recentMatches = recentMatchesRaw.filter((m) => !m.isPracticing);

  const currentMatchGames = currentMatch
    ? await prisma.matchGame.findMany({
        where: { matchId: currentMatch.id },
        orderBy: { gameNumber: "asc" },
        select: {
          gameNumber: true,
          winnerId: true,
          actorAId: true,
          actorBId: true,
          actorACharacter: true,
          actorBCharacter: true,
        },
      })
    : [];

  // Determine the character each player is using in the current game
  // actorAId/actorBId are per-game and do NOT always match player1Id/player2Id
  // (counterpick games rotate who is actorA).
  const isUserPlayer1 = currentMatch?.player1.id === user.id;
  const currentGame = currentMatchGames.at(-1);
  // Game 1 is a blind pick — neither side's character is shown on the
  // overlay until both players have locked one in. Games 2-5 are
  // sequential (actorA locks in first, then actorB reacts), so each icon
  // can appear as soon as its pick is set there.
  const game1BlindPickPending =
    currentGame?.gameNumber === 1 &&
    (!currentGame.actorACharacter || !currentGame.actorBCharacter);
  const userCharacter = game1BlindPickPending
    ? null
    : currentGame
      ? currentGame.actorAId === user.id
        ? currentGame.actorACharacter
        : currentGame.actorBCharacter
      : null;
  const opponentCharacter = game1BlindPickPending
    ? null
    : currentGame
      ? currentGame.actorAId === user.id
        ? currentGame.actorBCharacter
        : currentGame.actorACharacter
      : null;

  // Count games won by each player
  const userWins = currentMatchGames.filter(
    (g) => g.winnerId === user.id,
  ).length;
  const opponentWins = currentMatchGames.filter(
    (g) => g.winnerId && g.winnerId !== user.id,
  ).length;

  const opponentUsername = currentMatch
    ? isUserPlayer1
      ? currentMatch.player2.username
      : currentMatch.player1.username
    : null;
  const opponentRating = currentMatch
    ? isUserPlayer1
      ? currentMatch.player2.rating
      : currentMatch.player1.rating
    : null;

  const showRecentMatches = hideRecentMatches !== "1";
  const showRatingCard = hideRatingCard !== "1";

  return (
    // The overlay is always a dark broadcast graphic (zinc panels, white
    // text), so force the dark theme here — otherwise the RankBadge's
    // light-mode colors show through when the OBS browser source runs in
    // light mode.
    <div className="dark relative h-screen w-screen overflow-hidden bg-transparent font-sans">
      <StreamRefreshPoller intervalMs={10000} />

      {/* Top-left: Player info panel */}
      {showRatingCard && (
        <div className="absolute left-8 top-8">
          <div className="rounded-2xl border border-white/10 bg-zinc-900/95 px-5 py-5 shadow-2xl backdrop-blur-sm">
            <span className="text-base font-semibold tracking-[0.15em] text-white/50 uppercase">
              Rating
            </span>
            <RankBadge
              rating={user.rating}
              gamesPlayed={user.gamesPlayed}
              className="text-md mx-3 px-3 py-1"
            />
            <div className="mt-1 flex items-baseline gap-4">
              <Trophy className="size-8 text-white drop-shadow-lg" />
              <span className="text-5xl font-bold tabular-nums text-white drop-shadow-lg">
                {user.rating}
              </span>
            </div>
            <div className="mt-1.5 flex items-center gap-4">
              {rank && (
                <span className="text-2xl text-white/50">
                  Rank #{rank}/{totalPlayers}
                </span>
              )}
            </div>

            <div className="text-white mt-1.5 flex items-center gap-5 text-xl">
              Today:
              <span className="text-emerald-400 font-semibold">
                {dailyStats.totalWins}W
              </span>
              <span className="text-red-400 font-semibold">
                {dailyStats.totalLosses}L
              </span>
            </div>

            {user.region && (
              <div className="mt-2 flex items-center gap-2 text-xl">
                <MapPin className="size-5 text-white/50" />
                <span className="text-white/50">{user.region}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top-center: Current match — scoreboard style */}
      {currentMatch && (
        <div className="absolute left-1/2 top-2 -translate-x-1/2 flex flex-col items-center gap-0">
          {/* Best of 5 label */}
          <span className="text-base font-semibold tracking-[0.15em] text-zinc-800 uppercase">
            Best of 5
          </span>

          {/* Scoreboard */}
          <div className="flex items-stretch overflow-hidden rounded-2xl shadow-2xl">
            {/* Stream user side (left) */}
            <div className="flex min-w-96 max-w-96 flex-1 items-center justify-end gap-5 bg-zinc-800 px-8 py-2">
              <div className="flex flex-col items-end">
                <span className="truncate text-3xl font-bold text-white drop-shadow-sm">
                  {isUserPlayer1
                    ? currentMatch.player1.username
                    : currentMatch.player2.username}
                </span>
                <span className="text-base text-white/50 tabular-nums">
                  {user.rating}
                </span>
              </div>
              <div className="flex shrink-0">
                {userCharacter && (
                  <CharacterIcon name={userCharacter} size={48} />
                )}
              </div>
            </div>

            {/* Score divider */}
            <div className="flex items-center justify-center gap-4 bg-zinc-900 px-10 py-2">
              <span className="text-5xl font-bold tabular-nums leading-none text-red-400">
                {userWins}
              </span>
              <span className="text-2xl font-bold tracking-widest text-zinc-500">
                VS
              </span>
              <span className="text-5xl font-bold tabular-nums leading-none text-sky-400">
                {opponentWins}
              </span>
            </div>

            {/* Opponent side (right) */}
            <div className="flex min-w-96 max-w-96 flex-1 items-center justify-start gap-5 bg-zinc-800 px-8 py-2">
              <div className="flex shrink-0">
                {opponentCharacter && (
                  <CharacterIcon name={opponentCharacter} size={48} />
                )}
              </div>
              <div className="flex flex-col items-start">
                <span className="truncate text-3xl font-bold text-white drop-shadow-sm">
                  {opponentUsername}
                </span>
                <span className="text-base text-white/50 tabular-nums">
                  {opponentRating}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top-right: Recent matches */}
      {showRecentMatches && (
        <div
          className="absolute right-8"
          style={{ top: "calc(2.5rem + 96px)" }}
        >
          <div className="rounded-2xl border border-white/10 bg-zinc-900/95 px-5 py-5 shadow-2xl backdrop-blur-sm">
            <span className="text-base font-semibold tracking-[0.15em] text-white/50 uppercase">
              Recent matches
            </span>
            <div className="mt-3 flex flex-col gap-2">
              {recentMatches.length === 0 ? (
                <span className="text-lg text-white/40">No matches yet</span>
              ) : (
                recentMatches.map((match) => (
                  <div
                    key={match.id}
                    className="flex items-center gap-4 text-xl"
                  >
                    <span
                      className={`w-6 text-center text-base font-bold ${
                        match.won ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {match.won ? "W" : "L"}
                    </span>
                    <span className="text-white/80">
                      {match.opponent.username}
                    </span>
                    <span
                      className={`ml-auto tabular-nums text-base font-semibold ${
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
      )}

      {/* Bottom-center: Branding */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
        <div className="rounded-2xl border border-white/10 bg-zinc-900/95 px-2 py-2 shadow-2xl backdrop-blur-sm">
          <Image
            src="/smash_ladder_icon_white.png"
            alt=""
            width={256}
            height={256}
            className="size-24 block"
          />
        </div>
        <span className="text-white rounded-t-2xl border border-white/10 bg-zinc-900/95 px-2 py-2 shadow-2xl backdrop-blur-sm text-3xl font-semibold tracking-tight">
          Smash Ladder <span className="text-primary">NA</span>
        </span>
      </div>
    </div>
  );
}
