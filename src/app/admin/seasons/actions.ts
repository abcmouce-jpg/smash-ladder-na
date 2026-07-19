"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { endActiveSeasonAndStartNext } from "@/lib/seasons";

async function requireModerator() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (session.user.role !== "MOD" && session.user.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
}

export async function endSeason(nextName: string) {
  await requireModerator();
  await endActiveSeasonAndStartNext(nextName.trim() || undefined);
  revalidatePath("/admin/seasons");
  revalidatePath("/leaderboard");
}
