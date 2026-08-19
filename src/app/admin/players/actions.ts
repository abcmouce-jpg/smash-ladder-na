"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { UserRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { moderateUserDirectly } from "@/lib/reports";
import { canManageRoles } from "@/lib/roles";

async function requireModerator() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (session.user.role !== "MOD" && session.user.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return session.user.id;
}

export async function setSupporter(userId: string, isSupporter: boolean) {
  await requireModerator();
  await prisma.user.update({ where: { id: userId }, data: { isSupporter } });
  revalidatePath("/admin/players");
}

export async function reinstate(userId: string) {
  const modId = await requireModerator();
  await moderateUserDirectly(modId, userId, "REINSTATE");
  revalidatePath("/admin/players");
}

export async function setRole(userId: string, role: UserRole) {
  const actorId = await requireModerator();
  // Narrower than the MOD/ADMIN check above — granting/revoking MOD or ADMIN
  // is restricted to an explicit allowlist, independent of who already holds
  // those roles. Enforced server-side; the UI hiding the control for
  // everyone else is just a courtesy, not the actual gate.
  if (!canManageRoles(actorId)) {
    throw new Error("Changing roles is restricted to a small set of admins for now");
  }
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/players");
}

// Thin FormData-reading wrapper around setRole for the <RoleSelect> client
// component, which submits via a plain form (no way to bind an enum value
// ahead of time the way the button-based UI could).
export async function setRoleFromForm(userId: string, formData: FormData) {
  const role = formData.get("role");
  if (role !== "USER" && role !== "MOD" && role !== "ADMIN") {
    throw new Error("Invalid role");
  }
  await setRole(userId, role);
}
