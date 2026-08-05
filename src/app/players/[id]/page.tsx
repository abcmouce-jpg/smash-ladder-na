import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Award, Cable, ExternalLink, MapPin, Swords } from "lucide-react";
import { auth } from "@/auth";
import {
  getCareerStats,
  getCharacterUsage,
  getCurrentStreak,
  getPlayerMatchCount,
  getPlayerMatchHistory,
  getPlayerProfile,
  getRatingChartPoints,
  getTopRivals,
  getCurrentMatchForUser,
} from "@/lib/players";
import { isTwitchLive } from "@/lib/twitch-helix";
import { getMatchHistoryAchievements } from "@/lib/match-achievements";
import { computeAchievements, pointsToNextTier } from "@/lib/rank-tier";
import { CharacterIcon } from "@/components/character-icon";
import { CharacterUsageCard } from "@/components/character-usage-card";
import { RankBadge } from "@/components/rank-badge";
import { RatingChart } from "@/components/rating-chart";
import { DeleteAccountButton } from "@/components/delete-account-button";
import { BlockUserButton } from "@/components/block-user-button";
import { RequestCorrectionForm } from "@/components/request-correction-form";
import { MatchHistoryEntry } from "@/components/match-history-entry";
import { AdminMatchOverride, BanIpButton, ModerationStatusForm } from "@/components/moderation-tools";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import { TwitchLiveEmbed } from "@/components/twitch-live-embed";
import { isBlockedByMe } from "@/lib/blocks";
import { startggProfileUrl, supermajorProfileUrl } from "@/lib/startgg-oauth";
import { listReportsForUser } from "@/lib/reports";
import {
  adminOverrideResultAction,
  adminUndoMatchAction,
  banPlayerIpAction,
  blockUserAction,
  deleteAccountAction,
  getMatchChatLogAction,
  getMatchChatLogAsModAction,
  moderateUserAction,
  requestCorrectionAction,
} from "../actions";

const MATCH_HISTORY_PAGE_SIZE = 20;

