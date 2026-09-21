import Image from "next/image";
import Link from "next/link";
import { Cable, ExternalLink, MapPin, Share2, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CharacterIcon } from "@/components/character-icon";
import { CharacterUsageIcons } from "@/components/character-usage-icons";
import { RankBadge } from "@/components/rank-badge";
import { BlockUserButton } from "@/components/block-user-button";
import { TwitchLiveEmbed } from "@/components/twitch-live-embed";
import { startggProfileUrl, supermajorProfileUrl } from "@/lib/startgg-oauth";
import { getCurrentMatchForUser, getPlayerProfile, type CharacterUsage, type HeadToHead } from "@/lib/players";
import { pointsToNextTier } from "@/lib/rank-tier";
import type { Lang } from "@/lib/i18n";
import type { BlockState } from "../actions";

// The profile header is shared chrome — it renders above every tab and is
// identical no matter which one is active. The "currently in a match" card
// and live-Twitch embed live here with it, since a live match is the most
// important thing about the page and shouldn't disappear just because the
// viewer switched to the Seasons tab.
export function PlayerProfileHeader({
  player,
  characterUsage,
  nextTier,
  headToHead,
  blocked,
  currentMatch,
  isLiveOnTwitch,
  parentHost,
  viewerId,
  isOwnProfile,
  isModerator,
  blockAction,
  lang,
}: {
  player: NonNullable<Awaited<ReturnType<typeof getPlayerProfile>>>;
  characterUsage: CharacterUsage[];
  nextTier: ReturnType<typeof pointsToNextTier>;
  headToHead: HeadToHead | null;
  blocked: boolean;
  currentMatch: Awaited<ReturnType<typeof getCurrentMatchForUser>>;
  isLiveOnTwitch: boolean;
  parentHost: string;
  viewerId: string | null;
  isOwnProfile: boolean;
  isModerator: boolean;
  blockAction: (prevState: BlockState, formData: FormData) => Promise<BlockState>;
  lang: Lang;
}) {
  const inMatch = currentMatch !== null;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {player.avatarUrl && (
            <Image src={player.avatarUrl} alt={player.username} width={56} height={56} className="rounded-full" />
          )}
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 wrap-break-word text-2xl font-semibold tracking-tight">
              {player.username}
              {player.role !== "USER" && (
                <Badge variant={player.role === "ADMIN" ? "warning" : "secondary"} className="text-xs">
                  {player.role.toLowerCase()}
                </Badge>
              )}
              {player.isSupporter && (
                <Badge variant="success" className="text-xs">
                  {lang === "es" ? "💖 Patrocinador" : "💖 Supporter"}
                </Badge>
              )}
              <CharacterUsageIcons usage={characterUsage} />
            </h1>
            {player.discordUsername && !player.hideDiscordUsername && (
              <p className="text-xs text-muted-foreground">Discord: {player.discordUsername}</p>
            )}
            {player.isSupporter && (
              <p className="text-xs text-muted-foreground">
                {lang === "es"
                  ? `${player.username} ha donado para apoyar Smash Ladder NA — ¡gracias!`
                  : `${player.username} has donated to support Smash Ladder NA — thank you!`}
              </p>
            )}
            <p className="text-sm tabular-nums text-muted-foreground">
              {lang === "es"
                ? `${player.rating} de clasificación · ${player.gamesPlayed} partidas jugadas`
                : `${player.rating} rating · ${player.gamesPlayed} sets played`}
            </p>
            {headToHead && (
              <p className="text-sm tabular-nums text-muted-foreground">
                {lang === "es" ? "Tu récord: " : "Your record: "}
                {headToHead.wins}W–{headToHead.losses}L
              </p>
            )}
            {player.practiceGamesPlayed > 0 && (
              <p className="text-xs tabular-nums text-muted-foreground">
                {lang === "es"
                  ? `${player.practiceRating} de clasificación de práctica · ${player.practiceGamesPlayed} partidas de práctica`
                  : `${player.practiceRating} practice rating · ${player.practiceGamesPlayed} practice sets`}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <RankBadge rating={player.rating} gamesPlayed={player.gamesPlayed} />
              {nextTier && (
                <span className="text-xs tabular-nums text-muted-foreground">
                  {lang === "es"
                    ? `${nextTier.pointsNeeded} para ${nextTier.nextTier.name}`
                    : `${nextTier.pointsNeeded} to ${nextTier.nextTier.name}`}
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
                  {lang === "es" ? "Por cable" : "Wired"}
                </Badge>
              )}
              {player.noShowCount > 0 && (
                <Badge variant="warning">
                  {lang === "es"
                    ? `${player.noShowCount} ${player.noShowCount === 1 ? "no-show" : "no-shows"}`
                    : `${player.noShowCount} no-show${player.noShowCount === 1 ? "" : "s"}`}
                </Badge>
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
              <div className="mt-1.5 flex flex-wrap gap-4">
                <a
                  href={startggProfileUrl(player.startggSlug)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  <svg width="16" height="16" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M1.25 20h7.5A1.25 1.25 0 0 0 10 18.75v-7.5A1.25 1.25 0 0 1 11.25 10h27.5A1.25 1.25 0 0 0 40 8.75V1.25A1.25 1.25 0 0 0 38.75 0H10A10 10 0 0 0 0 10v8.75A1.25 1.25 0 0 0 1.25 20Z"
                      fill="#3f80ff"
                    />
                    <path
                      d="M38.75 20h-7.5A1.25 1.25 0 0 0 30 21.25v7.5A1.25 1.25 0 0 1 28.75 30H1.25A1.25 1.25 0 0 0 0 31.25v7.5A1.25 1.25 0 0 0 1.25 40H30A10 10 0 0 0 40 30V21.25A1.25 1.25 0 0 0 38.75 20Z"
                      fill="#ff2768"
                    />
                  </svg>
                  start.gg
                  <ExternalLink className="size-3" />
                </a>
                {player.startggPlayerId && (
                  <a
                    href={supermajorProfileUrl(player.startggPlayerId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                  >
                    <Image src="/supermajor-icon.png" alt="Supermajor" width={24} height={24} className="size-4" />
                    supermajor.gg
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <a
            href={`/players/${player.id}/opengraph-image`}
            target="_blank"
            rel="noreferrer"
            aria-label={lang === "es" ? "Compartir tarjeta de clasificación" : "Share rank card"}
            title={lang === "es" ? "Compartir tarjeta de clasificación" : "Share rank card"}
            className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Share2 className="size-4" />
          </a>
          {viewerId &&
            !isOwnProfile &&
            (blocked ? (
              <Badge variant="outline">{lang === "es" ? "Bloqueado" : "Blocked"}</Badge>
            ) : (
              <BlockUserButton action={blockAction} username={player.username} lang={lang} />
            ))}
        </div>
      </div>

      {inMatch && isLiveOnTwitch && player.twitchUsername && (
        <TwitchLiveEmbed username={player.twitchUsername} parentHost={parentHost} />
      )}

      {currentMatch && (
        <CurrentMatchCard
          userId={player.id}
          match={currentMatch}
          zenMode={isOwnProfile && player.zenMode}
          lang={lang}
        />
      )}
    </>
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
  lang,
}: {
  userId: string;
  match: NonNullable<Awaited<ReturnType<typeof getCurrentMatchForUser>>>;
  zenMode: boolean;
  lang: Lang;
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
  const gameNumber =
    currentGame?.gameNumber ?? (lastGame && isDisputedGame(lastGame) ? lastGame.gameNumber : match.games.length + 1);
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
    currentGame !== null && (currentGame.gameNumber !== 1 || (myCharacter !== null && opponentCharacter !== null));

  return (
    <Card className="mt-8">
      <CardContent className="pt-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Swords className="size-4 text-muted-foreground" />
          {lang === "es" ? "Actualmente en una partida" : "Currently in a match"}
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
              <p className="text-xs text-muted-foreground tabular-nums">
                {lang === "es" ? `${myRating} de clasificación` : `${myRating} rating`}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <p className="text-lg font-semibold tabular-nums">
              {wins.me}–{wins.opponent}
            </p>
            <p className="text-xs text-muted-foreground">
              {lang === "es" ? `Juego ${gameNumber} de 5` : `Game ${gameNumber} of 5`}
            </p>
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
                <p className="truncate text-right text-sm font-medium">{lang === "es" ? "Rival" : "Opponent"}</p>
              ) : (
                <Link
                  href={`/players/${opponent.id}`}
                  className="block truncate text-right text-sm font-medium hover:underline"
                >
                  {opponent.username}
                </Link>
              )}
              {!zenMode && (
                <p className="text-right text-xs text-muted-foreground tabular-nums">
                  {lang === "es" ? `${opponent.rating} de clasificación` : `${opponent.rating} rating`}
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
