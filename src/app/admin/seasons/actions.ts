"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { SEASON_MANAGER_USER_ID, endActiveSeasonAndStartNext } from "@/lib/seasons";

async function requireModerator() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (session.user.role !== "MOD" && session.user.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return session.user.id;
}

export async function endSeason(nextName: string) {
  const userId = await requireModerator();
  // Narrower than the MOD/ADMIN check above — see SEASON_MANAGER_USER_ID's
  // definition for why. Enforced server-side; the UI hiding the button for
  // everyone else is just a courtesy, not the actual gate.
  if (SEASON_MANAGER_USER_ID && userId !== SEASON_MANAGER_USER_ID) {
    throw new Error("Ending a season is restricted to one admin for now");
  }
  await endActiveSeasonAndStartNext(nextName.trim() || undefined);
  revalidatePath("/admin/seasons");
  revalidatePath("/leaderboard");
}
