import { after } from "next/server";
import { prisma } from "@/lib/db";
import { StreamPlatform } from "@/generated/prisma/enums";
import { getLiveTwitchUsernames, getTwitchVideos } from "@/lib/twitch-helix";
import { getLiveYouTubeStreams } from "@/lib/youtube-oauth";
import { findCoveringVideo, isVideoStillOpen, type TwitchVideo } from "@/lib/twitch-vod";
import type { MatchStreamSummary } from "@/lib/players";

// One side of a match, with just what capture needs to know about them. Handed
// in from applyEloAndConfirm, which already has both User rows loaded.
export interface MatchStreamCandidate {
  id: string;
  twitchUserId: string | null;
  twitchLogin: string | null;
  youtubeUserId: string | null;
}

// Defers the live-status checks past the confirming transaction via
// next/server's after() — they're network calls, so they must never run inside
// the transaction or block the confirm response. after() throws outside a real
// request scope (integration tests, one-off scripts), which is a deliberate
// no-op here, same reasoning as deferTierChange in rank-roles.ts.
export function deferMatchStreamCapture(matchId: string, players: readonly MatchStreamCandidate[]) {
  try {
    after(() => captureMatchStreams(matchId, players));
  } catch {
    // Outside a request scope — nothing to defer to.
  }
}

// Best-effort: records a MatchStream row for each side that was live on Twitch
// or YouTube as the set finished. A failure here only means the set won't offer
// a replay, never a failed confirm — so it swallows everything rather than
// throwing out of the deferred callback.
//
// Twitch's VOD id isn't knowable until the broadcast ends, so that row is
// resolved later (resolveStreamVods). YouTube's liveBroadcasts lookup already
// returns the broadcast's video id, and a live video keeps the same id once it
// becomes a VOD — so the replay can be recorded immediately, with the offset
// measured from the broadcast's actual start.
export async function captureMatchStreams(matchId: string, players: readonly MatchStreamCandidate[]) {
  try {
    const matchStartedAt =
      (await prisma.ratingMatch.findUnique({ where: { id: matchId }, select: { createdAt: true } }))?.createdAt ??
      new Date();

    const twitchCandidates = players.filter((p) => p.twitchUserId && p.twitchLogin);
    const youtubeCandidates = players.filter((p) => p.youtubeUserId);

    const [liveTwitch, liveYouTube] = await Promise.all([
      twitchCandidates.length > 0
        ? getLiveTwitchUsernames(twitchCandidates.map((p) => p.twitchLogin as string))
        : Promise.resolve(new Set<string>()),
      getLiveYouTubeStreams(youtubeCandidates.map((p) => p.id)),
    ]);

    const now = new Date();
    const rows: {
      matchId: string;
      userId: string;
      platform: StreamPlatform;
      platformUserId: string;
      platformLogin: string;
      vodId?: string;
      vodOffsetSeconds?: number;
      vodResolvedAt?: Date;
    }[] = [];

    for (const player of twitchCandidates) {
      if (!liveTwitch.has((player.twitchLogin as string).toLowerCase())) continue;
      rows.push({
        matchId,
        userId: player.id,
        platform: StreamPlatform.TWITCH,
        platformUserId: player.twitchUserId as string,
        platformLogin: (player.twitchLogin as string).toLowerCase(),
      });
    }

    for (const player of players) {
      const youtube = liveYouTube.get(player.id);
      if (!youtube) continue;
      rows.push({
        matchId,
        userId: player.id,
        platform: StreamPlatform.YOUTUBE,
        platformUserId: youtube.channelId,
        platformLogin: youtube.channelId,
        vodId: youtube.videoId,
        vodOffsetSeconds: Math.max(0, Math.floor((matchStartedAt.getTime() - youtube.startedAt.getTime()) / 1000)),
        vodResolvedAt: now,
      });
    }

    if (rows.length === 0) return;
    await prisma.matchStream.createMany({ data: rows, skipDuplicates: true });
  } catch (err) {
    console.error("captureMatchStreams failed (non-fatal — no replay link for this set):", err);
  }
}

// A match older than this can't have a Twitch VOD any more — Twitch keeps past
// broadcasts for at most ~60 days (Partners; everyone else gets 14) — so
// there's no point asking Helix about it again.
const VOD_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

// How long to wait before re-asking Helix about a stream we already checked and
// couldn't resolve. An archive isn't guaranteed to exist the moment a set is
// confirmed, so a miss is retried on a later view instead of never.
const VOD_RECHECK_MS = 30 * 60 * 1000;

// In-process cache of a channel's recent VOD list, so one render that touches
// several of a streamer's matches (and back-to-back renders) doesn't re-hit
// Helix each time. Only successful lookups are cached; a failure retries on the
// next call, same as the live-status cache in twitch-helix.ts.
const VIDEOS_CACHE_TTL_MS = 5 * 60 * 1000;
const videosCache = new Map<string, { videos: TwitchVideo[]; expiresAt: number }>();

// The UI-facing summary uses the lowercase platform union from stream-links
// while the database stores Prisma's enum; map at the boundary so callers never
// have to know about "TWITCH" vs "twitch".
function platformFor(row: { platform: StreamPlatform }): "twitch" | "youtube" {
  return row.platform === StreamPlatform.TWITCH ? "twitch" : "youtube";
}

async function getCachedVideos(twitchUserId: string): Promise<TwitchVideo[] | null> {
  const cached = videosCache.get(twitchUserId);
  if (cached && cached.expiresAt > Date.now()) return cached.videos;
  const videos = await getTwitchVideos(twitchUserId);
  if (videos) videosCache.set(twitchUserId, { videos, expiresAt: Date.now() + VIDEOS_CACHE_TTL_MS });
  return videos;
}

