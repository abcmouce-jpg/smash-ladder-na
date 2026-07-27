"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { setRematchCooldown, setUsername } from "@/lib/account";
import { setArenaPassword } from "@/lib/arena";
import { disconnectStartggAccount } from "@/lib/startgg-oauth";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

export async function updateUsername(username: string) {
  const userId = await requireUserId();
  await setUsername(userId, username);
  revalidatePath("/settings");
  revalidatePath(`/players/${userId}`);
  revalidatePath("/leaderboard");
}

export async function updateRematchCooldownSetting(rematchCooldownHours: number | null) {
  const userId = await requireUserId();
  await setRematchCooldown(userId, rematchCooldownHours);
  revalidatePath("/settings");
  revalidatePath("/lobby");
}

export type ArenaPasswordState = { error: string | null };

// (prevState, formData) shape so useActionState can drive it — hitting the
// length limit throws, and a plain thrown error would otherwise crash to
// Next's generic error overlay instead of showing an inline message.
export async function updateArenaPassword(
  _prevState: ArenaPasswordState,
  formData: FormData,
): Promise<ArenaPasswordState> {
  const userId = await requireUserId();
  try {
    await setArenaPassword(userId, String(formData.get("arenaPassword") ?? ""));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }
  revalidatePath("/settings");
  revalidatePath("/lobby");
  return { error: null };
}

export async function disconnectStartggAction() {
  const userId = await requireUserId();
  await disconnectStartggAccount(userId);
  revalidatePath("/settings");
  revalidatePath(`/players/${userId}`);
}
