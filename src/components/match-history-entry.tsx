"use client";

import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CharacterIcon } from "@/components/character-icon";
import { LocalTime } from "@/components/local-time";
import { MatchChatLog } from "@/components/match-chat-log";
import { cn } from "@/lib/utils";
import type { MatchHistoryEntryData } from "@/lib/players";

// The page hands this component the same entry getPlayerMatchHistory
// returns, except confirmedAt must be serialized to an ISO string first
// (Dates can't cross the server→client boundary).
export type SerializedMatchHistoryEntryData = Omit<MatchHistoryEntryData, "confirmedAt"> & {
  confirmedAt: string | null;
};

function ResultChip({ won }: { won: boolean }) {
  return (
    <span
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-semibold",
        won ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 text-destructive",
      )}
      aria-label={won ? "Win" : "Loss"}
    >
      {won ? "W" : "L"}
    </span>
  );
}

// Character line: "your characters vs their characters" with small icons.
function CharactersLine({ mine, theirs, lang }: { mine: string[]; theirs: string[]; lang?: "en" | "es" }) {
  if (mine.length === 0 && theirs.length === 0) return null;
  return (
    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      {mine.length > 0 ? (
        <span className="flex min-w-0 items-center gap-1">
          {mine.slice(0, 3).map((c) => (
            <CharacterIcon key={c} name={c} size={16} />
          ))}
          {mine.length > 3 && <span className="tabular-nums">+{mine.length - 3}</span>}
        </span>
      ) : (
        <span aria-hidden className="size-4" />
      )}
      <span className="text-muted-foreground/60">{lang === "es" ? "contra" : "vs"}</span>
      {theirs.length > 0 ? (
        <span className="flex min-w-0 items-center gap-1">
          {theirs.slice(0, 3).map((c) => (
            <CharacterIcon key={c} name={c} size={16} />
          ))}
          {theirs.length > 3 && <span className="tabular-nums">+{theirs.length - 3}</span>}
        </span>
      ) : (
        <span aria-hidden className="size-4" />
      )}
    </span>
  );
}

// One confirmed match in the profile page's match-history list. The summary
// lines are clickable and open a details modal (same visual language as the
// confirm dialog) showing every game of the set — characters, stage, winner
// — plus the match's chat log when the viewer is allowed to see it. The
// result-correction / admin-override controls that live below the summary
// are passed through as `children` so the row's existing server-rendered
// actions keep working unchanged. Needs to be a Client Component because the
// modal's open state is local to this row.
export function MatchHistoryEntry({
  match,
  viewedPlayerName,
  chatLogAction,
  children,
  lang = "en",
}: {
  match: SerializedMatchHistoryEntryData;
  /** Username of the player whose profile this is — labels their side of each game card. */
  viewedPlayerName: string;
  /** Bound server action for loading the match's chat, when the viewer may see it. */
  chatLogAction?: ComponentProps<typeof MatchChatLog>["action"];
  children?: ReactNode;
  lang?: "en" | "es";
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  const { score, delta } = match;
  const hasScore = score.wins > 0 || score.losses > 0;

  return (
    <div className="px-3 py-2 sm:px-4 sm:py-2.5">
      <div
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="cursor-pointer rounded-lg px-1 py-1 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring sm:px-1.5"
      >
        <div className="flex items-center gap-2.5 sm:gap-3">
          <ResultChip won={match.won} />

          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-1.5 text-sm">
              <span className="shrink-0 text-xs text-muted-foreground">vs</span>
              <Link
                href={`/players/${match.opponent.id}`}
                onClick={(e) => e.stopPropagation()}
                className="truncate font-medium text-foreground hover:underline"
              >
                {match.opponent.username}
              </Link>
              {match.isPracticing && (
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                  {lang === "es" ? "Práctica" : "Practice"}
                </Badge>
              )}
            </p>
            <CharactersLine mine={match.characters} theirs={match.opponentCharacters} lang={lang} />
          </div>

          <div className="flex shrink-0 flex-col items-end gap-0.5">
            <span className="flex items-baseline gap-2">
              {hasScore && (
                <span className="text-sm font-semibold tabular-nums">
                  {score.wins}–{score.losses}
                </span>
              )}
              {match.ratingBefore != null && (
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    match.isPracticing
                      ? "text-muted-foreground"
                      : delta > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : delta < 0
                          ? "text-destructive"
                          : "text-muted-foreground",
                  )}
                >
                  {delta > 0 ? "+" : ""}
                  {delta}
                </span>
              )}
            </span>
            {match.confirmedAt && (
              <span className="text-xs tabular-nums text-muted-foreground">
                <LocalTime iso={match.confirmedAt} />
              </span>
            )}
          </div>
        </div>
      </div>

      {children}

      {open && (
        <MatchDetailsModal
          match={match}
          viewedPlayerName={viewedPlayerName}
          chatLogAction={chatLogAction}
          onClose={close}
          lang={lang}
        />
      )}
    </div>
  );
}

