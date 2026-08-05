"use client";

import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CharacterIcon } from "@/components/character-icon";
import { LocalTime } from "@/components/local-time";
import { MatchChatLog } from "@/components/match-chat-log";
import type { MatchHistoryEntryData } from "@/lib/players";

// The page hands this component the same entry getPlayerMatchHistory
// returns, except confirmedAt must be serialized to an ISO string first
// (Dates can't cross the server→client boundary).
export type SerializedMatchHistoryEntryData = Omit<MatchHistoryEntryData, "confirmedAt"> & {
  confirmedAt: string | null;
};

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
}: {
  match: SerializedMatchHistoryEntryData;
  /** Username of the player whose profile this is — labels their side of each game card. */
  viewedPlayerName: string;
  /** Bound server action for loading the match's chat, when the viewer may see it. */
  chatLogAction?: ComponentProps<typeof MatchChatLog>["action"];
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="px-4 py-2.5 text-sm">
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
        className="cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Badge variant={match.won ? "success" : "destructive"} className="w-6 justify-center">
              {match.won ? "W" : "L"}
            </Badge>
            {match.isPracticing && <Badge variant="outline">Practice</Badge>}
            vs{" "}
            <Link
              href={`/players/${match.opponent.id}`}
              onClick={(e) => e.stopPropagation()}
              className="hover:underline"
            >
              {match.opponent.username}
            </Link>
            {(match.score.wins > 0 || match.score.losses > 0) && (
              <span className="tabular-nums text-muted-foreground">
                {match.score.wins}–{match.score.losses}
              </span>
            )}
          </span>
          <span className="tabular-nums text-muted-foreground">
            {match.ratingBefore} → {match.ratingAfter} ({match.delta >= 0 ? "+" : ""}
            {match.delta}
            {match.isPracticing ? ", practice" : ""})
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {match.characters.length > 0 ? match.characters.join(", ") : "—"}
            {match.opponentCharacters.length > 0 && <> vs {match.opponentCharacters.join(", ")}</>}
          </span>
          {match.confirmedAt && <LocalTime iso={match.confirmedAt} />}
        </div>
      </div>

      {children}

      {open && (
        <MatchDetailsModal
          match={match}
          viewedPlayerName={viewedPlayerName}
          chatLogAction={chatLogAction}
          onClose={close}
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
}: {
  match: SerializedMatchHistoryEntryData;
  viewedPlayerName: string;
  chatLogAction?: ComponentProps<typeof MatchChatLog>["action"];
  onClose: () => void;
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
            <p className="text-sm font-medium text-card-foreground">Match details</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {match.isPracticing && <Badge variant="outline">Practice</Badge>}
              <span className="font-medium">vs {match.opponent.username}</span>
              {(match.score.wins > 0 || match.score.losses > 0) && (
                <span className="tabular-nums text-muted-foreground">
                  {match.score.wins}–{match.score.losses}
                </span>
              )}
            </p>
          </div>
          <Badge variant={match.won ? "success" : "destructive"} className="w-6 justify-center">
            {match.won ? "W" : "L"}
          </Badge>
        </div>

        {match.confirmedAt && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            <LocalTime iso={match.confirmedAt} />
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          {match.games.length === 0 && (
            <p className="text-sm text-muted-foreground">No games were recorded for this set.</p>
          )}
          {match.games.map((game) => (
            <div key={game.gameNumber} className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Game {game.gameNumber}
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
            <MatchChatLog action={chatLogAction} />
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
