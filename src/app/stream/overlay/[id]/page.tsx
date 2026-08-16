import Image from "next/image";
import { notFound } from "next/navigation";
import { Flame, MapPin, Trophy } from "lucide-react";
import { prisma } from "@/lib/db";
import { LEADERBOARD_MIN_GAMES } from "@/lib/rank-tier";
import {
  getCurrentStreak,
  getDailyStats,
  getPlayerMatchHistory,
} from "@/lib/players";
import { MatchStatus } from "@/generated/prisma/enums";
import { RankBadge } from "@/components/rank-badge";
import { CharacterIcon } from "@/components/character-icon";
import { StreamRefreshPoller } from "@/components/stream-refresh-poller";
import { StagePickHighlight } from "@/components/stage-pick-highlight";
import { getLang } from "@/lib/i18n";
import { bothCharactersLocked } from "@/lib/match-games";
import {
  GAME_ONE_STAGES,
  COUNTERPICK_STAGES,
  stageImagePath,
} from "@/lib/stages";

// How long the picked stage stays highlighted on stream once it's picked,
// and how long the server keeps rendering the highlight card — the window
// must cover the 10s refresh poll plus the 5s client-side hold so the
// highlight is always seen at least once, but stays short enough that a
// finished game (or an OBS source reload) never shows the card mid-game.
const PICK_HIGHLIGHT_HOLD_MS = 5_000;
const PICK_HIGHLIGHT_WINDOW_MS = 15_000;

// Indirection so Date.now() isn't called directly in a component's render
// body — the react-hooks purity lint rule flags it, even though a server
// component renders once per request anyway (same pattern as secondsUntil
// in lib/match-games.ts).
function nowMs() {
  return Date.now();
}

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
//   hideStageBans=1    — hides the stage pick/ban panel (bottom-center);
//                        hidden by default — streamers opt in by removing
//                        it in the settings toggle
//   lang=es            — Spanish labels (OBS's embedded browser doesn't
//                         share cookies with the streamer's own browser, so
//                         the usual cookie/DB language resolution can't
//                         reach this page — an explicit query param is the
//                         only way a streamer can actually set it here)