// Read-only match-details modal — same visual language as the confirm dialog
// (portaled backdrop + card panel, Escape to close), but it lists every game
// of the set: characters, stage, and winner, plus the match's chat log (lazy-
// loaded on expand). The panel scrolls as a whole so long chat logs don't
// overflow the viewport. Games that never got a decided winner (disputed or
// admin-reset) are shown as such instead of being silently dropped, so the
// modal reflects the full set that was played. Kept as a plain internal
// function (not exported) so its onClose callback never looks like a
// server-action prop to Next's client-boundary checks.
function MatchDetailsModal({
  match,
  viewedPlayerName,
  chatLogAction,
  onClose,
  lang = "en",
}: {
  match: SerializedMatchHistoryEntryData;
  viewedPlayerName: string;
  chatLogAction?: ComponentProps<typeof MatchChatLog>["action"];
  onClose: () => void;
  lang?: "en" | "es";
}) {
  // Close on Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const { score } = match;
  const hasScore = score.wins > 0 || score.losses > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Match vs ${match.opponent.username}`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Panel */}
      <div className="relative mx-4 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-card-foreground">
              {lang === "es" ? "Detalles de la partida" : "Match details"}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {match.isPracticing && <Badge variant="outline">{lang === "es" ? "Práctica" : "Practice"}</Badge>}
              <span className="font-medium">
                {viewedPlayerName} <span className="text-muted-foreground">{lang === "es" ? "contra" : "vs"}</span>{" "}
                {match.opponent.username}
              </span>
              {hasScore && (
                <span className="font-semibold tabular-nums">
                  {score.wins}–{score.losses}
                </span>
              )}
            </p>
          </div>
          <ResultChip won={match.won} />
        </div>

        {match.confirmedAt && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            <LocalTime iso={match.confirmedAt} />
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {match.games.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {lang === "es"
                ? "No se registró ningún juego para esta partida."
                : "No games were recorded for this set."}
            </p>
          )}
          {match.games.map((game) => (
            <div key={game.gameNumber} className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {lang === "es" ? `Juego ${game.gameNumber}` : `Game ${game.gameNumber}`}
                {game.stage ? `: ${game.stage}` : ""}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                  <span className="text-xs font-medium text-foreground">{viewedPlayerName}</span>
                  <span className="flex items-center gap-1.5 text-sm">
                    {game.character && <CharacterIcon name={game.character} size={20} />}
                    {game.character ?? "—"}
                  </span>
                </div>
                {/* Winner's side gets a green W, loser's side a red L; no
                    indicator when the game has no decided winner. */}
                <div className="flex items-center gap-1.5">
                  {game.won !== null ? (
                    <>
                      <Badge variant={game.won ? "success" : "destructive"} className="w-6 justify-center">
                        {game.won ? "W" : "L"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">vs</span>
                      <Badge variant={game.won ? "destructive" : "success"} className="w-6 justify-center">
                        {game.won ? "L" : "W"}
                      </Badge>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">vs</span>
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col items-end gap-0.5">
                  <span className="text-xs font-medium text-foreground">{match.opponent.username}</span>
                  <span className="flex items-center gap-1.5 text-sm">
                    {game.opponentCharacter ?? "—"}
                    {game.opponentCharacter && <CharacterIcon name={game.opponentCharacter} size={20} />}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {chatLogAction && (
          <div className="mt-4">
            <MatchChatLog action={chatLogAction} lang={lang} />
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {lang === "es" ? "Cerrar" : "Close"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