export default async function PlayerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const requestedPage = Number(pageParam);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const session = await auth();
  const isOwnProfile = session?.user?.id === id;
  const isModerator = session?.user?.role === "MOD" || session?.user?.role === "ADMIN";
  const player = await getPlayerProfile(id);
  if (!player) notFound();

  const [
    recentHistory,
    pageHistory,
    totalMatchCount,
    chartPoints,
    careerStats,
    rivals,
    blocked,
    characterUsage,
    currentMatch,
    isLiveOnTwitch,
    matchAchievements,
    streak,
  ] = await Promise.all([
    // Fixed to the true most-recent matches regardless of which page of
    // history is being viewed — the win-rate/streak badges near the rating
    // chart, and which match (if any) the correction/admin-override forms
    // below attach to, all need this to stay put on page 2+, not silently
    // reflect whatever's on the current page.
    getPlayerMatchHistory(id),
    getPlayerMatchHistory(id, { limit: MATCH_HISTORY_PAGE_SIZE, skip: (page - 1) * MATCH_HISTORY_PAGE_SIZE }),
    getPlayerMatchCount(id),
    getRatingChartPoints(id),
    getCareerStats(id),
    getTopRivals(id),
    session?.user?.id && !isOwnProfile ? isBlockedByMe(session.user.id, id) : Promise.resolve(false),
    getCharacterUsage(id),
    getCurrentMatchForUser(id),
    player.twitchUsername ? isTwitchLive(player.twitchUsername) : Promise.resolve(false),
    getMatchHistoryAchievements(id),
    getCurrentStreak(id),
  ]);
  const inMatch = currentMatch !== null;
  const parentHost = (await headers()).get("host") ?? "smash-ladder-na.vercel.app";
  const reportHistory = isModerator ? await listReportsForUser(id) : [];
  const topCharacters = characterUsage.slice(0, 3).map((u) => u.character);
  // Practice matches still show up in the list below (clearly labeled) but
  // never count toward the record/win-rate/streak — same "never touches
  // your main profile" promise as everywhere else practice mode is handled.
  const realRecentHistory = recentHistory.filter((m) => !m.isPracticing);
  const realRecentWins = realRecentHistory.filter((m) => m.won).length;
  const winRate =
    realRecentHistory.length > 0 ? Math.round((realRecentWins / realRecentHistory.length) * 100) : null;
  const mostRecentRealMatchId = recentHistory.find((m) => !m.isPracticing)?.id ?? null;
  const totalPages = Math.max(1, Math.ceil(totalMatchCount / MATCH_HISTORY_PAGE_SIZE));
  const achievements = [...computeAchievements(careerStats), ...matchAchievements];
  const nextTier = pointsToNextTier(player.rating, player.gamesPlayed);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {player.avatarUrl && (
            <Image
              src={player.avatarUrl}
              alt={player.username}
              width={56}
              height={56}
              className="rounded-full"
            />
          )}
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              {player.username}
              {player.mainCharacter && <CharacterIcon name={player.mainCharacter} size={22} />}
              {player.secondaryCharacters.map((c) => (
                <CharacterIcon key={c} name={c} size={18} className="opacity-60" />
              ))}
            </h1>
            {player.discordUsername && player.discordUsername !== player.username && (
              <p className="text-xs text-muted-foreground">Discord: {player.discordUsername}</p>
            )}
            <p className="text-sm tabular-nums text-muted-foreground">
              {player.rating} rating · {player.gamesPlayed} sets played
              {topCharacters.length > 0 && (
                <>
                  {" · "}
                  <span className="group/characters relative inline-flex items-center gap-1 align-middle">
                    <span className="pointer-events-none absolute -top-6 left-0 z-10 rounded border border-border bg-popover px-1.5 py-0.5 text-xs whitespace-nowrap text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover/characters:opacity-100">
                      Most played characters
                    </span>
                    {topCharacters.map((character) => (
                      <CharacterIcon key={character} name={character} size={16} />
                    ))}
                  </span>
                </>
              )}
            </p>
            {player.practiceGamesPlayed > 0 && (
              <p className="text-xs tabular-nums text-muted-foreground">
                {player.practiceRating} practice rating · {player.practiceGamesPlayed} practice sets
              </p>
            )}
            <div className="mt-1.5 flex items-center gap-1.5">
              <RankBadge rating={player.rating} gamesPlayed={player.gamesPlayed} />
              {nextTier && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {nextTier.pointsNeeded} to {nextTier.nextTier.name}
                </span>
              )}
              {player.region && (
                <Badge variant="outline">
                  <MapPin className="size-3" />
                  {player.region}
                </Badge>
              )}
              {player.wiredConnection && (
                <Badge variant="outline">
                  <Cable className="size-3" />
                  Wired
                </Badge>
              )}
              {player.noShowCount > 0 && (
                <Badge variant="warning">{player.noShowCount} no-show{player.noShowCount === 1 ? "" : "s"}</Badge>
              )}
              {isModerator && player.cancelCount > 0 && (
                <Badge variant="warning">
                  {player.cancelCount} cancel{player.cancelCount === 1 ? "" : "s"}
                </Badge>
              )}
              {isModerator && player._count.connectionReportsReceived > 0 && (
                <Badge variant="warning">
                  {player._count.connectionReportsReceived} connection report
                  {player._count.connectionReportsReceived === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
            {player.startggSlug && (
              <a
                href={startggProfileUrl(player.startggSlug)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {player.startggGamerTag ?? "View on start.gg"} ✓
                <ExternalLink className="size-3" />
              </a>
            )}
            {player.startggSlug && player.startggUserId && (
              <a
                href={supermajorProfileUrl(player.startggSlug, player.startggUserId)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                View on supermajor.gg ✓
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>

        {session?.user?.id && !isOwnProfile && (
          blocked ? (
            <Badge variant="outline">Blocked</Badge>
          ) : (
            <BlockUserButton action={blockUserAction.bind(null, id)} username={player.username} />
          )
        )}
      </div>

      {inMatch && isLiveOnTwitch && player.twitchUsername && (
        <TwitchLiveEmbed username={player.twitchUsername} parentHost={parentHost} />
      )}

      {currentMatch && (
        <CurrentMatchCard
          userId={id}
          match={currentMatch}
          zenMode={isOwnProfile && player.zenMode}
        />
      )}

      {chartPoints.length >= 2 && (
        <Card className="mt-8">
          <CardContent className="pt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Rating over time</p>
              <div className="flex gap-2">
                {winRate !== null && (
                  <Badge variant="outline" className="tabular-nums">
                    {winRate}% win rate
                  </Badge>
                )}
                {streak > 0 && (
                  <Badge variant="success" className="tabular-nums">
                    {streak} win streak
                  </Badge>
                )}
              </div>
            </div>
            <RatingChart points={chartPoints.map((p) => ({ date: p.date.toISOString(), rating: p.rating }))} />
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardContent className="pt-4">
          <p className="text-sm font-medium">Career</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Doesn&apos;t reset between seasons.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div>
              <p className="text-lg font-semibold tabular-nums">
                {careerStats.totalWins}-{careerStats.totalLosses}
              </p>
              <p className="text-xs text-muted-foreground">Lifetime record</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">{careerStats.peakRating ?? "—"}</p>
              <p className="text-xs text-muted-foreground">Peak rating</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">{careerStats.bestWinStreak}</p>
              <p className="text-xs text-muted-foreground">Best win streak</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">{careerStats.seasonsPlayed}</p>
              <p className="text-xs text-muted-foreground">Seasons played</p>
            </div>
            <div>
              <p className="text-lg font-semibold tabular-nums">{careerStats.tournamentsEntered}</p>
              <p className="text-xs text-muted-foreground">Tournaments entered</p>
            </div>
          </div>

          <p className="mt-5 text-sm font-medium">Achievements</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {achievements.map((a, i) => (
              <Tooltip key={a.id}>
                <TooltipTrigger asChild>
                  <Badge
                    variant={a.achieved ? "success" : "outline"}
                    className={a.achieved ? "badge-pop gap-1 cursor-help" : "gap-1 cursor-help opacity-40"}
                    style={a.achieved ? { animationDelay: `${i * 60}ms` } : undefined}
                  >
                    <Award className="size-3" />
                    {a.label}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{a.description}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </CardContent>
      </Card>

      {rivals.length > 0 && (
        <Card className="mt-4">
          <CardContent className="pt-4">
            <p className="text-sm font-medium">Rivals</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {rivals.map((r) => (
                <li key={r.opponentId} className="flex items-center justify-between text-sm">
                  <Link
                    href={`/players/${r.opponentId}`}
                    className="flex items-center gap-1.5 hover:underline"
                  >
                    <Swords className="size-3.5 text-muted-foreground" />
                    {r.username}
                  </Link>
                  <span className="tabular-nums text-muted-foreground">
                    {r.wins}W–{r.losses}L
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <CharacterUsageCard usage={characterUsage} mainCharacter={player.mainCharacter} />

      <div className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-muted-foreground">Match history</h2>
            {totalMatchCount > 0 && (
              <Badge variant="outline">
                {totalMatchCount} confirmed match{totalMatchCount === 1 ? "" : "es"}
              </Badge>
            )}
          </div>
          {totalPages > 1 && <MatchHistoryPaginationControls playerId={id} page={page} totalPages={totalPages} />}
        </div>

        {pageHistory.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">No confirmed matches yet.</p>
        )}

        {pageHistory.length > 0 && (
          <Card className="mt-4 divide-y divide-border overflow-hidden py-0">
            {pageHistory.map((match) => (
              <MatchHistoryEntry
                key={match.id}
                match={{
                  ...match,
                  // Dates can't cross the server→client boundary; the
                  // modal renders it back with LocalTime.
                  confirmedAt: match.confirmedAt?.toISOString() ?? null,
                }}
                viewedPlayerName={player.username}
                // Own profile reads their own chat log; a mod reviewing
                // someone else's profile gets the mod spectator path. The
                // modal is the only place this renders now.
                chatLogAction={
                  isOwnProfile
                    ? getMatchChatLogAction.bind(null, match.id)
                    : isModerator
                      ? getMatchChatLogAsModAction.bind(null, match.id)
                      : undefined
                }
              >
                {isOwnProfile && match.id === mostRecentRealMatchId && (
                  <RequestCorrectionForm
                    action={requestCorrectionAction.bind(null, match.id)}
                    myId={id}
                    opponentId={match.opponent.id}
                    opponentUsername={match.opponent.username}
                  />
                )}
                {isModerator && !isOwnProfile && match.id === mostRecentRealMatchId && (
                  <AdminMatchOverride
                    player1Username={player.username}
                    player2Username={match.opponent.username}
                    actionForPlayer1={adminOverrideResultAction.bind(null, match.id, id, id)}
                    actionForPlayer2={adminOverrideResultAction.bind(null, match.id, id, match.opponent.id)}
                    undoAction={adminUndoMatchAction.bind(null, match.id, id)}
                  />
                )}
              </MatchHistoryEntry>
            ))}
          </Card>
        )}
      </div>

      {isModerator && !isOwnProfile && (
        <div className="mt-12 border-t border-border pt-6">
          <p className="text-sm font-medium">
            Report history <Badge variant="outline">{reportHistory.length}</Badge>
          </p>
          {reportHistory.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No reports filed against this player.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2">
              {reportHistory.map((r) => (
                <li key={r.id} className="text-sm">
                  <div className="flex items-center gap-1.5">
                    <Badge
                      variant={r.status === "ACTIONED" ? "destructive" : r.status === "DISMISSED" ? "outline" : "warning"}
                    >
                      {r.status.toLowerCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      by {r.reporter.username} · {r.createdAt.toISOString().slice(0, 10)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">{r.reason}</p>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6">
            <ModerationStatusForm action={moderateUserAction.bind(null, id)} currentStatus={player.status} />
          </div>

          {player.lastKnownIp && (
            <div className="mt-4">
              <BanIpButton
                action={banPlayerIpAction.bind(null, id, player.lastKnownIp)}
                ip={player.lastKnownIp}
              />
            </div>
          )}
        </div>
      )}

      {isOwnProfile && (
        <div className="mt-12 border-t border-border pt-6">
          <h2 className="text-sm font-medium text-destructive">Danger zone</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Deletes your username, avatar, and email. Match history stays, anonymized, so other
            players&apos; win/loss records stay accurate.
          </p>
          <div className="mt-3">
            <DeleteAccountButton action={deleteAccountAction} />
          </div>
        </div>
      )}
    </main>
  );
}

function isDisputedGame(game: {
  winnerId: string | null;
  reportedWinnerId: string | null;
  secondReportWinnerId: string | null;
}) {
  return !game.winnerId && !!game.secondReportWinnerId && game.secondReportWinnerId !== game.reportedWinnerId;
}

function CurrentMatchCard({
  userId,
  match,
  zenMode,
}: {
  userId: string;
  match: NonNullable<Awaited<ReturnType<typeof getCurrentMatchForUser>>>;
  zenMode: boolean;
}) {
  const isPlayer1 = match.player1Id === userId;
  const opponent = isPlayer1 ? match.player2 : match.player1;
  const myName = isPlayer1 ? match.player1.username : match.player2.username;
  const myRating = isPlayer1 ? match.player1.rating : match.player2.rating;

  const wins = { me: 0, opponent: 0 };
  for (const game of match.games) {
    if (game.winnerId === userId) wins.me++;
    else if (game.winnerId) wins.opponent++;
  }
  // A disputed game keeps winnerId null while a mod resolves it, but it
  // doesn't block the set — progressSet immediately creates the next game —
  // so it must be skipped here the same way the lobby does, or the card
  // shows a stale game number.
  const currentGame = match.games.find((game) => !game.winnerId && !isDisputedGame(game)) ?? null;
  const lastGame = match.games[match.games.length - 1];
  const gameNumber = currentGame?.gameNumber ??
    (lastGame && isDisputedGame(lastGame) ? lastGame.gameNumber : match.games.length + 1);
  const myCharacter = currentGame
    ? currentGame.actorAId === userId
      ? currentGame.actorACharacter
      : currentGame.actorBCharacter
    : null;
  const opponentCharacter = currentGame
    ? currentGame.actorAId === userId
      ? currentGame.actorBCharacter
      : currentGame.actorACharacter
    : null;
  // Game 1 is a blind pick — characters stay hidden until both sides have
  // locked in, same as the in-lobby pick UI.
  const showCharacters =
    currentGame !== null &&
    (currentGame.gameNumber !== 1 || (myCharacter !== null && opponentCharacter !== null));

  return (
    <Card className="mt-8">
      <CardContent className="pt-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Swords className="size-4 text-muted-foreground" />
          Currently in a match
        </p>

        <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {showCharacters && myCharacter ? (
              <CharacterIcon name={myCharacter} size={32} />
            ) : (
              <span aria-hidden className="size-8 shrink-0 rounded-full border border-dashed border-border" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{myName}</p>
              <p className="text-xs text-muted-foreground tabular-nums">{myRating} rating</p>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <p className="text-lg font-semibold tabular-nums">
              {wins.me}–{wins.opponent}
            </p>
            <p className="text-xs text-muted-foreground">Game {gameNumber} of 5</p>
          </div>

          <div className="flex min-w-0 items-center justify-end gap-2.5">
            {!zenMode &&
              (showCharacters && opponentCharacter ? (
                <CharacterIcon name={opponentCharacter} size={32} />
              ) : (
                <span aria-hidden className="size-8 shrink-0 rounded-full border border-dashed border-border" />
              ))}
            <div className="min-w-0">
              {zenMode ? (
                <p className="truncate text-right text-sm font-medium">Opponent</p>
              ) : (
                <Link href={`/players/${opponent.id}`} className="block truncate text-right text-sm font-medium hover:underline">
                  {opponent.username}
                </Link>
              )}
              {!zenMode && (
                <p className="text-right text-xs text-muted-foreground tabular-nums">{opponent.rating} rating</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MatchHistoryPaginationControls({
  playerId,
  page,
  totalPages,
}: {
  playerId: string;
  page: number;
  totalPages: number;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <MatchHistoryPageLink playerId={playerId} page={page - 1} disabled={page <= 1}>
        ← Previous
      </MatchHistoryPageLink>
      <span className="text-muted-foreground tabular-nums">
        Page {page} of {totalPages}
      </span>
      <MatchHistoryPageLink playerId={playerId} page={page + 1} disabled={page >= totalPages}>
        Next →
      </MatchHistoryPageLink>
    </div>
  );
}

function MatchHistoryPageLink({
  playerId,
  page,
  disabled,
  children,
}: {
  playerId: string;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-muted-foreground/40">{children}</span>;
  }
  return (
    <Link href={`/players/${playerId}?page=${page}`} className="hover:underline">
      {children}
    </Link>
  );
}
