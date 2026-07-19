"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { adminCancelMatch, resolveDisputedGame } from "@/lib/disputes";

async function requireModerator() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (session.user.role !== "MOD" && session.user.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
}

export async function resolveDispute(matchId: string, gameNumber: number, winnerId: string) {
  await requireModerator();
  await resolveDisputedGame(matchId, gameNumber, winnerId);
  revalidatePath("/admin/disputes");
  revalidatePath("/lobby");
}

export async function cancelDispute(matchId: string) {
  await requireModerator();
  await adminCancelMatch(matchId);
  revalidatePath("/admin/disputes");
  revalidatePath("/lobby");
}
