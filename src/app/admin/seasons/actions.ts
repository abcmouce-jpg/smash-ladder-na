"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { RatingAlgorithm } from "@/generated/prisma/enums";
import { NEXT_SEASON_ALGORITHM, SEASON_MANAGER_USER_ID, endActiveSeasonAndStartNext } from "@/lib/seasons";

async function requireModerator() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (session.user.role !== "MOD" && session.user.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return session.user.id;
}

export async function endSeason(formData: FormData) {
  const userId = await requireModerator();
  // Narrower than the MOD/ADMIN check above — see SEASON_MANAGER_USER_ID's
  // definition for why. Enforced server-side; the UI hiding the button for
  // everyone else is just a courtesy, not the actual gate.
  if (SEASON_MANAGER_USER_ID && userId !== SEASON_MANAGER_USER_ID) {
    throw new Error("Ending a season is restricted to one admin for now");
  }

  const nextName = (formData.get("nextName") as string | null)?.trim() || undefined;

  // Optional — leaving this blank starts the next season manual-only (no
  // countdown, no auto-rollover), same as every season before scheduledEndAt
  // existed. A positive whole number of days announces its own rollover time
  // up front, same idea as the preseason's fixed length.
  const durationDays = Number((formData.get("nextDurationDays") as string | null)?.trim());
  const nextScheduledEndAt =
    Number.isFinite(durationDays) && durationDays > 0
      ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000)
      : null;

  // Which rating system the new season runs on. Anything unrecognised (or a
  // stale form) falls back to the site default rather than erroring — the only
  // valid values are the RatingAlgorithm members.
  const algorithmRaw = formData.get("nextAlgorithm") as string | null;
  const nextAlgorithm =
    algorithmRaw && algorithmRaw in RatingAlgorithm ? (algorithmRaw as RatingAlgorithm) : NEXT_SEASON_ALGORITHM;

  await endActiveSeasonAndStartNext(nextName, new Date(), nextScheduledEndAt, nextAlgorithm);
  revalidatePath("/admin/seasons");
  revalidatePath("/leaderboard");
}
