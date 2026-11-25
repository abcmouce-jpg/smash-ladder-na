"use client";

import { useState } from "react";
import { ExternalLink, Radio } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StreamPlatformIcon } from "@/components/live-streams/platform-icon";
import {
  liveStreamEmbedUrl,
  liveStreamKey,
  liveStreamWatchUrl,
  streamPlatformName,
  type LiveStreamInfo,
} from "@/lib/stream-links";
import { cn } from "@/lib/utils";
import { tr } from "@/lib/lang";
import type { Lang } from "@/lib/i18n";

// The profile's "Live now" card. One tab per platform the player is streaming
// on — a player linked to both Twitch and YouTube can be live on both at once,
// and each carries a different channel and embed. A single live platform still
// shows its name and mark, just without anything to switch between.
export function ProfileLiveCard({
  streams,
  parentHost,
  lang,
}: {
  streams: LiveStreamInfo[];
  parentHost: string;
  lang: Lang;
}) {
  const [selectedKey, setSelectedKey] = useState(() => liveStreamKey(streams[0]));
  const active = streams.find((stream) => liveStreamKey(stream) === selectedKey) ?? streams[0];
  const multiple = streams.length > 1;

  return (
    <Card className="mt-4">
      <CardContent className="pt-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Radio className="size-4 text-red-500" />
          {tr(lang, { en: "Live now", es: "En vivo ahora" })}
        </p>

        <div
          role={multiple ? "tablist" : undefined}
          aria-label={tr(lang, { en: "Live streams", es: "Streams en vivo" })}
          className="mt-2 flex flex-wrap gap-1.5"
        >
          {streams.map((stream) => {
            const key = liveStreamKey(stream);
            const selected = key === liveStreamKey(active);
            const palette =
              stream.platform === "twitch"
                ? {
                    selected: "border-twitch bg-twitch text-white",
                    idle: "border-twitch/50 text-twitch hover:border-twitch hover:bg-twitch/10",
                  }
                : {
                    selected: "border-red-600 bg-red-600 text-white",
                    idle: "border-red-600/50 text-red-600 hover:border-red-600 hover:bg-red-600/10",
                  };
            const contents = (
              <>
                <StreamPlatformIcon platform={stream.platform} className="size-3.5 shrink-0" />
                <span className="max-w-48 truncate">{stream.displayName}</span>
              </>
            );

            if (!multiple) {
              return (
                <span
                  key={key}
                  className={cn(
                    "inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
                    palette.selected,
                  )}
                >
                  {contents}
                </span>
              );
            }

            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setSelectedKey(key)}
                className={cn(
                  "inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors",
                  selected ? palette.selected : palette.idle,
                )}
              >
                {contents}
              </button>
            );
          })}
        </div>

        <div className="mt-3 aspect-video w-full overflow-hidden rounded-lg">
          <iframe
            src={liveStreamEmbedUrl(active, parentHost)}
            allowFullScreen
            className="h-full w-full"
            title={active.displayName}
          />
        </div>

        <a
          href={liveStreamWatchUrl(active)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-xs font-medium hover:underline",
            active.platform === "twitch" ? "text-twitch" : "text-red-600",
          )}
        >
          {tr(lang, {
            en: `Watch on ${streamPlatformName(active.platform)}`,
            es: `Ver en ${streamPlatformName(active.platform)}`,
          })}
          <ExternalLink className="size-3" aria-hidden />
        </a>
      </CardContent>
    </Card>
  );
}
