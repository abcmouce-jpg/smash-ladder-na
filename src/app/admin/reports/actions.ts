"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { actionReport, dismissReport, moderateUserDirectly } from "@/lib/reports";

async function requireModerator() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (session.user.role !== "MOD" && session.user.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return session.user.id;
}

export async function dismiss(reportId: string) {
  await requireModerator();
  await dismissReport(reportId);
  revalidatePath("/admin/reports");
}

export async function suspendReportedUser(reportId: string, formData: FormData) {
  const modId = await requireModerator();
  const suspensionHours = parseSuspensionHours(
    formData.get("customHours"),
    formData.get("suspensionHours"),
  );
  const skipThreshold = formData.get("insta") === "on";
  await actionReport(reportId, modId, "SUSPENDED", { suspensionHours, skipThreshold });
  revalidatePath("/admin/reports");
}

export async function banReportedUser(reportId: string, formData: FormData) {
  const modId = await requireModerator();
  const skipThreshold = formData.get("insta") === "on";
  await actionReport(reportId, modId, "BANNED", { skipThreshold });
  revalidatePath("/admin/reports");
}

function parseSuspensionHours(
  customRaw: FormDataEntryValue | null,
  presetRaw: FormDataEntryValue | null,
) {
  // The custom hours field wins whenever it's a valid positive number —
  // it's an explicit override of whatever the preset dropdown happens to be
  // sitting on, not a fallback path.
  const custom = Number(customRaw);
  if (customRaw && Number.isFinite(custom) && custom > 0) return custom;

  if (presetRaw === "indefinite" || presetRaw === null) return null;
  const hours = Number(presetRaw);
  return Number.isFinite(hours) ? hours : null;
}

export async function reinstateUser(userId: string) {
  const modId = await requireModerator();
  await moderateUserDirectly(modId, userId, "REINSTATE");
  revalidatePath("/admin/reports");
}
