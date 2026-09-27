"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, MapPin, Radio } from "lucide-react";
import type { MatchFeedEntry } from "@/lib/match-feed";
import type { Lang } from "@/lib/i18n";
import { CharacterIcon } from "@/components/character-icon";
import { RankBadge } from "@/components/rank-badge";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatRating } from "@/lib/rating-format";
import { isRatingVisible } from "@/lib/rank-tier";
import {
  STATUS_LABEL,
  STATUS_VARIANT,
  getUnfinishedGame,
  isSetLive,
  type FeedPlayer,
  type SerializedSetEntry,
  type UnfinishedGame,
} from "@/lib/set-entry";
import { useLiveStreamSelection } from "@/components/live-streams/selection";
import { TwitchIcon } from "@/components/twitch-icon";

// Expandable feed row. The collapsed header summarizes the set (both
// players, current score, status); clicking anywhere except the player-name
// links reveals the per-game progress underneath, in the same compact
// scoreboard style as a profile's match history. Rows with no games yet
// still open — they just say the set hasn't started. The footer carries the
// status line and, above it, a live line with one button per streaming side —
// the Twitch mark plus the channel name — that drives the pinned player at the
// top of the page. In-progress sets that nobody is streaming get a green
// left-edge accent so scanners notice them among the finished rows.
export function SetRow({
  entry,
  lang,
  viewerIsModerator = false,
}: {
  entry: SerializedSetEntry;
  lang: Lang;
  viewerIsModerator?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = STATUS_LABEL[entry.status];
  const decidedGames = entry.games.filter((g) => g.winnerId !== null);
  const unfinishedGame = getUnfinishedGame(entry);
  const hasGames = decidedGames.length > 0 || unfinishedGame !== null;
  const unstreamedInProgress = !entry.hasLiveStreamer && isSetLive(entry.status);

  return (
    <Card className={cn("relative overflow-hidden py-0", entry.hasLiveStreamer && "border-red-500/30")}>
      {unstreamedInProgress && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-emerald-500" />
      )}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        }}
        className={cn("cursor-pointer outline-none select-none", open && "bg-muted/30")}
      >
        {/* On phones each player gets its own line with the score held to the
            right of both; squeezing two mirrored sides and the score into one
            line left no room for the names. From sm up the mirrored
            scoreboard is back. */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1.5 px-3 py-2.5 sm:flex sm:items-center sm:gap-3 sm:px-4">
          <Side
            player={entry.player1}
            align="left"
            viewerIsModerator={viewerIsModerator}
            className="col-start-1 row-start-1"
          />

          <div className="col-start-2 row-span-2 row-start-1 flex shrink-0 flex-col items-center gap-1">
            <span className="text-base leading-none font-semibold tabular-nums">
              {entry.wins.player1}–{entry.wins.player2}
            </span>
            <ChevronDown
              aria-hidden
              className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
            />
          </div>

          <Side
            player={entry.player2}
            align="right"
            viewerIsModerator={viewerIsModerator}
            className="col-start-1 row-start-2"
          />
        </div>

        {/* Live line: one button per streaming side — Twitch mark + channel
            name — sitting above the status divider. */}
        {entry.hasLiveStreamer && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 pb-2.5 sm:px-4">
            {entry.player1Live && <OpenStreamButton player={entry.player1} matchId={entry.id} lang={lang} />}
            {entry.player2Live && <OpenStreamButton player={entry.player2} matchId={entry.id} lang={lang} />}
          </div>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-1.5 text-xs text-muted-foreground sm:px-4">
          <span className="flex min-w-0 items-center gap-1.5">
            <Badge variant={STATUS_VARIANT[entry.status] ?? "outline"} className="shrink-0 px-1.5 py-0 text-[10px]">
              {lang === "es" ? label?.es : label?.en}
            </Badge>
            {entry.hasLiveStreamer && (
              <span className="flex shrink-0 items-center gap-1 font-medium text-red-500">
                <Radio className="size-3" />
                {lang === "es" ? "En vivo" : "Live"}
              </span>
            )}
          </span>
          <span className="shrink-0 tabular-nums">
            <LocalTime iso={entry.createdAt} />
          </span>
        </div>
      </div>

      {open && (
        <div className="border-t border-border px-3 py-3 sm:px-4">
          {hasGames ? (
            <>
              <div className="flex flex-col gap-1.5">
                {decidedGames.map((game) => (
                  <GameLine key={game.gameNumber} entry={entry} game={game} lang={lang} />
                ))}
              </div>
              {unfinishedGame && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      unfinishedGame.inProgress ? "bg-muted-foreground/60" : "border border-muted-foreground/40",
                    )}
                  />
                  {unfinishedGameLabel(unfinishedGame, lang)}
                </p>
              )}
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
              {lang === "es"
                ? "Aún no se ha jugado ningún juego — esta partida no ha empezado."
                : "No games played yet — this set hasn't started."}
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

// Copy for the set's undecided game. Only a set that's still live gets the
// running "in progress" line; one that ended with the game still open — a
// surrender/forfeit, a cancellation, an expiry — says so instead of claiming
// a clock is still running on a finished set.
function unfinishedGameLabel({ gameNumber, inProgress }: UnfinishedGame, lang: Lang) {
  if (inProgress) {
    return lang === "es" ? `Juego ${gameNumber} en curso…` : `Game ${gameNumber} in progress…`;
  }
  return lang === "es" ? `Juego ${gameNumber} — sin terminar` : `Game ${gameNumber} — not finished`;
}

// Streams a side's channel in the pinned player: the Twitch mark plus the
// channel name, as a button rather than a link out — clicking selects the
// stream and scrolls back to the top so viewers stay on the page. Stops
// propagation so it doesn't also toggle the row open. Styled as a Twitch-purple
// pill that fills in while this side is the one embedded up top.
function OpenStreamButton({ player, matchId, lang }: { player: FeedPlayer; matchId: string; lang: Lang }) {
  const { selection, select } = useLiveStreamSelection();
  if (!player.twitchUsername) return null;
  const name = player.twitchDisplayName ?? player.username;
  const selected = selection?.matchId === matchId && selection?.playerId === player.id;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        select(matchId, player.id);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      onKeyDown={(event) => event.stopPropagation()}
      aria-pressed={selected}
      aria-label={`${lang === "es" ? "Abrir stream" : "Open stream"}: ${name}`}
      className={cn(
        "inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
        selected
          ? "border-twitch bg-twitch text-white"
          : "border-twitch/50 text-twitch hover:border-twitch hover:bg-twitch/10",
      )}
    >
      <TwitchIcon className="size-3.5 shrink-0" />
      <span className="truncate">{name}</span>
    </button>
  );
}

// One side of the set: character, the username with its rating tier, and the
// rating/region line. Mirrored only from sm up — on phones both sides stack
// left-aligned, where a mirrored second row would read as a separate column
// rather than the opponent across the score. The tier badge follows the name on
// phones, and sits on the inside (toward the score) from sm up.
function Side({
  player,
  align,
  viewerIsModerator = false,
  className,
}: {
  player: FeedPlayer;
  align: "left" | "right";
  viewerIsModerator?: boolean;
  className?: string;
}) {
  const isRight = align === "right";
  // A provisional player's rating isn't public (see isRatingVisible) — the
  // feed would otherwise be the easiest place to read a brand-new player's
  // number off. Moderators keep seeing it. The tier badge beside the name
  // already reads "Provisional" for them, so the number line drops the word
  // rather than repeating it.
  const ratingVisible = isRatingVisible(player.gamesPlayed, viewerIsModerator);
  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2", isRight && "sm:flex-row-reverse", className)}>
      {player.currentCharacter ? (
        <CharacterIcon name={player.currentCharacter} size={28} />
      ) : (
        <span aria-hidden className="size-7 shrink-0 rounded-full border border-dashed border-border" />
      )}
      <Link
        href={`/players/${player.id}`}
        prefetch={false}
        onClick={(e) => e.stopPropagation()}
        title={player.username}
        className={cn(
          "flex min-w-0 flex-col rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring",
          isRight && "sm:items-end",
        )}
      >
        <span className={cn("flex min-w-0 items-center gap-1", isRight && "sm:justify-end")}>
          <span className="min-w-0 truncate font-medium">{player.username}</span>
          <RankBadge
            rating={player.rating}
            gamesPlayed={player.gamesPlayed}
            className={cn("px-1.5 py-0 text-[10px]", isRight && "sm:order-first")}
          />
        </span>
        <span
          className={cn("flex min-w-0 items-center gap-1 text-xs text-muted-foreground", isRight && "sm:justify-end")}
        >
          {ratingVisible && <span className="tabular-nums">{formatRating(player.rating)}</span>}
          {player.region && (
            <span className="flex min-w-0 items-center gap-0.5">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{player.region}</span>
            </span>
          )}
        </span>
      </Link>
    </div>
  );
}

// One finished game inside a set — reads left-to-right like the score line of
// a match-history entry: winner gets the check + solid text, loser is muted.
// The stage the game was played on sits under the game number when it was
// recorded (decided games always have one; still-in-progress games don't).
function GameLine({
  entry,
  game,
  lang,
}: {
  entry: SerializedSetEntry;
  game: MatchFeedEntry["games"][number];
  lang: Lang;
}) {
  const p1Won = game.winnerId === entry.player1.id;
  const p2Won = game.winnerId === entry.player2.id;
  const decided = p1Won || p2Won;
  // actorA/actorB are per-game and do NOT always line up with player1/player2:
  // from game 2 on, the previous game's winner strikes first as actor A. So
  // each side's character has to be looked up by actor id, not by column.
  const p1Character = game.actorAId === entry.player1.id ? game.actorACharacter : game.actorBCharacter;
  const p2Character = game.actorAId === entry.player2.id ? game.actorACharacter : game.actorBCharacter;

  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-sm sm:gap-3 sm:px-3">
      <span className="flex w-14 shrink-0 flex-col sm:w-24">
        <span className="text-xs tabular-nums text-muted-foreground">
          {lang === "es" ? `Juego ${game.gameNumber}` : `Game ${game.gameNumber}`}
        </span>
        {game.finalStage && (
          <span title={game.finalStage} className="truncate text-[10px] leading-4 text-muted-foreground/60">
            {game.finalStage}
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {p1Character ? (
          <CharacterIcon name={p1Character} size={18} />
        ) : (
          <span aria-hidden className="size-[18px] shrink-0 rounded-full border border-dashed border-border" />
        )}
        <span className={cn("truncate", p1Won ? "font-medium text-foreground" : "text-muted-foreground")}>
          {entry.player1.username}
        </span>
        {/* The W/L badges between the names already say who won each game, and
            on a phone the check costs the truncating username real width — so
            it's kept for sm and up only. */}
        {p1Won && <Check className="size-3.5 shrink-0 text-emerald-500 max-sm:hidden" aria-hidden />}
      </span>

      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        {decided ? (
          <>
            <Badge variant={p1Won ? "success" : "destructive"} className="w-5 justify-center px-0 text-[10px]">
              {p1Won ? "W" : "L"}
            </Badge>
            <span aria-hidden>vs</span>
            <Badge variant={p2Won ? "success" : "destructive"} className="w-5 justify-center px-0 text-[10px]">
              {p2Won ? "W" : "L"}
            </Badge>
          </>
        ) : (
          <span aria-hidden>vs</span>
        )}
      </span>

      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        {p2Won && <Check className="size-3.5 shrink-0 text-emerald-500 max-sm:hidden" aria-hidden />}
        <span className={cn("truncate", p2Won ? "font-medium text-foreground" : "text-muted-foreground")}>
          {entry.player2.username}
        </span>
        {p2Character ? (
          <CharacterIcon name={p2Character} size={18} />
        ) : (
          <span aria-hidden className="size-[18px] shrink-0 rounded-full border border-dashed border-border" />
        )}
      </span>
    </div>
  );
}
