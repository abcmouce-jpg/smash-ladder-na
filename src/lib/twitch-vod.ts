// Past-broadcast (VOD) shapes and the pure matching logic, shared by the Helix
// client (twitch-helix.ts) and the replay resolver (match-streams.ts). Kept in
// its own module — with no database or Next request machinery — so it can be
// unit-tested directly.

// A past broadcast from Helix's /videos endpoint, reduced to what the replay
// embed needs. `createdAt` is the stream's start and `durationSeconds` its
// length — together they define the window a match has to fall inside to be
// part of this VOD.
export interface TwitchVideo {
  id: string;
  userId: string;
  userLogin: string;
  createdAt: Date;
  durationSeconds: number;
  url: string;
}

// Twitch returns durations as a compact "1h2m3s" / "45m" / "30s" string.
// Unparseable/empty input yields 0 (treated as a zero-length VOD that simply
// never matches a set).
export function parseTwitchDuration(duration: string): number {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(duration.trim());
  if (!match) return 0;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

// Formats a second count as Twitch's "1h2m3s" offset string — used by both the
// embed player's `time` param and the twitch.tv `t` query string.
export function formatTwitchTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `${hours}h${minutes}m${seconds}s`;
}

// Public watch URL for a VOD, opening at the set's start when known. Shared by
// the profile's match details and the Live feed's expanded rows.
export function twitchVideoUrl(videoId: string, offsetSeconds: number | null): string {
  const base = `https://www.twitch.tv/videos/${videoId}`;
  return offsetSeconds && offsetSeconds > 0 ? `${base}?t=${formatTwitchTime(offsetSeconds)}` : base;
}

// Twitch timestamps and ours can be a little apart; a set whose end sits just
// outside a VOD's window is still treated as covered.
const VOD_CLOCK_SLACK_MS = 5 * 60 * 1000;

// The set's end can land a few seconds before the VOD's recorded start (clock
// skew, or the report landing as the broadcast begins), but a VOD that started
// well after the set finished cannot contain it. Keeping this much smaller than
// VOD_CLOCK_SLACK_MS stops a later stream's broadcast from being mistaken for
// the one the set was played on.
const VOD_START_SLACK_MS = 60 * 1000;

export interface CoveringVideo {
  video: TwitchVideo;
  offsetSeconds: number;
}

// Whether a VOD is still being written. Twitch lists the in-progress broadcast
// in /videos while a channel is live, with a duration that grows as the stream
// runs — so a window that reaches "now" isn't final yet, and an id/offset
// resolved against it can change once Twitch finalizes the archive.
export function isVideoStillOpen(video: TwitchVideo, now = Date.now()): boolean {
  const videoEndMs = video.createdAt.getTime() + video.durationSeconds * 1000;
  return videoEndMs >= now - VOD_CLOCK_SLACK_MS;
}

// Given a channel's archived VODs and a set's [start, end], picks the VOD that
// covers it and how far into that VOD the set begins. A VOD covers the set when
// the set's END falls inside the VOD's window (that's when the stream was
// captured as live); the offset is measured from the set's START and clamped
// into the VOD, so a set that began before the stream did opens at 0. Returns
// null when no VOD covers the set.
export function findCoveringVideo(
  videos: readonly TwitchVideo[],
  matchStartedAt: Date,
  matchEndedAt: Date,
): CoveringVideo | null {
  const endedMs = matchEndedAt.getTime();
  for (const video of videos) {
    const videoStartMs = video.createdAt.getTime();
    const videoEndMs = videoStartMs + video.durationSeconds * 1000;
    if (endedMs < videoStartMs - VOD_START_SLACK_MS || endedMs > videoEndMs + VOD_CLOCK_SLACK_MS) continue;
    const offsetSeconds = Math.min(
      Math.max(Math.floor((matchStartedAt.getTime() - videoStartMs) / 1000), 0),
      video.durationSeconds,
    );
    return { video, offsetSeconds };
  }
  return null;
}
