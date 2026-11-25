"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { LiveStreamInfo, StreamPlatform } from "@/lib/stream-links";
import type { FeedPlayer, SerializedSetEntry } from "@/lib/set-entry";

// A picked stream, identified by the set, the side, and which platform of that
// side's streams — a player can be live on Twitch and YouTube at once, and the
// two are distinct selections.
export type LiveStreamSelection = { matchId: string; playerId: string; platform: StreamPlatform } | null;

// The stream to feature when nothing has been picked yet — player 1 when both
// sides happen to be streaming. Twitch is listed first per side (see
// match-feed), so a player live on both defaults to their Twitch channel.
export function preferredStream(entry: SerializedSetEntry): { player: FeedPlayer; stream: LiveStreamInfo } | null {
  const first = entry.player1.liveStreams?.[0];
  if (first) return { player: entry.player1, stream: first };
  const second = entry.player2.liveStreams?.[0];
  if (second) return { player: entry.player2, stream: second };
  return null;
}

// Resolves a selection against the current live entries. Falls back to the
// first live set when the picked stream is gone — e.g. its set finished and
// dropped out of the list between polls.
export function resolveLiveStream(
  entries: SerializedSetEntry[],
  selection: LiveStreamSelection,
): { entry: SerializedSetEntry; player: FeedPlayer; stream: LiveStreamInfo } | null {
  if (selection) {
    const entry = entries.find((e) => e.id === selection.matchId);
    if (entry) {
      const player =
        entry.player1.id === selection.playerId
          ? entry.player1
          : entry.player2.id === selection.playerId
            ? entry.player2
            : null;
      // Only a stream the feed still reports as live. A stale pick — that
      // channel went offline since the last poll, or a different platform is
      // the one still streaming — must not keep an offline embed on screen.
      const stream = player?.liveStreams.find((s) => s.platform === selection.platform);
      if (player && stream) return { entry, player, stream };
    }
  }

  const first = entries[0];
  if (!first) return null;
  const preferred = preferredStream(first);
  return preferred ? { entry: first, ...preferred } : null;
}

type LiveStreamContextValue = {
  selection: LiveStreamSelection;
  select: (matchId: string, playerId: string, platform: StreamPlatform) => void;
};

const LiveStreamContext = createContext<LiveStreamContextValue | null>(null);

// Shared by the home page and the Live page so a pick made anywhere (a
// thumbnail, or a feed row's stream button) drives the single pinned player at
// the top of the page.
//
// initialSelection is the pick the stage would resolve to on its own before any
// click (see resolveLiveStream) — seeding it here means the feed row for the
// currently-open stream can mark itself selected from the first render instead
// of only after a click.
export function LiveStreamProvider({
  children,
  initialSelection = null,
}: {
  children: ReactNode;
  initialSelection?: LiveStreamSelection;
}) {
  const [selection, setSelection] = useState<LiveStreamSelection>(initialSelection);
  const select = useCallback(
    (matchId: string, playerId: string, platform: StreamPlatform) => setSelection({ matchId, playerId, platform }),
    [],
  );
  const value = useMemo(() => ({ selection, select }), [selection, select]);

  return <LiveStreamContext.Provider value={value}>{children}</LiveStreamContext.Provider>;
}

export function useLiveStreamSelection() {
  const context = useContext(LiveStreamContext);
  if (!context) throw new Error("useLiveStreamSelection must be used within a LiveStreamProvider");
  return context;
}
