"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ExternalLink, Radio } from "lucide-react";
import type { Lang } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TwitchLiveEmbed } from "@/components/twitch-live-embed";
import { STATUS_LABEL, STATUS_VARIANT, type SerializedSetEntry } from "./set-row";

// Which side of a set the pinned "watch now" card features — same preference
// as the page's single-live-entry card: player 1 when both happen to be live.
function streamerFor(entry: SerializedSetEntry) {
  if (entry.player1Live) return entry.player1;
  if (entry.player2Live) return entry.player2;
  return null;
}

// Pinned "watch now" carousel for sets where one side is currently
// streaming. With several live entries stacked vertically the page was
// mounting a whole row of collapsed Twitch embeds at once, so when there
// are 2+ live sets this shows one featured streamer per slide (name, link
// out to Twitch, opponent + score, the embed) with prev/next navigation
// instead. Only the active slide's TwitchLiveEmbed is mounted.
export function LiveStreamsCarousel({
  entries,
  parentHost,
  lang,
}: {
  entries: SerializedSetEntry[];
  parentHost: string;
  lang: Lang;
}) {
  const [index, setIndex] = useState(0);
  const count = entries.length;
  // The page re-renders on every poll tick and the live list can shrink
  // while this client state persists, so clamp instead of trusting `index`.
  const safeIndex = Math.min(index, count - 1);
  const entry = entries[safeIndex];
  const streamer = streamerFor(entry);
  if (!streamer?.twitchUsername) return null;
  const opponent = streamer.id === entry.player1.id ? entry.player2 : entry.player1;
  const label = STATUS_LABEL[entry.status];
  const hasGames = entry.games.some((g) => g.winnerId !== null);

  const goTo = (next: number) => setIndex(((next % count) + count) % count);
  const prevLabel = lang === "es" ? "Partida en vivo anterior" : "Previous live set";
  const nextLabel = lang === "es" ? "Siguiente partida en vivo" : "Next live set";

  return (
    <Card className="border-red-500/30">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between gap-3">
          <a
            href={`https://twitch.tv/${streamer.twitchUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-red-500 hover:underline"
          >
            <Radio className="size-4 shrink-0" />
            <span className="truncate">
              {streamer.twitchDisplayName ?? streamer.username} {lang === "es" ? "está en vivo" : "is live"}
            </span>
            <ExternalLink className="size-3 shrink-0" />
          </a>
          <Badge variant={STATUS_VARIANT[entry.status] ?? "outline"} className="shrink-0">
            {lang === "es" ? label?.es : label?.en}
          </Badge>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          <Link href={`/players/${streamer.id}`} className="font-medium text-foreground hover:underline">
            {streamer.username}
          </Link>{" "}
          {lang === "es" ? "contra" : "vs"}{" "}
          <Link href={`/players/${opponent.id}`} className="font-medium text-foreground hover:underline">
            {opponent.username}
          </Link>
          {hasGames && (
            <span className="tabular-nums">
              {" "}
              ({entry.wins.player1}–{entry.wins.player2})
            </span>
          )}
        </p>

        <div className="mt-3 flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => goTo(safeIndex - 1)}
            aria-label={prevLabel}
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <span aria-live="polite" className="w-14 text-center text-xs tabular-nums text-muted-foreground">
            {safeIndex + 1} / {count}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => goTo(safeIndex + 1)}
            aria-label={nextLabel}
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>

        <TwitchLiveEmbed key={entry.id} username={streamer.twitchUsername} parentHost={parentHost} />
      </CardContent>
    </Card>
  );
}
