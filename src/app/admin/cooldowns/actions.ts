"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { clearQueueCooldown } from "@/lib/queue-cooldown";

async function requireModerator() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (session.user.role !== "MOD" && session.user.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
}

export async function clearCooldownAction(userId: string) {
  await requireModerator();
  await clearQueueCooldown(userId);
  revalidatePath("/admin/cooldowns");
  revalidatePath("/admin");
}
