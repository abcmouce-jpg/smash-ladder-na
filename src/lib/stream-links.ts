// Where a player's stream lives, and how to embed it.
//
// Twitch liveness is detected automatically (lib/twitch-helix.ts batches up to
// 100 channels into one Helix call, so checking every player in the feed costs
// one request). YouTube has no equivalent: the only "is this channel live"
// endpoint is search.list at 100 quota units per channel per call, against a
// default allowance of 10,000 units a day — enough to poll a single channel
// every five minutes for about four hours before the whole project is cut off
// for the day. So YouTube streams are declared rather than detected: the
// player pastes the URL of the stream they are running, and it expires on its
// own so a forgotten link doesn't badge them live forever.

export type StreamPlatform = "twitch" | "youtube";

export type StreamLink = {
  platform: StreamPlatform;
  /** Where a viewer goes to watch it. */
  watchUrl: string;
  /** What an <iframe> loads. Needs the embedding host for Twitch. */
  embedUrl: (parentHost: string) => string;
  /** For display: the channel or video this points at. */
  label: string;
};

/**
 * How long a declared stream link counts as live.
 *
 * Long enough to cover a session someone forgets to clear, short enough that a
 * stale link isn't still pinning them to the top of the feed the next day.
 */
export const LIVE_DECLARATION_TTL_MS = 6 * 60 * 60 * 1000;

const YOUTUBE_VIDEO_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const TWITCH_HOSTS = new Set(["twitch.tv", "www.twitch.tv", "m.twitch.tv"]);

// A YouTube video id is 11 characters of the URL-safe base64 alphabet. Pinning
// the length rejects a channel id (UC… , 24 chars) pasted into a /live/ path.
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/;
const TWITCH_LOGIN = /^[A-Za-z0-9_]{3,25}$/;

function youtubeVideoLink(videoId: string): StreamLink {
  return {
    platform: "youtube",
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    embedUrl: () => `https://www.youtube.com/embed/${videoId}`,
    label: videoId,
  };
}

function youtubeChannelLink(channelId: string): StreamLink {
  return {
    platform: "youtube",
    watchUrl: `https://www.youtube.com/channel/${channelId}/live`,
    // YouTube's own "whatever this channel is streaming right now" embed, for
    // a link that names a channel rather than one broadcast.
    embedUrl: () => `https://www.youtube.com/embed/live_stream?channel=${channelId}`,
    label: channelId,
  };
}

function twitchLink(login: string): StreamLink {
  const channel = login.toLowerCase();
  return {
    platform: "twitch",
    watchUrl: `https://www.twitch.tv/${channel}`,
    // Twitch's player refuses to load unless `parent` matches the hostname
    // serving the iframe, which differs between production, a preview
    // deployment and localhost — hence the parameter.
    embedUrl: (parentHost) =>
      `https://player.twitch.tv/?channel=${encodeURIComponent(channel)}&parent=${encodeURIComponent(parentHost)}&muted=true`,
    label: channel,
  };
}

/**
 * Reads a pasted stream URL. Returns null for anything that isn't a Twitch or
 * YouTube link this can actually embed — the caller shows that as a validation
 * error rather than storing a URL the player will find does nothing.
 */
export function parseStreamUrl(input: string): StreamLink | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const id = segments[0];
    return id && YOUTUBE_VIDEO_ID.test(id) ? youtubeVideoLink(id) : null;
  }

  if (YOUTUBE_VIDEO_HOSTS.has(host)) {
    const v = url.searchParams.get("v");
    if (v && YOUTUBE_VIDEO_ID.test(v)) return youtubeVideoLink(v);

    // /live/VIDEOID — what the share button gives during a broadcast.
    if (segments[0] === "live" && segments[1] && YOUTUBE_VIDEO_ID.test(segments[1])) {
      return youtubeVideoLink(segments[1]);
    }
    // /channel/UC…/live — the channel's current broadcast, whatever it is.
    // The /live suffix is required: a bare channel page is not a stream, and
    // embedding one as though it were shows the viewer nothing.
    if (segments[0] === "channel" && segments[1] && segments[2] === "live" && YOUTUBE_CHANNEL_ID.test(segments[1])) {
      return youtubeChannelLink(segments[1]);
    }
    return null;
  }

  if (TWITCH_HOSTS.has(host)) {
    const login = segments[0];
    return login && TWITCH_LOGIN.test(login) ? twitchLink(login) : null;
  }

  return null;
}

/** The link for a Twitch channel detected as live, with no URL to parse. */
export function twitchStreamLink(login: string): StreamLink {
  return twitchLink(login);
}

/**
 * Whether a declared link still counts. Separate from parsing so the feed can
 * ask about freshness without re-parsing, and so the TTL lives in one place.
 */
export function isDeclarationFresh(setAt: Date | null | undefined, now = Date.now()): boolean {
  if (!setAt) return false;
  const age = now - setAt.getTime();
  return age >= 0 && age < LIVE_DECLARATION_TTL_MS;
}

/**
 * The stream to show for a player in the feed.
 *
 * A declared link wins over a detected Twitch channel: someone who pasted a
 * URL is telling us where they are right now, which may well be a different
 * account from the one they connected.
 */
export function playerStreamLink(player: {
  twitchUsername?: string | null;
  liveStreamUrl?: string | null;
  liveStreamAt?: Date | string | null;
}): StreamLink | null {
  const setAt = typeof player.liveStreamAt === "string" ? new Date(player.liveStreamAt) : (player.liveStreamAt ?? null);
  if (player.liveStreamUrl && isDeclarationFresh(setAt)) {
    const link = parseStreamUrl(player.liveStreamUrl);
    if (link) return link;
  }
  return player.twitchUsername ? twitchStreamLink(player.twitchUsername) : null;
}
