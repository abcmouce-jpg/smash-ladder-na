import { prisma } from "@/lib/db";
import { PostStatus } from "@/generated/prisma/enums";
import { sendDiscordDM } from "@/lib/discord-bot";

const POST_TTL_MS = 24 * 60 * 60 * 1000;

const authorSelect = {
  author: { select: { id: true, username: true, avatarUrl: true, rating: true } },
} as const;

export async function listOpenPosts(excludeUserId: string) {
  return prisma.freeBattlePost.findMany({
    where: {
      status: PostStatus.OPEN,
      expiresAt: { gt: new Date() },
      authorId: { not: excludeUserId },
    },
    orderBy: { createdAt: "desc" },
    include: authorSelect,
  });
}

export async function getOwnActivePost(userId: string) {
  return prisma.freeBattlePost.findFirst({
    where: { authorId: userId, status: { in: [PostStatus.OPEN, PostStatus.MATCHED] } },
    orderBy: { createdAt: "desc" },
    include: authorSelect,
  });
}

export async function createPost(userId: string, comment: string) {
  const existing = await getOwnActivePost(userId);
  if (existing) throw new Error("You already have an active post");

  const trimmed = comment.trim();
  if (!trimmed) throw new Error("Comment is required");

  // Region comes from the player's own profile (set on the Lobby page) so
  // it stays consistent with the structured MATCH_REGIONS list used for
  // ranked pairing, instead of a separate free-text field going stale.
  const author = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { region: true },
  });

  return prisma.freeBattlePost.create({
    data: {
      authorId: userId,
      comment: trimmed,
      region: author.region,
      expiresAt: new Date(Date.now() + POST_TTL_MS),
    },
  });
}

export async function closePost(userId: string, postId: string) {
  await prisma.freeBattlePost.updateMany({
    // MATCHED must be closable too, not just OPEN — otherwise a claimed
    // post counts as "active" forever (per getOwnActivePost) and the
    // author can never post again.
    where: { id: postId, authorId: userId, status: { in: [PostStatus.OPEN, PostStatus.MATCHED] } },
    data: { status: PostStatus.CLOSED },
  });
}

// matchedWithId has no Prisma relation defined on it, so it's looked up separately.
export async function getUserBrief(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, avatarUrl: true, rating: true },
  });
}

export async function claimPost(userId: string, postId: string) {
  const post = await prisma.freeBattlePost.findUnique({ where: { id: postId } });
  if (!post) throw new Error("Post not found");
  if (post.authorId === userId) throw new Error("You can't claim your own post");

  // Conditional update so two claimants racing for the same post can't both win.
  const claim = await prisma.freeBattlePost.updateMany({
    where: { id: postId, status: PostStatus.OPEN },
    data: { status: PostStatus.MATCHED, matchedWithId: userId, matchedAt: new Date() },
  });
  if (claim.count === 0) throw new Error("This post was just claimed by someone else");

  const [author, claimer] = await Promise.all([
    prisma.user.findUnique({ where: { id: post.authorId }, select: { discordId: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { username: true } }),
  ]);
  if (author && claimer) {
    await sendDiscordDM(author.discordId, `🙋 ${claimer.username} is in on your free battle post!`);
  }
}
