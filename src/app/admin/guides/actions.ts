"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { removeGuide, unhideGuide } from "@/lib/character-guides";

async function requireModerator() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (session.user.role !== "MOD" && session.user.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
}

export async function unhideGuideAction(guideId: string) {
  await requireModerator();
  await unhideGuide(guideId);
  revalidatePath("/admin/guides");
  revalidatePath("/notes");
}

export async function removeGuideAction(guideId: string) {
  await requireModerator();
  await removeGuide(guideId);
  revalidatePath("/admin/guides");
}