type ResolvableStream = {
  id: string;
  userId: string;
  platform: StreamPlatform;
  platformUserId: string;
  platformLogin: string;
  vodId: string | null;
  vodOffsetSeconds: number | null;
  vodResolvedAt: Date | null;
  vodCheckedAt: Date | null;
  match: { createdAt: Date; confirmedAt: Date | null };
};

// Resolves the replay for each match in `entries` and attaches it as
// `entry.streams`, so every entry ends up with the field populated (empty when
// the set had no captured stream). Callers that need replays call this; the
// plain getPlayerMatchHistory that the lobby's streak badge and the stream
// overlay use never does, so they pay for none of this. Works on any entry with
// an id and a streams slot, which lets the Live feed's rows use it too.
export async function attachMatchStreams(entries: { id: string; streams: MatchStreamSummary[] }[]): Promise<void> {
  // Best-effort: a replay is a bonus, so a lookup failure (a network hiccup, or
  // the table not yet migrated on a stale deployment) must leave the history
  // rendering normally rather than 500 the whole profile.
  try {
    const byMatch = await resolveMatchStreams(entries.map((e) => e.id));
    for (const entry of entries) entry.streams = byMatch.get(entry.id) ?? [];
  } catch (err) {
    console.error("attachMatchStreams failed (non-fatal — replays just won't show):", err);
  }
}

async function resolveMatchStreams(matchIds: string[]): Promise<Map<string, MatchStreamSummary[]>> {
  const byMatch = new Map<string, MatchStreamSummary[]>();
  if (matchIds.length === 0) return byMatch;

  const rows = await prisma.matchStream.findMany({
    where: { matchId: { in: matchIds } },
    orderBy: { capturedAt: "asc" },
    select: {
      id: true,
      matchId: true,
      userId: true,
      platform: true,
      platformUserId: true,
      platformLogin: true,
      vodId: true,
      vodOffsetSeconds: true,
      vodResolvedAt: true,
      vodCheckedAt: true,
      match: { select: { createdAt: true, confirmedAt: true } },
    },
  });

  await resolveStreamVods(rows);

  for (const row of rows) {
    const summary: MatchStreamSummary = {
      userId: row.userId,
      platform: platformFor(row),
      platformLogin: row.platformLogin,
      vodId: row.vodId,
      vodOffsetSeconds: row.vodOffsetSeconds,
    };
    const list = byMatch.get(row.matchId);
    if (list) list.push(summary);
    else byMatch.set(row.matchId, [summary]);
  }

  return byMatch;
}

// Fills in vodId/vodOffsetSeconds for every Twitch row that's still pending,
// batching the Helix lookups one call per streamer. YouTube rows are resolved
// at capture time and are skipped. Updates `rows` in place so the caller can
// build its summaries straight off them. Wrapped so a network or DB hiccup just
// leaves the rows unresolved (no replay shown) rather than failing the whole
// profile render.
async function resolveStreamVods(rows: ResolvableStream[], now = new Date()) {
  const nowMs = now.getTime();
  const pending = rows.filter(
    (r) =>
      r.platform === StreamPlatform.TWITCH &&
      r.vodResolvedAt === null &&
      r.match.confirmedAt !== null &&
      nowMs - r.match.confirmedAt.getTime() <= VOD_RETENTION_MS &&
      (r.vodCheckedAt === null || nowMs - r.vodCheckedAt.getTime() >= VOD_RECHECK_MS),
  );
  if (pending.length === 0) return;

  // One Helix call per streamer, no matter how many of their sets are on the page.
  const byStreamer = new Map<string, ResolvableStream[]>();
  for (const row of pending) {
    const list = byStreamer.get(row.platformUserId);
    if (list) list.push(row);
    else byStreamer.set(row.platformUserId, [row]);
  }

  try {
    for (const [twitchUserId, streamRows] of byStreamer) {
      const videos = await getCachedVideos(twitchUserId);
      // Helix failed for this streamer — leave every one of their rows
      // unchecked so a later view retries rather than recording a false
      // "no VOD" that would stick for VOD_RECHECK_MS.
      if (videos === null) continue;

      for (const row of streamRows) {
        const confirmedAt = row.match.confirmedAt;
        if (!confirmedAt) continue;

        const resolved = findCoveringVideo(videos, row.match.createdAt, confirmedAt);
        // Twitch reports the in-progress broadcast in /videos with a duration
        // that grows as the stream runs; freezing that entry can leave a stale
        // id/offset once Twitch finalizes the archive (the replay looks fine
        // while live, then breaks when the stream ends). Leaving the row
        // unchecked means the first view after the broadcast ends resolves it
        // against the final VOD — no VOD_RECHECK_MS wait.
        if (resolved && isVideoStillOpen(resolved.video, nowMs)) continue;

        row.vodCheckedAt = now;
        if (resolved) {
          row.vodId = resolved.video.id;
          row.vodOffsetSeconds = resolved.offsetSeconds;
          row.vodResolvedAt = now;
        }

        await prisma.matchStream.update({
          where: { id: row.id },
          data: {
            vodId: row.vodId,
            vodOffsetSeconds: row.vodOffsetSeconds,
            vodResolvedAt: row.vodResolvedAt,
            vodCheckedAt: row.vodCheckedAt,
          },
        });
      }
    }
  } catch (err) {
    console.error("resolveStreamVods failed (non-fatal — replays just won't show):", err);
  }
}
