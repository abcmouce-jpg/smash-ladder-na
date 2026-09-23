"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ExternalLink, MapPin, Radio } from "lucide-react";
import type { MatchFeedEntry } from "@/lib/match-feed";
import type { Lang } from "@/lib/i18n";
import { CharacterIcon } from "@/components/character-icon";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  STATUS_LABEL,
  STATUS_VARIANT,
  getUnfinishedGame,
  isSetLive,
  type FeedPlayer,
  type SerializedSetEntry,
  type UnfinishedGame,
} from "@/lib/set-entry";
import { OpenStreamButton } from "@/components/live-streams/open-stream-button";

// Expandable feed row. The collapsed header summarizes the set (both
// players, current score, status); clicking anywhere except the player-name
// links reveals the per-game progress underneath, in the same compact
// scoreboard style as a profile's match history. Rows with no games yet
// still open — they just say the set hasn't started — and any side that is
// live gets an "Open stream" button that drives the pinned player at the top
// of the page. In-progress sets that nobody is streaming get a green
// left-edge accent so scanners notice them among the finished rows.
export function SetRow({ entry, lang }: { entry: SerializedSetEntry; lang: Lang }) {
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
            line left no room for the stream button, which spilled over the
            score and the usernames. From sm up the mirrored scoreboard is
            back. */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1.5 px-3 py-2.5 sm:flex sm:items-center sm:gap-3 sm:px-4">
          <Side
            player={entry.player1}
            live={entry.player1Live}
            align="left"
            matchId={entry.id}
            lang={lang}
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
            live={entry.player2Live}
            align="right"
            matchId={entry.id}
            lang={lang}
            className="col-start-1 row-start-2"
          />
        </div>

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
          {(entry.player1Live || entry.player2Live) && (
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {entry.player1Live && <WatchLiveLink player={entry.player1} lang={lang} />}
              {entry.player2Live && <WatchLiveLink player={entry.player2} lang={lang} />}
            </div>
          )}
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

// Link out to a side's Twitch stream, shown when that side is flagged live.
function WatchLiveLink({ player, lang }: { player: FeedPlayer; lang: Lang }) {
  if (!player.twitchUsername) return null;
  const name = player.twitchDisplayName ?? player.username;
  return (
    <a
      href={`https://twitch.tv/${player.twitchUsername}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${lang === "es" ? "Ver en vivo" : "Watch live"}: ${name}`}
      className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-red-500 hover:underline"
    >
      <Radio aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate">{name}</span>
      <ExternalLink aria-hidden className="size-3 shrink-0 text-muted-foreground" />
    </a>
  );
}

// One side of the set: character, username/rating, and the stream button when
// that side is live. Mirrored only from sm up — on phones both sides stack
// left-aligned, where a mirrored second row would read as a separate column
// rather than the opponent across the score.
function Side({
  player,
  live,
  align,
  matchId,
  lang,
  className,
}: {
  player: FeedPlayer;
  live: boolean;
  align: "left" | "right";
  matchId: string;
  lang: Lang;
  className?: string;
}) {
  const isRight = align === "right";
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
        </span>
        <span
          className={cn("flex min-w-0 items-center gap-1 text-xs text-muted-foreground", isRight && "sm:justify-end")}
        >
          <span className="tabular-nums">{player.rating}</span>
          {player.region && (
            <span className="flex min-w-0 items-center gap-0.5">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{player.region}</span>
            </span>
          )}
        </span>
      </Link>
      {live && <OpenStreamButton matchId={matchId} playerId={player.id} lang={lang} />}
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