export default async function StreamOverlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    hideRecentMatches?: string;
    hideRatingCard?: string;
    hideStageBans?: string;
    lang?: string;
  }>;
}) {
  const { id } = await params;
  const {
    hideRecentMatches,
    hideRatingCard,
    hideStageBans,
    lang: langParam,
  } = await searchParams;
  const lang = langParam === "es" ? "es" : langParam === "en" ? "en" : await getLang();

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

  const [recentMatchesRaw, currentMatch, dailyStats, streak] = await Promise.all([
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
    getCurrentStreak(user.id),
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
          actorAStrikes: true,
          actorBStrikes: true,
          struckStages: true,
          finalStage: true,
          turnStartedAt: true,
        },
      })
    : [];

  // Determine the character each player is using in the current game
  // actorAId/actorBId are per-game and do NOT always match player1Id/player2Id
  // (counterpick games rotate who is actorA).
  const isUserPlayer1 = currentMatch?.player1.id === user.id;
  // getCurrentStreak returns a signed count (positive = win streak), and the
  // scoreboard only shows the orange flame for active win streaks.
  const opponentStreak = currentMatch
    ? await getCurrentStreak(
        isUserPlayer1 ? currentMatch.player2.id : currentMatch.player1.id,
      )
    : null;
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
  const showStageBans = hideStageBans !== "1";

  // Stage pick/ban phase: once both characters are locked in and no final
  // stage has been picked yet, show the stage pool with each side's bans.
  // Strikes are recorded in order — actorA's share first, then actorB's —
  // so a stage's index in struckStages tells us who banned it.
  const stageBanInProgress =
    !!currentGame &&
    bothCharactersLocked(currentGame) &&
    !currentGame.finalStage;
  const stagePool =
    currentGame?.gameNumber === 1 ? GAME_ONE_STAGES : COUNTERPICK_STAGES;
  const strikeOwner = (stage: string): "user" | "opponent" | null => {
    if (!currentGame) return null;
    const index = currentGame.struckStages.indexOf(stage);
    if (index < 0) return null;
    const actorId =
      index < currentGame.actorAStrikes
        ? currentGame.actorAId
        : currentGame.actorBId;
    return actorId === user.id ? "user" : "opponent";
  };

  // Once the final stage is picked, the card switches to a brief highlight
  // (the chosen stage gets an emerald ring + badge) and StagePickHighlight
  // hides it after PICK_HIGHLIGHT_HOLD_MS. turnStartedAt is reset when the
  // final stage is picked (see pickGameStage), so its age tells us whether
  // the pick is recent enough to still be showing.
  const pickedStage = currentGame?.finalStage ?? null;
  const pickAgeMs = currentGame?.finalStage
    ? nowMs() - currentGame.turnStartedAt.getTime()
    : Infinity;
  const showPickHighlight =
    pickedStage !== null && pickAgeMs < PICK_HIGHLIGHT_WINDOW_MS;

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
              {lang === "es" ? "Clasificación" : "Rating"}
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
                  {lang === "es" ? `Rango #${rank}/${totalPlayers}` : `Rank #${rank}/${totalPlayers}`}
                </span>
              )}
            </div>

            <div className="text-white mt-1.5 flex items-center gap-5 text-xl">
              {lang === "es" ? "Hoy:" : "Today:"}
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

      {/* Top-center: Scoreboard (when a match is live) with the branding
          below it; when idle, the branding alone at the top with the logo
          and title side by side. Same centering approach as before
          (inset-x-0 + items-center instead of left-1/2 -translate-x-1/2:
          Tailwind v4's -translate-x-1/2 compiles to the native `translate`
          CSS property, which older OBS Browser Source builds (pre-Chromium
          104) ignore — the scoreboard would sit pinned at left: 50% and
          look shoved right.) */}
      <div className="absolute inset-x-0 top-2 flex flex-col items-center">
        {currentMatch ? (
          <>
            {/* Best of 5 label */}
            <span className="text-base font-semibold tracking-[0.15em] text-zinc-800 uppercase">
              {lang === "es" ? "Mejor de 5" : "Best of 5"}
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
                  <span className="flex items-center gap-1.5">
                    {streak > 0 && (
                      <span className="flex items-center gap-0.5 text-orange-400">
                        <Flame className="size-4 fill-orange-400" />
                        <span className="text-base font-semibold tabular-nums">
                          {streak}
                        </span>
                      </span>
                    )}
                    <span className="text-base text-white/50 tabular-nums">
                      {user.rating}
                    </span>
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
                  <span className="flex items-center gap-1.5">
                    <span className="text-base text-white/50 tabular-nums">
                      {opponentRating}
                    </span>
                    {opponentStreak !== null && opponentStreak > 0 && (
                      <span className="flex items-center gap-0.5 text-orange-400">
                        <Flame className="size-4 fill-orange-400" />
                        <span className="text-base font-semibold tabular-nums">
                          {opponentStreak}
                        </span>
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Branding below the scoreboard */}
            <div className="flex items-center gap-4 rounded-b-2xl border border-white/10 bg-zinc-900/95 px-4 py-2 shadow-2xl backdrop-blur-sm border-t-0">
              <Image
                src="/smash_ladder_icon_white.png"
                alt=""
                width={256}
                height={256}
                className="size-12 block"
              />
              <span className="text-2xl font-semibold tracking-tight text-white">
                Smash Ladder <span className="text-primary">NA</span>
              </span>
            </div>
          </>
        ) : (
          /* No match in progress — logo and title on one line inside a
             single bordered pill */
          <div className="mt-6 flex items-center gap-4 rounded-2xl border border-white/10 bg-zinc-900/95 px-4 py-2 shadow-2xl backdrop-blur-sm">
            <Image
              src="/smash_ladder_icon_white.png"
              alt=""
              width={256}
              height={256}
              className="size-16 block"
            />
            <span className="text-3xl font-semibold tracking-tight text-white">
              Smash Ladder <span className="text-primary">NA</span>
            </span>
          </div>
        )}
      </div>

      {/* Top-right: Recent matches */}
      {showRecentMatches && (
        <div
          className="absolute right-8"
          style={{ top: "calc(2.5rem + 96px)" }}
        >
          <div className="rounded-2xl border border-white/10 bg-zinc-900/95 px-5 py-5 shadow-2xl backdrop-blur-sm">
            <span className="text-base font-semibold tracking-[0.15em] text-white/50 uppercase">
              {lang === "es" ? "Partidas recientes" : "Recent matches"}
            </span>
            <div className="mt-3 flex flex-col gap-2">
              {recentMatches.length === 0 ? (
                <span className="text-lg text-white/40">
                  {lang === "es" ? "Aún no hay partidas" : "No matches yet"}
                </span>
              ) : (
                recentMatches.map((match) => (
                  <div
                    key={match.id}
                    className="flex items-center gap-4 text-xl"
                  >
                    <span
                      className={`w-6 shrink-0 text-center text-base font-bold ${
                        match.won ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {match.won ? (lang === "es" ? "V" : "W") : (lang === "es" ? "D" : "L")}
                    </span>
                    <span className="min-w-0 max-w-48 truncate text-white/80">
                      {match.opponent.username}
                    </span>
                    <span
                      className={`ml-auto shrink-0 tabular-nums text-base font-semibold ${
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

      {/* Bottom-center: Stage pick/ban (while the current game's stage
          selection is in progress; when the final stage is picked, the
          chosen stage is highlighted for a few seconds before the card
          hides — all gated by the streamer's hideStageBans toggle) */}
      {showStageBans && currentGame && (stageBanInProgress || showPickHighlight) && (
        <StagePickHighlight
          autoHide={showPickHighlight}
          holdMs={PICK_HIGHLIGHT_HOLD_MS}
        >
          <div className="absolute inset-x-0 bottom-8 flex justify-center">
            <div className="rounded-2xl border border-white/10 bg-zinc-900/95 px-5 py-4 shadow-2xl backdrop-blur-sm">
              <span className="text-base font-semibold tracking-[0.15em] text-white/50 uppercase">
                {lang === "es"
                  ? `Juego ${currentGame.gameNumber} — ${
                      pickedStage ? "Escenario elegido" : "Elección de escenario"
                    }`
                  : `Game ${currentGame.gameNumber} — ${
                      pickedStage ? "Stage picked" : "Stage pick/ban"
                    }`}
              </span>
              <div className="mt-3 flex gap-2">
                {stagePool.map((stage) => {
                  const imgPath = stageImagePath(stage);
                  const owner = strikeOwner(stage);
                  const picked = pickedStage === stage;
                  return (
                    <div
                      key={stage}
                      className={`relative h-24 w-36 overflow-hidden rounded-lg border border-white/10 ${
                        picked ? "ring-2 ring-emerald-400" : ""
                      }`}
                    >
                      {imgPath && (
                        <Image
                          src={`/stages/${imgPath}`}
                          alt={stage}
                          fill
                          className="object-cover"
                          sizes="144px"
                        />
                      )}
                      {picked && (
                        <span className="absolute inset-x-0 top-0 z-30 bg-emerald-500/90 px-1 py-0.5 text-center text-[10px] font-bold tracking-wider text-white uppercase">
                          {lang === "es" ? "Elegido" : "Picked"}
                        </span>
                      )}
                      {owner && (
                        <div
                          className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-black/60 ${
                            owner === "user" ? "text-red-400" : "text-sky-400"
                          }`}
                        >
                          <span className="max-w-full truncate px-1 text-xs font-semibold text-white">
                            {owner === "user" ? user.username : opponentUsername}
                          </span>
                          <span className="text-4xl font-bold leading-none">
                            ✕
                          </span>
                        </div>
                      )}
                      <span className="absolute inset-x-0 bottom-0 z-20 truncate bg-black/70 px-1 py-0.5 text-center text-xs font-medium text-white">
                        {stage}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </StagePickHighlight>
      )}
    </div>
  );
}
