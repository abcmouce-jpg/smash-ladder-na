"use server";

import { auth, signOut } from "@/auth";
import { deleteMyAccount } from "@/lib/account";

export async function deleteAccountAction() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  await deleteMyAccount(session.user.id);
  await signOut({ redirectTo: "/" });
}
