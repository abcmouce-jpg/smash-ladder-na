import { prisma } from "@/lib/db";
import { PostStatus } from "@/generated/prisma/enums";

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

export async function createPost(userId: string, comment: string, region: string) {
  const existing = await getOwnActivePost(userId);
  if (existing) throw new Error("You already have an active post");

  const trimmed = comment.trim();
  if (!trimmed) throw new Error("Comment is required");

  return prisma.freeBattlePost.create({
    data: {
      authorId: userId,
      comment: trimmed,
      region: region.trim() || null,
      expiresAt: new Date(Date.now() + POST_TTL_MS),
    },
  });
}

export async function closePost(userId: string, postId: string) {
  await prisma.freeBattlePost.updateMany({
    where: { id: postId, authorId: userId, status: PostStatus.OPEN },
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
}
