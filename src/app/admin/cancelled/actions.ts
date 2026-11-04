"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { adminConfirmCancelledMatch, adminCreditLateCancelledMatch } from "@/lib/matches";

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

// The late counterpart: rates the set at today's numbers because its own
// place in the order has already been built on. Same authorization — mods
// have the context, and the alternative was the owner running SQL.
export async function creditLateCancelled(matchId: string, winnerId: string) {
  await requireModerator();
  await adminCreditLateCancelledMatch(matchId, winnerId);
  revalidatePath("/admin/cancelled");
  revalidatePath("/leaderboard");
}
