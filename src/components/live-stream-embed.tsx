"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Radio } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { StreamLink } from "@/lib/stream-links";

// Was TwitchLiveEmbed. Both platforms are an <iframe>, they just build their
// src differently — Twitch needs the embedding hostname in a `parent` param
// (production, a preview deployment and localhost all differ), YouTube does
// not — so the URL is built by the StreamLink and this only renders it.
//
// Collapsed by default: the match feed can stack several live entries, and
// mounting a full-size video player for each one at once was overwhelming
// the page. Pass `collapsible={false}` to skip the toggle card and render
// the player directly, for callers that only ever show one at a time.
export function LiveStreamEmbed({
  link,
  title,
  parentHost,
  collapsible = true,
}: {
  link: StreamLink;
  title: string;
  parentHost: string;
  collapsible?: boolean;
}) {
  const [expanded, setExpanded] = useState(!collapsible);
  const player = (
    <div className="aspect-video w-full overflow-hidden rounded-lg">
      <iframe src={link.embedUrl(parentHost)} allowFullScreen className="h-full w-full" title={title} />
    </div>
  );

  if (!collapsible) {
    return <div className="mt-4">{player}</div>;
  }

  return (
    <Card className="mt-4">
      <CardContent className="pt-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2 text-sm font-medium text-foreground"
        >
          <Radio className="size-4 text-red-500" />
          <span className="flex-1 text-left">{title}</span>
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
        {expanded && <div className="mt-3">{player}</div>}
      </CardContent>
    </Card>
  );
}
