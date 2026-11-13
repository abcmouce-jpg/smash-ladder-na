import { after } from "next/server";
import { prisma } from "@/lib/db";
import { getLiveTwitchUsernames, getTwitchVideos } from "@/lib/twitch-helix";
import { findCoveringVideo, type TwitchVideo } from "@/lib/twitch-vod";
import type { MatchHistoryEntryData, MatchStreamSummary } from "@/lib/players";

// One side of a match, with just what capture needs to know about them. Handed
// in from applyEloAndConfirm, which already has both User rows loaded.
export interface MatchStreamCandidate {
  id: string;
  twitchUserId: string | null;
  twitchLogin: string | null;
}

// Defers the live-status check past the confirming transaction via
// next/server's after() — it's a network call, so it must never run inside the
// transaction or block the confirm response. after() throws outside a real
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
// as the set finished. A failure here only means the set won't offer a replay,
// never a failed confirm — so it swallows everything rather than throwing out
// of the deferred callback.
export async function captureMatchStreams(matchId: string, players: readonly MatchStreamCandidate[]) {
  const candidates = players.filter((p) => p.twitchUserId && p.twitchLogin);
  if (candidates.length === 0) return;

  try {
    const live = await getLiveTwitchUsernames(candidates.map((p) => p.twitchLogin as string));
    const rows = candidates
      .filter((p) => live.has((p.twitchLogin as string).toLowerCase()))
      .map((p) => ({
        matchId,
        userId: p.id,
        twitchUserId: p.twitchUserId as string,
        twitchLogin: (p.twitchLogin as string).toLowerCase(),
      }));
    if (rows.length === 0) return;
    await prisma.matchStream.createMany({ data: rows, skipDuplicates: true });
  } catch (err) {
    console.error("captureMatchStreams failed (non-fatal — no replay link for this set):", err);
  }
}

// A match older than this can't have a VOD any more — Twitch keeps past
// broadcasts for at most ~60 days (Partners; everyone else gets 14) — so
// there's no point asking Helix about it again.
const VOD_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

// How long to wait before re-asking Helix about a stream we already checked and
// couldn't resolve. A VOD only appears once the stream ends, so a set confirmed
// mid-stream resolves on a later view instead of never.
const VOD_RECHECK_MS = 30 * 60 * 1000;

// In-process cache of a channel's recent VOD list, so one render that touches
// several of a streamer's matches (and back-to-back renders) doesn't re-hit
// Helix each time. Only successful lookups are cached; a failure retries on the
// next call, same as the live-status cache in twitch-helix.ts.
const VIDEOS_CACHE_TTL_MS = 5 * 60 * 1000;
const videosCache = new Map<string, { videos: TwitchVideo[]; expiresAt: number }>();

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
  twitchUserId: string;
  twitchLogin: string;
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
// overlay use never does, so they pay for none of this.
export async function attachMatchStreams(entries: MatchHistoryEntryData[]): Promise<void> {
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
      twitchUserId: true,
      twitchLogin: true,
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
      twitchLogin: row.twitchLogin,
      vodId: row.vodId,
      vodOffsetSeconds: row.vodOffsetSeconds,
    };
    const list = byMatch.get(row.matchId);
    if (list) list.push(summary);
    else byMatch.set(row.matchId, [summary]);
  }

  return byMatch;
}

// Fills in vodId/vodOffsetSeconds for every row that's still pending, batching
// the Helix lookups one call per streamer. Updates `rows` in place so the
// caller can build its summaries straight off them. Wrapped so a network or DB
// hiccup just leaves the rows unresolved (no replay shown) rather than failing
// the whole profile render.
async function resolveStreamVods(rows: ResolvableStream[], now = new Date()) {
  const nowMs = now.getTime();
  const pending = rows.filter(
    (r) =>
      r.vodResolvedAt === null &&
      r.match.confirmedAt !== null &&
      nowMs - r.match.confirmedAt.getTime() <= VOD_RETENTION_MS &&
      (r.vodCheckedAt === null || nowMs - r.vodCheckedAt.getTime() >= VOD_RECHECK_MS),
  );
  if (pending.length === 0) return;

  // One Helix call per streamer, no matter how many of their sets are on the page.
  const byStreamer = new Map<string, ResolvableStream[]>();
  for (const row of pending) {
    const list = byStreamer.get(row.twitchUserId);
    if (list) list.push(row);
    else byStreamer.set(row.twitchUserId, [row]);
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
