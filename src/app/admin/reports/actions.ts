"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { actionReport, dismissReport } from "@/lib/reports";

async function requireModerator() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (session.user.role !== "MOD" && session.user.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
}

export async function dismiss(reportId: string) {
  await requireModerator();
  await dismissReport(reportId);
  revalidatePath("/admin/reports");
}

export async function suspendReportedUser(reportId: string) {
  await requireModerator();
  await actionReport(reportId, "SUSPENDED");
  revalidatePath("/admin/reports");
}

export async function banReportedUser(reportId: string) {
  await requireModerator();
  await actionReport(reportId, "BANNED");
  revalidatePath("/admin/reports");
}
