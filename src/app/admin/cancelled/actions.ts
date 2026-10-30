"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { adminConfirmCancelledMatch } from "@/lib/matches";

async function requireModerator() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (session.user.role !== "MOD" && session.user.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
}

export async function confirmCancelled(matchId: string, winnerId: string) {
  await requireModerator();
  await adminConfirmCancelledMatch(matchId, winnerId);
  revalidatePath("/admin/cancelled");
  // The winner's profile and the leaderboard both move, and the set joins the
  // player's history.
  revalidatePath("/leaderboard");
}
