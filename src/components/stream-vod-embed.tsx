import { streamVodEmbedUrl, type StreamPlatform } from "@/lib/stream-links";

// Embed for a captured replay on either platform. Twitch needs the embedding
// host in its player URL and a "v"-prefixed video id; YouTube takes the bare
// video id and a `start` offset. Both details live in streamVodEmbedUrl so the
// two callers can't drift.
export function StreamVodEmbed({
  platform,
  videoId,
  offsetSeconds = 0,
  parentHost,
  title,
}: {
  platform: StreamPlatform;
  videoId: string;
  offsetSeconds?: number;
  parentHost: string;
  title?: string;
}) {
  return (
    <div className="aspect-video w-full overflow-hidden rounded-lg">
      <iframe
        src={streamVodEmbedUrl(platform, videoId, offsetSeconds, parentHost)}
        allowFullScreen
        className="h-full w-full"
        title={title ?? "Replay"}
      />
    </div>
  );
}
