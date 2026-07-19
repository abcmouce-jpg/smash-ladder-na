"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { claimPost, closePost, createPost } from "@/lib/free-battle";
import { requireActiveUser } from "@/lib/account";
import { prisma } from "@/lib/db";
import { enforceRateLimit, minutesAgo } from "@/lib/rate-limit";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

export async function postFreeBattle(comment: string) {
  const userId = await requireUserId();
  await requireActiveUser(userId);
  await enforceRateLimit({
    count: () =>
      prisma.freeBattlePost.count({ where: { authorId: userId, createdAt: { gt: minutesAgo(5) } } }),
    limit: 5,
    windowLabel: "5 minutes",
  });
  await createPost(userId, comment);
  revalidatePath("/free-battle");
}

export async function closeFreeBattlePost(postId: string) {
  const userId = await requireUserId();
  await closePost(userId, postId);
  revalidatePath("/free-battle");
}

export async function claimFreeBattlePost(postId: string) {
  const userId = await requireUserId();
  await requireActiveUser(userId);
  await enforceRateLimit({
    count: () =>
      prisma.freeBattlePost.count({
        where: { matchedWithId: userId, matchedAt: { gt: minutesAgo(1) } },
      }),
    limit: 5,
    windowLabel: "minute",
  });
  await claimPost(userId, postId);
  revalidatePath("/free-battle");
}
