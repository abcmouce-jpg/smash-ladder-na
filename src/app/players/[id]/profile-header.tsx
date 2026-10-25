import Image from "next/image";
import Link from "next/link";
import { Cable, EyeOff, MapPin, Swords } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CharacterIcon } from "@/components/character-icon";
import { CharacterUsageIcons } from "@/components/character-usage-icons";
import { DiscordIcon } from "@/components/discord-icon";
import { StartggIcon } from "@/components/startgg-icon";
import { TwitchIcon } from "@/components/twitch-icon";
import { RankBadge } from "@/components/rank-badge";
import { RatingHidden } from "@/components/rating-hidden";
import { BlockUserButton } from "@/components/block-user-button";
import { ShareMenu } from "@/components/share-menu";
import { LiveStreamEmbed } from "@/components/live-stream-embed";
import { playerStreamLink } from "@/lib/stream-links";
import { startggProfileUrl, supermajorProfileUrl } from "@/lib/startgg-oauth";
import { getCurrentMatchForUser, getPlayerProfile, type CharacterUsage, type HeadToHead } from "@/lib/players";
import { getRankTier, isRatingVisible } from "@/lib/rank-tier";
import { formatRating } from "@/lib/rating-format";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import type { Lang } from "@/lib/i18n";
import type { BlockState } from "../actions";
import { tr } from "@/lib/lang";

