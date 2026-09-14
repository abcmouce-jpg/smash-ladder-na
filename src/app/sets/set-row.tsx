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

// Dates can't cross the server→client boundary, so the page serializes them
// before handing entries to this client row.
export type SerializedSetEntry = Omit<MatchFeedEntry, "createdAt" | "confirmedAt"> & {
  createdAt: string;
  confirmedAt: string | null;
};

type FeedPlayer = MatchFeedEntry["player1"];

export const STATUS_LABEL: Record<string, { en: string; es: string }> = {
  PENDING_REPORT: { en: "In progress", es: "En curso" },
  REPORTED: { en: "In progress", es: "En curso" },
  DISPUTED: { en: "Disputed", es: "En disputa" },
  CONFIRMED: { en: "Final", es: "Final" },
  CANCELLED: { en: "Cancelled", es: "Cancelada" },
  EXPIRED: { en: "Expired", es: "Expirada" },
};

export const STATUS_VARIANT: Record<string, "success" | "warning" | "outline"> = {
  PENDING_REPORT: "success",
  REPORTED: "success",
  DISPUTED: "warning",
  CONFIRMED: "outline",
  CANCELLED: "outline",
  EXPIRED: "outline",
};

// Expandable feed row. The collapsed header summarizes the set (both
// players, current score, status); clicking anywhere except the player-name
// links reveals the per-game progress underneath, in the same compact
// scoreboard style as a profile's match history. Rows with no games yet
// still open — they just say the set hasn't started — and any side that is
// live gets a "watch on Twitch" link up top. In-progress sets that nobody
// is streaming get a green left-edge accent so scanners notice them among
// the finished rows.
export function SetRow({ entry, lang }: { entry: SerializedSetEntry; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const label = STATUS_LABEL[entry.status];
  const decidedGames = entry.games.filter((g) => g.winnerId !== null);
  const ongoingGame = entry.games.find((g) => g.winnerId === null) ?? null;
  const hasGames = decidedGames.length > 0 || ongoingGame !== null;
  const unstreamedInProgress =
    !entry.hasLiveStreamer && (entry.status === "PENDING_REPORT" || entry.status === "REPORTED");

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
        <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
          <Side player={entry.player1} live={entry.player1Live} align="left" />

          <div className="flex shrink-0 flex-col items-center gap-1">
            <span className="text-base leading-none font-semibold tabular-nums">
              {entry.wins.player1}–{entry.wins.player2}
            </span>
            <ChevronDown
              aria-hidden
              className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")}
            />
          </div>

          <Side player={entry.player2} live={entry.player2Live} align="right" />
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
              {ongoingGame && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span aria-hidden className="size-1.5 rounded-full bg-muted-foreground/60" />
                  {lang === "es"
                    ? `Juego ${ongoingGame.gameNumber} en curso…`
                    : `Game ${ongoingGame.gameNumber} in progress…`}
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

function Side({
  player,
  live,
  align,
}: {
  player: FeedPlayer;
  live: boolean;
  align: "left" | "right";
}) {
  const isRight = align === "right";
  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2", isRight && "flex-row-reverse")}>
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
          isRight && "items-end",
        )}
      >
        <span className={cn("flex min-w-0 items-center gap-1", isRight && "justify-end")}>
          <span className="min-w-0 truncate font-medium">{player.username}</span>
          {live && <Radio className="size-3 shrink-0 text-red-500" />}
        </span>
        <span className={cn("flex min-w-0 items-center gap-1 text-xs text-muted-foreground", isRight && "justify-end")}>
          <span className="tabular-nums">{player.rating}</span>
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
        {game.actorACharacter ? (
          <CharacterIcon name={game.actorACharacter} size={18} />
        ) : (
          <span aria-hidden className="size-[18px] shrink-0 rounded-full border border-dashed border-border" />
        )}
        <span className={cn("truncate", p1Won ? "font-medium text-foreground" : "text-muted-foreground")}>
          {entry.player1.username}
        </span>
        {p1Won && <Check className="size-3.5 shrink-0 text-emerald-500" aria-hidden />}
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
        {p2Won && <Check className="size-3.5 shrink-0 text-emerald-500" aria-hidden />}
        <span className={cn("truncate", p2Won ? "font-medium text-foreground" : "text-muted-foreground")}>
          {entry.player2.username}
        </span>
        {game.actorBCharacter ? (
          <CharacterIcon name={game.actorBCharacter} size={18} />
        ) : (
          <span aria-hidden className="size-[18px] shrink-0 rounded-full border border-dashed border-border" />
        )}
      </span>
    </div>
  );
}
