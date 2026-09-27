"use client";

import Link from "next/link";
import { Radio } from "lucide-react";
import { CharacterIcon } from "@/components/character-icon";
import { TwitchLiveEmbed } from "@/components/twitch-live-embed";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n";
import type { FeedPlayer, SerializedSetEntry } from "@/lib/set-entry";
import { resolveLiveStream, useLiveStreamSelection } from "./selection";
import { SetRow } from "./set-row";

// The featured streamer's player plus the set it belongs to. Shared by the
// home page and the Live page: on Live the pick comes from the feed's stream
// buttons, on the home page from the thumbnail strip underneath.
//
// setCard swaps the compact scoreboard below the player for the full feed-row
// card (see SetRow), so on the Live page the set under the embed reads exactly
// like the same set in the list further down.
export function LiveStreamStage({
  entries,
  parentHost,
  lang = "en",
  viewerIsModerator = false,
  setCard = false,
}: {
  entries: SerializedSetEntry[];
  parentHost: string;
  lang?: Lang;
  viewerIsModerator?: boolean;
  setCard?: boolean;
}) {
  const { selection } = useLiveStreamSelection();
  const active = resolveLiveStream(entries, selection);
  const channel = active?.player.twitchUsername;
  if (!active || !channel) return null;

  const { entry, player } = active;

  return (
    <div>
      <TwitchLiveEmbed
        key={`${entry.id}:${player.id}`}
        username={channel}
        parentHost={parentHost}
        collapsible={false}
      />

      {setCard ? (
        <div className="mt-3">
          <SetRow entry={entry} lang={lang} viewerIsModerator={viewerIsModerator} />
        </div>
      ) : (
        <MatchDetails entry={entry} />
      )}
    </div>
  );
}

// Compact scoreboard under the player: both usernames (linked to their
// profiles), their current characters, and the running score. Stacked on
// phones for the same reason as the feed rows — see SetRow.
function MatchDetails({ entry }: { entry: SerializedSetEntry }) {
  return (
    <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-x-2 gap-y-1.5 rounded-lg border border-border bg-card px-3 py-2.5 sm:flex sm:items-center sm:gap-3 sm:px-4">
      <PlayerSide player={entry.player1} live={entry.player1Live} align="left" className="col-start-1 row-start-1" />
      <span className="col-start-2 row-span-2 row-start-1 shrink-0 text-base leading-none font-semibold tabular-nums">
        {entry.wins.player1}–{entry.wins.player2}
      </span>
      <PlayerSide player={entry.player2} live={entry.player2Live} align="right" className="col-start-1 row-start-2" />
    </div>
  );
}

function PlayerSide({
  player,
  live,
  align,
  className,
}: {
  player: FeedPlayer;
  live: boolean;
  align: "left" | "right";
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
      <span className={cn("flex min-w-0 items-center gap-1", isRight && "sm:justify-end")}>
        <Link href={`/players/${player.id}`} prefetch={false} className="min-w-0 truncate font-medium hover:underline">
          {player.username}
        </Link>
        {live && <Radio className="size-3 shrink-0 text-red-500" aria-hidden />}
      </span>
    </div>
  );
}
