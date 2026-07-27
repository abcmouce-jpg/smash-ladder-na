"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { setAvoidPracticeOpponents, setRematchCooldown, setUsername } from "@/lib/account";
import { setArenaPassword } from "@/lib/arena";
import { setOwnCharacters } from "@/lib/character-stats";
import { disconnectStartggAccount } from "@/lib/startgg-oauth";
import { disconnectTwitchAccount } from "@/lib/twitch-oauth";

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

export async function updateAvoidPracticeOpponentsSetting(avoid: boolean) {
  const userId = await requireUserId();
  await setAvoidPracticeOpponents(userId, avoid);
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

export type OwnCharactersState = { error: string | null };

// (prevState, formData) shape so useActionState can drive it — the cap and
// main/secondary-overlap checks in setOwnCharacters throw, and a plain
// thrown error would otherwise crash to Next's generic error overlay.
export async function updateOwnCharacters(
  _prevState: OwnCharactersState,
  formData: FormData,
): Promise<OwnCharactersState> {
  const userId = await requireUserId();
  const mainCharacter = String(formData.get("mainCharacter") ?? "").trim() || null;
  const secondaryCharacters = formData
    .getAll("secondaryCharacters")
    .map((v) => String(v).trim())
    .filter(Boolean);
  try {
    await setOwnCharacters(userId, mainCharacter, secondaryCharacters);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }
  revalidatePath("/settings");
  revalidatePath(`/players/${userId}`);
  revalidatePath("/leaderboard");
  return { error: null };
}

export async function disconnectStartggAction() {
  const userId = await requireUserId();
  await disconnectStartggAccount(userId);
  revalidatePath("/settings");
  revalidatePath(`/players/${userId}`);
}

export async function disconnectTwitchAction() {
  const userId = await requireUserId();
  await disconnectTwitchAccount(userId);
  revalidatePath("/settings");
  revalidatePath(`/players/${userId}`);
}
