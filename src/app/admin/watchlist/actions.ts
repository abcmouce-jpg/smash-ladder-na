"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { moderateUserDirectly } from "@/lib/reports";

async function requireModerator() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (session.user.role !== "MOD" && session.user.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return session.user.id;
}

export async function suspendFromWatchlist(userId: string, formData: FormData) {
  const modId = await requireModerator();
  const suspensionHours = parseSuspensionHours(formData.get("customHours"), formData.get("suspensionHours"));
  await moderateUserDirectly(modId, userId, "SUSPEND", {
    suspensionHours,
    reason: "Cancel-abuse pattern flagged on the mod watchlist",
  });
  revalidatePath("/admin/watchlist");
}

function parseSuspensionHours(customRaw: FormDataEntryValue | null, presetRaw: FormDataEntryValue | null) {
  const custom = Number(customRaw);
  if (customRaw && Number.isFinite(custom) && custom > 0) return custom;

  if (presetRaw === "indefinite" || presetRaw === null) return null;
  const hours = Number(presetRaw);
  return Number.isFinite(hours) ? hours : null;
}
