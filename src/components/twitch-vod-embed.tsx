// Twitch's embed player for a past broadcast (VOD), as opposed to the live
// channel player in twitch-live-embed.tsx. Same `parent` hostname requirement,
// but keyed by video id with an optional time offset so the player opens at the
// moment the set started rather than the top of a multi-hour stream.
//
// Two Twitch-specific details: the player's `video` param needs a "v" prefix on
// the id (the Get Videos API returns it unprefixed), and the offset uses the
// `time` param in "1h2m3s" form. Autoplay defaults to true on the embed, so
// it's explicitly disabled — opening a match's details shouldn't start a video.
import { formatTwitchTime } from "@/lib/twitch-vod";
import { twitchParent } from "@/lib/stream-links";

export function TwitchVodEmbed({
  videoId,
  offsetSeconds = 0,
  parentHost,
  title,
}: {
  videoId: string;
  offsetSeconds?: number;
  parentHost: string;
  title?: string;
}) {
  const params = new URLSearchParams({ video: `v${videoId}`, parent: twitchParent(parentHost), autoplay: "false" });
  if (offsetSeconds > 0) params.set("time", formatTwitchTime(offsetSeconds));

  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg">
      <iframe
        src={`https://player.twitch.tv/?${params.toString()}`}
        allowFullScreen
        className="h-full w-full"
        title={title ?? "Twitch replay"}
      />
    </div>
  );
}