// The profile header is shared chrome — it renders above every tab and is
// identical no matter which one is active. The "currently in a match" card
// and live-Twitch embed live here with it, since a live match is the most
// important thing about the page and shouldn't disappear just because the
// viewer switched to the Seasons tab.
export function PlayerProfileHeader({
  player,
  characterUsage,
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
  // Hidden from the public (self-declared privacy, or an anonymized deleted
  // account — see getPlayerProfile) still reaches a mod/admin viewer, same
  // reasoning as the cancel-count/connection-report badges further down.
  const discordHiddenFromPublic = Boolean(player.hideDiscordUsername);
  const showDiscord = Boolean(player.discordUsername && (!discordHiddenFromPublic || isModerator));

  const ratingVisible = isRatingVisible(player.gamesPlayed, isModerator);
  const tier = getRankTier(player.rating, player.gamesPlayed);
  const ratingLabel = tier ? `${formatRating(player.rating)} (${tier.name})` : `${formatRating(player.rating)}`;
  // A provisional player's rating isn't public (see isRatingVisible), so the
  // share text drops the number rather than advertising a hidden one.
  const shareText = !ratingVisible
    ? isOwnProfile
      ? tr(lang, {
          en: `I'm on ${SITE_NAME}!`,
          es: `¡Estoy en ${SITE_NAME}!`,
          ja: `${SITE_NAME}やってます！`,
        })
      : tr(lang, {
          en: `${player.username} is on ${SITE_NAME}.`,
          es: `${player.username} está en ${SITE_NAME}.`,
          ja: `${player.username}さんは${SITE_NAME}でプレイしています。`,
        })
    : isOwnProfile
      ? tr(lang, {
          en: `I'm rated ${ratingLabel} on ${SITE_NAME}!`,
          es: `¡Tengo ${ratingLabel} de clasificación en ${SITE_NAME}!`,
          ja: `${SITE_NAME}でレート${ratingLabel}です！`,
        })
      : tr(lang, {
          en: `${player.username} is rated ${ratingLabel} on ${SITE_NAME}.`,
          es: `${player.username} tiene ${ratingLabel} de clasificación en ${SITE_NAME}.`,
          ja: `${player.username}さんは${SITE_NAME}でレート${ratingLabel}です。`,
        });
  const profileUrl = `${SITE_URL}/players/${player.id}`;

  return (
    <>
      <div className="flex items-start justify-between gap-2 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 sm:gap-4">
            {player.avatarUrl && (
              <Image
                src={player.avatarUrl}
                alt={player.username}
                width={56}
                height={56}
                className="size-12 rounded-full sm:size-14"
              />
            )}
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-1.5 wrap-break-word text-xl font-semibold tracking-tight sm:gap-2 sm:text-2xl">
                <span className={player.isGoldSupporter ? "text-amber-500 dark:text-amber-400" : undefined}>
                  {player.username}
                </span>
                {player.role !== "USER" && (
                  <Badge variant={player.role === "ADMIN" ? "warning" : "secondary"} className="text-xs">
                    {player.role.toLowerCase()}
                  </Badge>
                )}
                {player.isGoldSupporter ? (
                  <Badge variant="warning" className="text-xs">
                    {tr(lang, {
                      en: "🏆 Gold Supporter",
                      es: "🏆 Patrocinador Gold",
                      ja: "🏆 ゴールドサポーター",
                    })}
                  </Badge>
                ) : (
                  player.isSupporter && (
                    <Badge variant="success" className="text-xs">
                      {tr(lang, {
                        en: "💖 Supporter",
                        es: "💖 Patrocinador",
                        ja: "💖 サポーター",
                      })}
                    </Badge>
                  )
                )}
                <CharacterUsageIcons usage={characterUsage} />
              </h1>
              <p className="text-sm tabular-nums text-muted-foreground">
                {ratingVisible ? (
                  tr(lang, {
                    en: `${formatRating(player.rating)} rating`,
                    es: `${formatRating(player.rating)} de clasificación`,
                    ja: `レート ${formatRating(player.rating)}`,
                  })
                ) : (
                  <RatingHidden gamesPlayed={player.gamesPlayed} lang={lang} />
                )}
              </p>
              {player.isSupporter && (
                <p className="text-xs text-muted-foreground">
                  {tr(lang, {
                    en: `${player.username} has donated to support ${SITE_NAME} — thank you!`,
                    es: `${player.username} ha donado para apoyar ${SITE_NAME} — ¡gracias!`,
                    ja: `${player.username}さんは${SITE_NAME}を支援してくれました。ありがとうございます！`,
                  })}
                </p>
              )}
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:mt-3">
            {showDiscord && (
              <Badge
                variant="outline"
                title={discordHiddenFromPublic ? "Hidden from other players — mod/admin only" : undefined}
              >
                <DiscordIcon className="size-3" />
                {player.discordUsername}
                {discordHiddenFromPublic && <EyeOff className="size-3" />}
              </Badge>
            )}
            {player.youtubeChannelUrl && (
              <a
                href={player.youtubeChannelUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={tr(lang, {
                  en: "YouTube channel",
                  es: "Canal de YouTube",
                  ja: "YouTube チャンネル",
                })}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                YouTube
              </a>
            )}
            {player.twitchUsername && (
              <a
                href={`https://twitch.tv/${player.twitchUsername}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${tr(lang, { en: "Twitch channel", es: "Canal de Twitch", ja: "Twitch チャンネル" })}: ${
                  player.twitchDisplayName ?? player.twitchUsername
                }`}
              >
                <Badge variant="outline">
                  <TwitchIcon className="size-3" />
                  {player.twitchDisplayName ?? player.twitchUsername}
                </Badge>
              </a>
            )}
            {player.startggSlug && (
              <a href={startggProfileUrl(player.startggSlug)} target="_blank" rel="noopener noreferrer">
                <Badge variant="outline">
                  <StartggIcon className="size-3" />
                  start.gg
                </Badge>
              </a>
            )}
            {player.startggSlug && player.startggPlayerId && (
              <a href={supermajorProfileUrl(player.startggPlayerId)} target="_blank" rel="noopener noreferrer">
                <Badge variant="outline">
                  <Image src="/supermajor-icon.png" alt="" width={24} height={24} className="size-3" />
                  supermajor.gg
                </Badge>
              </a>
            )}
            <RankBadge rating={player.rating} gamesPlayed={player.gamesPlayed} />
            {player.region && (
              <Badge variant="outline">
                <MapPin className="size-3" />
                {player.region}
              </Badge>
            )}
            {player.wiredConnection && (
              <Badge variant="outline">
                <Cable className="size-3" />
                {tr(lang, { en: "Wired", es: "Por cable", ja: "有線" })}
              </Badge>
            )}
            {player.noShowCount > 0 && (
              <Badge variant="warning">
                {tr(lang, {
                  en: `${player.noShowCount} no-show${player.noShowCount === 1 ? "" : "s"}`,
                  es: `${player.noShowCount} ${player.noShowCount === 1 ? "no-show" : "no-shows"}`,
                  ja: `不参加${player.noShowCount}回`,
                })}
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
          {headToHead && (
            <p className="mt-1.5 text-sm tabular-nums text-muted-foreground">
              {tr(lang, {
                en: "Your record: ",
                es: "Tu récord: ",
                ja: "あなたの戦績：",
              })}
              {headToHead.wins}W–{headToHead.losses}L
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5 sm:gap-2">
          <ShareMenu url={profileUrl} text={shareText} playerId={player.id} lang={lang} />
          {viewerId &&
            !isOwnProfile &&
            (blocked ? (
              <Badge variant="outline">
                {tr(lang, {
                  en: "Blocked",
                  es: "Bloqueado",
                  ja: "ブロック済み",
                })}
              </Badge>
            ) : (
              <BlockUserButton action={blockAction} username={player.username} lang={lang} />
            ))}
        </div>
      </div>

      {inMatch &&
        (() => {
          const link = playerStreamLink(player);
          // A detected Twitch stream, or one the player declared — the second
          // is the only way a YouTube stream can be known (see lib/stream-links.ts).
          if (!link || (link.platform === "twitch" && !isLiveOnTwitch && !player.liveStreamUrl)) return null;
          return (
            <LiveStreamEmbed link={link} title={player.twitchDisplayName ?? player.username} parentHost={parentHost} />
          );
        })()}

      {currentMatch && (
        <CurrentMatchCard
          userId={player.id}
          match={currentMatch}
          zenMode={isOwnProfile && player.zenMode}
          viewerIsModerator={isModerator}
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
  viewerIsModerator,
  lang,
}: {
  userId: string;
  match: NonNullable<Awaited<ReturnType<typeof getCurrentMatchForUser>>>;
  zenMode: boolean;
  viewerIsModerator: boolean;
  lang: Lang;
}) {
  const isPlayer1 = match.player1Id === userId;
  const opponent = isPlayer1 ? match.player2 : match.player1;
  const myName = isPlayer1 ? match.player1.username : match.player2.username;
  const myRating = isPlayer1 ? match.player1.rating : match.player2.rating;
  const myGamesPlayed = isPlayer1 ? match.player1.gamesPlayed : match.player2.gamesPlayed;
  // Each side is gated on its own games played — one provisional player in the
  // set doesn't hide the other's established rating.
  const myRatingVisible = isRatingVisible(myGamesPlayed, viewerIsModerator);
  const opponentRatingVisible = isRatingVisible(opponent.gamesPlayed, viewerIsModerator);

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
          {tr(lang, {
            en: "Currently in a match",
            es: "Actualmente en una partida",
            ja: "対戦中",
          })}
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
                {myRatingVisible ? (
                  tr(lang, {
                    en: `${formatRating(myRating)} rating`,
                    es: `${formatRating(myRating)} de clasificación`,
                    ja: `レート ${formatRating(myRating)}`,
                  })
                ) : (
                  <RatingHidden gamesPlayed={myGamesPlayed} lang={lang} />
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <p className="text-lg font-semibold tabular-nums">
              {wins.me}–{wins.opponent}
            </p>
            <p className="text-xs text-muted-foreground">
              {tr(lang, {
                en: `Game ${gameNumber} of 5`,
                es: `Juego ${gameNumber} de 5`,
                ja: `第${gameNumber}試合 / 全5試合`,
              })}
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
                <p className="truncate text-right text-sm font-medium">
                  {tr(lang, { en: "Opponent", es: "Rival", ja: "相手" })}
                </p>
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
                  {opponentRatingVisible ? (
                    tr(lang, {
                      en: `${formatRating(opponent.rating)} rating`,
                      es: `${formatRating(opponent.rating)} de clasificación`,
                      ja: `レート ${formatRating(opponent.rating)}`,
                    })
                  ) : (
                    <RatingHidden gamesPlayed={opponent.gamesPlayed} lang={lang} />
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
