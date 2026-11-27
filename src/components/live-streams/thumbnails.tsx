"use client";

import Link from "next/link";
import { ArrowRight, Radio } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { CharacterIcon } from "@/components/character-icon";
import { cn } from "@/lib/utils";
import type { LiveStreamInfo } from "@/lib/stream-links";
import type { FeedPlayer, SerializedSetEntry } from "@/lib/set-entry";
import { resolveLiveStream, useLiveStreamSelection } from "./selection";
import { StreamPlatformIcon } from "./platform-icon";
import { tr } from "@/lib/lang";

// How many live stream thumbnails the home page shows before pointing at the
// full Sets feed for the rest.
const MAX_THUMBNAILS = 10;

// Every live channel, not every live set: a set both players are streaming
// yields one thumbnail per player, and a player live on Twitch and YouTube at
// once yields one per platform so either channel can be picked.
function liveStreams(entries: SerializedSetEntry[]) {
  const streams: { entry: SerializedSetEntry; player: FeedPlayer; stream: LiveStreamInfo }[] = [];
  for (const entry of entries) {
    for (const player of [entry.player1, entry.player2]) {
      for (const stream of player.liveStreams ?? []) streams.push({ entry, player, stream });
    }
  }
  return streams;
}

// Horizontal strip of live channels under the featured player. Picking one
// swaps the player above; when more channels exist than the cap allows, the
// last tile links out to the Live page.
export function LiveStreamThumbnails({ entries, lang }: { entries: SerializedSetEntry[]; lang: Lang }) {
  const { selection, select } = useLiveStreamSelection();
  const active = resolveLiveStream(entries, selection);
  const streams = liveStreams(entries);
  const shown = streams.slice(0, MAX_THUMBNAILS);
  const hasMore = streams.length > MAX_THUMBNAILS;

  return (
    <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-slim sm:-mx-6 sm:px-6">
      {shown.map(({ entry, player, stream }) => (
        <Thumbnail
          key={`${entry.id}:${player.id}:${stream.platform}`}
          entry={entry}
          player={player}
          stream={stream}
          active={
            active?.entry.id === entry.id &&
            active.player.id === player.id &&
            active.stream.platform === stream.platform
          }
          onSelect={() => select(entry.id, player.id, stream.platform)}
        />
      ))}
      {hasMore && (
        <Link
          href="/live"
          className="flex w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-2 py-3 text-center text-xs font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          {tr(lang, { en: "Show more", es: "Ver más" })}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}

// One channel's thumbnail. The platform mark and channel name sit above the two
// players so the tile says whose stream it is before saying what set it carries.
// Both players and the score are shown so the set is recognizable, but the live
// icon marks only the player this thumbnail's stream belongs to — that's what
// tells two same-set thumbnails apart.
function Thumbnail({
  entry,
  player,
  stream,
  active,
  onSelect,
}: {
  entry: SerializedSetEntry;
  player: FeedPlayer;
  stream: LiveStreamInfo;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "flex w-48 shrink-0 flex-col gap-1.5 rounded-lg border bg-card p-2 text-left transition-colors hover:border-foreground/30",
        active ? "border-red-500/60 ring-1 ring-red-500/40" : "border-border",
      )}
    >
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5 text-xs font-medium",
          stream.platform === "twitch" ? "text-twitch" : "text-red-600 dark:text-red-500",
        )}
      >
        <StreamPlatformIcon platform={stream.platform} className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{stream.displayName}</span>
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <ThumbnailPlayer player={entry.player1} streaming={entry.player1.id === player.id} />
          <ThumbnailPlayer player={entry.player2} streaming={entry.player2.id === player.id} />
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {entry.wins.player1}–{entry.wins.player2}
        </span>
      </span>
    </button>
  );
}

function ThumbnailPlayer({ player, streaming }: { player: FeedPlayer; streaming: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {player.currentCharacter ? (
        <CharacterIcon name={player.currentCharacter} size={18} />
      ) : (
        <span aria-hidden className="size-4.5 shrink-0 rounded-full border border-dashed border-border" />
      )}
      <span className={cn("min-w-0 truncate text-xs", streaming && "font-medium")}>{player.username}</span>
      {streaming && <Radio className="size-3 shrink-0 text-red-500" aria-hidden />}
    </span>
  );
}
