// Where a player's stream lives, and how to embed it.
//
// Both supported platforms are now detected automatically:
//
//   Twitch — lib/twitch-helix.ts batches up to 100 channels into one Helix call,
//   so checking every player in the feed costs one request.
//
//   YouTube — lib/youtube-oauth.ts uses the connected account's own OAuth token
//   to call liveBroadcasts.list?mine=true, which costs 1 quota unit. The
//   search.list alternative (100 units per channel) is what made an earlier
//   version ask players to paste a link instead of just connecting an account.
//
// This module holds the pure, testable part: the types and URL builders. The
// network/database halves live in those two modules so they can fail closed
// independently.

import { formatTwitchTime, twitchVideoUrl } from "@/lib/twitch-vod";

export type StreamPlatform = "twitch" | "youtube";

/**
 * A stream a player is live on right now.
 *
 * Serialized across the server→client boundary in match-feed entries, so it is
 * plain data only — no functions. Embed URLs are built from it where needed.
 */
export type LiveStreamInfo =
  | { platform: "twitch"; login: string; displayName: string }
  | { platform: "youtube"; videoId: string; channelId: string; displayName: string };

/**
 * The `parent` value Twitch's player expects for the given Host header.
 *
 * Twitch validates `parent` against the exact hostname serving the iframe and
 * rejects anything that isn't a bare hostname — the colon in the port that
 * local dev puts in `Host` (`localhost:3000`) fails as InvalidCharInParent, so
 * it has to be stripped. Loopback addresses are reported to Twitch as
 * `localhost`, which is the one development hostname it accepts.
 */
export function twitchParent(parentHost: string): string {
  const bare = parentHost
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "") // defensive: a full origin, not just a host
    .split(/[/?#]/)[0]; // and anything after it
  if (!bare) return "";

  // An IPv6 literal arrives bracketed, as "[::1]:3000".
  const closeBracket = bare.indexOf("]");
  const hostname =
    bare.startsWith("[") && closeBracket !== -1 ? bare.slice(0, closeBracket + 1) : bare.replace(/:\d+$/, "");

  if (hostname === "127.0.0.1" || hostname === "[::1]") return "localhost";
  return hostname.toLowerCase();
}

/** A Twitch channel detected as live, with no URL to parse. */
export function twitchStream(login: string, displayName?: string | null): LiveStreamInfo {
  const channel = login.toLowerCase();
  return { platform: "twitch", login: channel, displayName: displayName || channel };
}

/** A YouTube broadcast detected as live via the channel's OAuth grant. */
export function youtubeStream(videoId: string, channelId: string, displayName?: string | null): LiveStreamInfo {
  return { platform: "youtube", videoId, channelId, displayName: displayName || channelId };
}

/** Stable identity for a stream, used by the feed's selection state. */
export function liveStreamKey(stream: LiveStreamInfo): string {
  return stream.platform === "twitch" ? `twitch:${stream.login}` : `youtube:${stream.videoId}`;
}

/** Where a viewer goes to watch the stream directly on its platform. */
export function liveStreamWatchUrl(stream: LiveStreamInfo): string {
  return stream.platform === "twitch"
    ? `https://www.twitch.tv/${stream.login}`
    : `https://www.youtube.com/watch?v=${stream.videoId}`;
}

/** What an <iframe> loads for a live stream. Twitch needs the embedding host. */
export function liveStreamEmbedUrl(stream: LiveStreamInfo, parentHost: string): string {
  if (stream.platform === "twitch") {
    const params = new URLSearchParams({
      channel: stream.login,
      parent: twitchParent(parentHost),
      muted: "true",
    });
    return `https://player.twitch.tv/?${params.toString()}`;
  }
  return `https://www.youtube.com/embed/${stream.videoId}`;
}

/** Human platform name, for labels and error copy. */
export function streamPlatformName(platform: StreamPlatform): string {
  return platform === "twitch" ? "Twitch" : "YouTube";
}

/** The URL a player's channel page uses, for the profile's badges. */
export function twitchChannelUrl(login: string): string {
  return `https://www.twitch.tv/${login.toLowerCase()}`;
}

export function youtubeChannelUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${channelId}`;
}

/** A YouTube video opened at the set's start, mirroring twitchVideoUrl. */
export function youtubeVideoUrl(videoId: string, offsetSeconds: number | null): string {
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  return offsetSeconds && offsetSeconds > 0 ? `${base}&t=${Math.floor(offsetSeconds)}s` : base;
}

/** Public watch URL for a captured replay, on either platform. */
export function streamVodWatchUrl(platform: StreamPlatform, vodId: string, offsetSeconds: number | null): string {
  return platform === "twitch" ? twitchVideoUrl(vodId, offsetSeconds) : youtubeVideoUrl(vodId, offsetSeconds);
}

/** Embed URL for a captured replay, on either platform. */
export function streamVodEmbedUrl(
  platform: StreamPlatform,
  vodId: string,
  offsetSeconds: number | null,
  parentHost: string,
): string {
  if (platform === "twitch") {
    // Twitch's player needs a "v" prefix on the id (Get Videos returns it
    // unprefixed) and its own "1h2m3s" time format.
    const params = new URLSearchParams({ video: `v${vodId}`, parent: twitchParent(parentHost), autoplay: "false" });
    if (offsetSeconds && offsetSeconds > 0) params.set("time", formatTwitchTime(offsetSeconds));
    return `https://player.twitch.tv/?${params.toString()}`;
  }

  const params = new URLSearchParams({ autoplay: "0" });
  if (offsetSeconds && offsetSeconds > 0) params.set("start", String(Math.floor(offsetSeconds)));
  return `https://www.youtube.com/embed/${vodId}?${params.toString()}`;
}
