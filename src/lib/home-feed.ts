import { prisma } from "@/lib/db";
import { PostStatus } from "@/generated/prisma/enums";
import { getLiveTwitchUsernames } from "@/lib/twitch-helix";

export type LiveStreamer = {
  userId: string;
  name: string;
  twitchUsername: string;
  twitchDisplayName: string | null;
  avatarUrl: string | null;
  rating: number;
  gamesPlayed: number;
};

// Home-page "Live on Twitch" row. Pulls the highest-rated players who have a
// Twitch connection and checks them all in one batched Helix call (100
// usernames per request) instead of one API round trip per player, then keeps
// only the ones actually live. Ordered by rating so a sparse live field still
// shows the most recognizable names. Fails closed to an empty list on any API
// error — getLiveTwitchUsernames already skips bad batches — so the section
// silently hides rather than erroring out the whole landing page.
export async function getLiveStreamers(limit = 8): Promise<LiveStreamer[]> {
  const candidates = await prisma.user.findMany({
    where: { twitchUsername: { not: null } },
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
    },
  });

  const live = await getLiveTwitchUsernames(candidates.flatMap((u) => (u.twitchUsername ? [u.twitchUsername] : [])));

  const streamers: LiveStreamer[] = [];
  for (const u of candidates) {
    if (!u.twitchUsername || !live.has(u.twitchUsername.toLowerCase())) continue;
    streamers.push({
      userId: u.id,
      name: u.username,
      twitchUsername: u.twitchUsername,
      twitchDisplayName: u.twitchDisplayName,
      avatarUrl: u.avatarUrl,
      rating: u.rating,
      gamesPlayed: u.gamesPlayed,
    });
    if (streamers.length >= limit) break;
  }
  return streamers;
}

// Most recent open Free Battle posts for the home page's Board section —
// newest first so the section reads as "who's looking for a game right now".
export async function getBoardPosts(limit = 6) {
  return prisma.freeBattlePost.findMany({
    where: { status: PostStatus.OPEN },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      author: { select: { id: true, username: true, avatarUrl: true, rating: true } },
    },
  });
}
