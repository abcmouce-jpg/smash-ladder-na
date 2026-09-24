"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { FeedPlayer, SerializedSetEntry } from "@/lib/set-entry";

// A picked stream, identified by both the set and the side, so the two
// channels of a doubly-streamed set are distinct selections.
export type LiveStreamSelection = { matchId: string; playerId: string } | null;

// The side to feature when nothing has been picked yet — player 1 when both
// happen to be streaming. Both flags imply a Twitch channel (see match-feed).
export function preferredStreamer(entry: SerializedSetEntry): FeedPlayer | null {
  if (entry.player1Live) return entry.player1;
  if (entry.player2Live) return entry.player2;
  return null;
}

// Resolves a selection against the current live entries. Falls back to the
// first live set when the picked stream is gone — e.g. its set finished and
// dropped out of the list between polls.
export function resolveLiveStream(entries: SerializedSetEntry[], selection: LiveStreamSelection) {
  if (selection) {
    const entry = entries.find((e) => e.id === selection.matchId);
    if (entry) {
      // Only a side the feed still reports as live. A stale pick — that channel
      // went offline since the last poll, or the other side of the set is the
      // one still streaming — must not keep an offline embed on screen.
      if (selection.playerId === entry.player1.id && entry.player1Live && entry.player1.twitchUsername) {
        return { entry, player: entry.player1 };
      }
      if (selection.playerId === entry.player2.id && entry.player2Live && entry.player2.twitchUsername) {
        return { entry, player: entry.player2 };
      }
    }
  }

  const first = entries[0];
  if (!first) return null;
  const player = preferredStreamer(first);
  return player?.twitchUsername ? { entry: first, player } : null;
}

type LiveStreamContextValue = {
  selection: LiveStreamSelection;
  select: (matchId: string, playerId: string) => void;
};

const LiveStreamContext = createContext<LiveStreamContextValue | null>(null);

// Shared by the home page and the Live page so a pick made anywhere (a
// thumbnail, or a feed row's "Open stream" button) drives the single pinned
// player at the top of the page.
export function LiveStreamProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<LiveStreamSelection>(null);
  const select = useCallback((matchId: string, playerId: string) => setSelection({ matchId, playerId }), []);
  const value = useMemo(() => ({ selection, select }), [selection, select]);

  return <LiveStreamContext.Provider value={value}>{children}</LiveStreamContext.Provider>;
}

export function useLiveStreamSelection() {
  const context = useContext(LiveStreamContext);
  if (!context) throw new Error("useLiveStreamSelection must be used within a LiveStreamProvider");
  return context;
}
