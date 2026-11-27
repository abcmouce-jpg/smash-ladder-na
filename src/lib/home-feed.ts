import { prisma } from "@/lib/db";
import { PostStatus } from "@/generated/prisma/enums";
import { getLiveTwitchUsernames } from "@/lib/twitch-helix";
import { getLiveYouTubeStreams } from "@/lib/youtube-oauth";
import {
  liveStreamWatchUrl,
  twitchStream,
  youtubeStream,
  type LiveStreamInfo,
  type StreamPlatform,
} from "@/lib/stream-links";

export type LiveStreamer = {
  userId: string;
  name: string;
  platform: StreamPlatform;
  /** Where a viewer goes to watch. */
  watchUrl: string;
  displayName: string | null;
  avatarUrl: string | null;
  rating: number;
  gamesPlayed: number;
};

// Home-page "live now" data. Both platforms are detected: Twitch in one batched
// Helix call (100 logins per request), YouTube one liveBroadcasts call per
// connected channel using that player's own OAuth token. Ordered by rating so a
// sparse live field still shows the most recognisable names. Fails closed to an
// empty list on an API error, so the section hides rather than taking the
// landing page down with it.
export async function getLiveStreamers(limit = 8): Promise<LiveStreamer[]> {
  const candidates = await prisma.user.findMany({
    where: { OR: [{ twitchUsername: { not: null } }, { youtubeUserId: { not: null } }] },
    orderBy: { rating: "desc" },
    take: 200,
    select: {
      id: true,
      username: true,
      avatarUrl: true,
      rating: true,
      gamesPlayed: true,
      twitchUsername: true,
      twitchDisplayName: true,
      youtubeChannelTitle: true,
    },
  });

  const [liveTwitch, liveYouTube] = await Promise.all([
    getLiveTwitchUsernames(candidates.flatMap((u) => (u.twitchUsername ? [u.twitchUsername] : []))),
    getLiveYouTubeStreams(candidates.map((u) => u.id)),
  ]);

  const streamers: LiveStreamer[] = [];
  for (const u of candidates) {
    const streams: LiveStreamInfo[] = [];
    if (u.twitchUsername && liveTwitch.has(u.twitchUsername.toLowerCase())) {
      streams.push(twitchStream(u.twitchUsername, u.twitchDisplayName ?? u.username));
    }
    const youtube = liveYouTube.get(u.id);
    if (youtube) {
      streams.push(
        youtubeStream(youtube.videoId, youtube.channelId, youtube.title || u.youtubeChannelTitle || u.username),
      );
    }

    for (const stream of streams) {
      streamers.push({
        userId: u.id,
        name: u.username,
        platform: stream.platform,
        watchUrl: liveStreamWatchUrl(stream),
        displayName: stream.displayName,
        avatarUrl: u.avatarUrl,
        rating: u.rating,
        gamesPlayed: u.gamesPlayed,
      });
      if (streamers.length >= limit) return streamers;
    }
  }
  return streamers;
}

export async function getFriendliesPosts(limit = 6) {
  return prisma.freeBattlePost.findMany({
    where: { status: PostStatus.OPEN, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      author: { select: { id: true, username: true, avatarUrl: true, rating: true, gamesPlayed: true } },
    },
  });
}

// Row shape for the shared FriendliesPosts card, derived from the query so
// the component can't drift from what the query actually returns.
export type FriendliesPost = Awaited<ReturnType<typeof getFriendliesPosts>>[number];
