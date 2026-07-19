"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { castCharacterVote, setMainCharacter } from "@/lib/character-stats";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

export async function voteForCharacter(character: string) {
  const userId = await requireUserId();
  await castCharacterVote(userId, character);
  revalidatePath("/characters");
}

export async function updateMainCharacter(character: string) {
  const userId = await requireUserId();
  await setMainCharacter(userId, character || null);
  revalidatePath("/characters");
  revalidatePath("/leaderboard");
}
