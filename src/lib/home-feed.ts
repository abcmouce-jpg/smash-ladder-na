import { prisma } from "@/lib/db";
import { PostStatus } from "@/generated/prisma/enums";
import { getLiveTwitchUsernames } from "@/lib/twitch-helix";
import { isDeclarationFresh, parseStreamUrl, type StreamPlatform } from "@/lib/stream-links";

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

// Home-page "live now" row. Two sources, because the two platforms are not
// equally knowable:
//
//   Twitch — detected. The highest-rated players with a Twitch connection are
//   checked in one batched Helix call (100 logins per request) rather than one
//   round trip each.
//
//   YouTube and anything else — declared. The player pastes the URL of the
//   stream they are running and it expires on its own; there is no polling it,
//   for the quota reasons in lib/stream-links.ts.
//
// Ordered by rating so a sparse live field still shows the most recognisable
// names. Fails closed to an empty list on an API error — getLiveTwitchUsernames
// already skips bad batches — so the section hides rather than taking the
// landing page down with it.
export async function getLiveStreamers(limit = 8): Promise<LiveStreamer[]> {
  const candidates = await prisma.user.findMany({
    where: { OR: [{ twitchUsername: { not: null } }, { liveStreamUrl: { not: null } }] },
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
      liveStreamUrl: true,
      liveStreamAt: true,
    },
  });

  const live = await getLiveTwitchUsernames(candidates.flatMap((u) => (u.twitchUsername ? [u.twitchUsername] : [])));

  const streamers: LiveStreamer[] = [];
  for (const u of candidates) {
    // A declared link wins: it says where this player is right now, which may
    // be a different account from the one they connected.
    const declared = u.liveStreamUrl && isDeclarationFresh(u.liveStreamAt) ? parseStreamUrl(u.liveStreamUrl) : null;
    const detected = u.twitchUsername && live.has(u.twitchUsername.toLowerCase());

    const link = declared ?? (detected && u.twitchUsername ? parseStreamUrl(`twitch.tv/${u.twitchUsername}`) : null);
    if (!link) continue;

    streamers.push({
      userId: u.id,
      name: u.username,
      platform: link.platform,
      watchUrl: link.watchUrl,
      displayName: u.twitchDisplayName,
      avatarUrl: u.avatarUrl,
      rating: u.rating,
      gamesPlayed: u.gamesPlayed,
    });
    if (streamers.length >= limit) break;
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
