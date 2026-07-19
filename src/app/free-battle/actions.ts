"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { claimPost, closePost, createPost } from "@/lib/free-battle";
import { requireActiveUser } from "@/lib/account";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

export async function postFreeBattle(comment: string, region: string) {
  const userId = await requireUserId();
  await requireActiveUser(userId);
  await createPost(userId, comment, region);
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
  await claimPost(userId, postId);
  revalidatePath("/free-battle");
}
