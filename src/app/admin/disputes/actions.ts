"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { cancelDisputedMatch, resolveDisputedMatch } from "@/lib/disputes";

async function requireModerator() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (session.user.role !== "MOD" && session.user.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
}

export async function resolveDispute(matchId: string, winnerId: string) {
  await requireModerator();
  await resolveDisputedMatch(matchId, winnerId);
  revalidatePath("/admin/disputes");
}

export async function cancelDispute(matchId: string) {
  await requireModerator();
  await cancelDisputedMatch(matchId);
  revalidatePath("/admin/disputes");
}
