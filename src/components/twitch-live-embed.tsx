"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Radio } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// Twitch's embed player requires a `parent` query param matching the exact
// hostname it's served from (production, a preview deployment, or
// localhost all differ) — passed in from the page via headers() since
// there's no single fixed site-URL env var in this project.
//
// Collapsed by default: the match feed can stack several live entries, and
// mounting a full-size video player for each one at once was overwhelming
// the page. Pass `collapsible={false}` to skip the toggle card and render
// the player directly, for callers that only ever show one at a time.
export function TwitchLiveEmbed({
  username,
  parentHost,
  collapsible = true,
}: {
  username: string;
  parentHost: string;
  collapsible?: boolean;
}) {
  const [expanded, setExpanded] = useState(!collapsible);
  const src = `https://player.twitch.tv/?channel=${encodeURIComponent(username)}&parent=${encodeURIComponent(parentHost)}&muted=true`;
  const player = (
    <div className="aspect-video w-full overflow-hidden rounded-lg">
      <iframe src={src} allowFullScreen className="h-full w-full" title={`${username}'s Twitch stream`} />
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
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="flex w-full cursor-pointer items-center gap-1.5 text-sm font-medium"
        >
          <Radio className="size-4 text-red-500" />
          Live on Twitch
          {expanded ? (
            <ChevronDown className="size-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 text-muted-foreground" />
          )}
        </button>
        {expanded && <div className="mt-2">{player}</div>}
      </CardContent>
    </Card>
  );
}
