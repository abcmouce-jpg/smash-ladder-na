"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Radio } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// Was TwitchLiveEmbed. Both platforms are an <iframe>, they just build their
// src differently — Twitch needs the embedding hostname in a `parent` param
// (production, a preview deployment and localhost all differ), YouTube does
// not — so the URL is built by the StreamLink and this only renders it.
//
// Takes the finished `embedUrl` string rather than the StreamLink, because
// StreamLink.embedUrl is a function and a Server Component cannot hand a
// function across the boundary to a Client Component. One of the two callers
// is a server one (players/[id]/profile-header.tsx), so passing the link
// itself threw on exactly the profiles that had a stream to show — a player's
// own page 500'd while they were live, which is when people visit it. Keeping
// the prop a string makes that a compile error instead of a runtime one.
//
// Collapsed by default: the match feed can stack several live entries, and
// mounting a full-size video player for each one at once was overwhelming
// the page. Pass `collapsible={false}` to skip the toggle card and render
// the player directly, for callers that only ever show one at a time.
export function LiveStreamEmbed({
  embedUrl,
  title,
  collapsible = true,
}: {
  embedUrl: string;
  title: string;
  collapsible?: boolean;
}) {
  const [expanded, setExpanded] = useState(!collapsible);
  const player = (
    <div className="aspect-video w-full overflow-hidden rounded-lg">
      <iframe src={embedUrl} allowFullScreen className="h-full w-full" title={title} />
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
