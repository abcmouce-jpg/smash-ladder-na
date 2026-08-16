"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Radio } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// Twitch's embed player requires a `parent` query param matching the exact
// hostname it's served from (production, a preview deployment, or
// localhost all differ) — passed in from the page via headers() since
// there's no single fixed site-URL env var in this project.
//
// Collapsed by default: this renders inline on the match feed, where
// several live entries stacking full-size video players at once was
// overwhelming the page. Starts as just the clickable "Live on Twitch"
// header; the iframe (and its network/CPU cost) only mounts once someone
// actually asks to see it.
export function TwitchLiveEmbed({ username, parentHost }: { username: string; parentHost: string }) {
  const [expanded, setExpanded] = useState(false);
  const src = `https://player.twitch.tv/?channel=${encodeURIComponent(username)}&parent=${encodeURIComponent(parentHost)}&muted=true`;

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
        {expanded && (
          <div className="mt-2 aspect-video w-full overflow-hidden rounded-lg">
            <iframe src={src} allowFullScreen className="h-full w-full" title={`${username}'s Twitch stream`} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
