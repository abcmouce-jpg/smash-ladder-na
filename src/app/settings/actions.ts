"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  setAudioPingOnMatch,
  setAvoidPracticeOpponents,
  setHideDiscordUsername,
  setMatchFoundSound,
  setNotificationsDisabled,
  setNotifyQueueOpportunities,
  setQuickMessages,
  setUsername,
} from "@/lib/account";
import { disabledKeysFromEnabled } from "@/lib/notifications";
import { setArenaPassword } from "@/lib/arena";
import { generateApiToken, revokeApiToken } from "@/lib/api-tokens";
import { sendTestPushToUser } from "@/lib/push-server";
import { disconnectStartggAccount } from "@/lib/startgg-oauth";
import { disconnectTwitchAccount } from "@/lib/twitch-oauth";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

export type SettingsSaveState = { error: string | null; saved: boolean };

// One combined action per Settings tab, so a tab's Save writes every field it
// renders in a single submission. Username and the profile-level toggles live
// on the User tab.
export async function updateUserSettingsAction(
  _prevState: SettingsSaveState,
  formData: FormData,
): Promise<SettingsSaveState> {
  const userId = await requireUserId();
  try {
    await setUsername(userId, String(formData.get("username") ?? ""));
    await setHideDiscordUsername(userId, formData.get("hideDiscordUsername") === "on");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again.", saved: false };
  }
  // "layout" here, not just the default "page" — the header showing this
  // player's name lives in the root layout, which a page-level revalidation
  // doesn't touch, so the old name would otherwise stick around in the
  // header (though not the page content) until the next full navigation.
  revalidatePath("/", "layout");
  revalidatePath(`/players/${userId}`);
  revalidatePath("/leaderboard");
  revalidatePath("/settings");
  return { error: null, saved: true };
}

// Lobby tab. The length-validated writes (arena password, quick messages) run
// first so hitting one of their limits aborts before the toggles below have
// been written.
export async function updateLobbySettingsAction(
  _prevState: SettingsSaveState,
  formData: FormData,
): Promise<SettingsSaveState> {
  const userId = await requireUserId();
  try {
    await setArenaPassword(userId, String(formData.get("arenaPassword") ?? ""));
    await setQuickMessages(
      userId,
      formData.getAll("quickMessage").map((m) => String(m)),
    );
    await setAvoidPracticeOpponents(userId, formData.get("avoidPracticeOpponents") === "on");
    await setAudioPingOnMatch(userId, formData.get("audioPingOnMatch") === "on");
    await setMatchFoundSound(userId, formData.get("matchFoundSound") === "CHIME" ? "CHIME" : "ANNOUNCER");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again.", saved: false };
  }
  revalidatePath("/settings");
  revalidatePath("/lobby");
  return { error: null, saved: true };
}

// Notifications tab. Every toggle is submitted under the same single form, so
// one Save writes them all. notifyQueueOpportunities is the one opt-in type
// with its own column (see lib/notifications.ts), so it's written separately
// from the opt-out set the other checkboxes rebuild.
export async function updateNotificationSettingsAction(
  _prevState: SettingsSaveState,
  formData: FormData,
): Promise<SettingsSaveState> {
  const userId = await requireUserId();
  try {
    await setNotificationsDisabled(
      userId,
      disabledKeysFromEnabled(formData.getAll("notifications").map((key) => String(key))),
    );
    await setNotifyQueueOpportunities(userId, formData.get("notifyQueueOpportunities") === "on");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again.", saved: false };
  }
  revalidatePath("/settings");
  return { error: null, saved: true };
}

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };

export async function savePushSubscriptionAction(sub: PushSubscriptionKeys) {
  const userId = await requireUserId();
  const { endpoint, p256dh, auth } = sub ?? {};
  if (!endpoint || !p256dh || !auth) {
    return { success: false, error: "Missing subscription details." };
  }
  if (!/^https?:\/\//.test(endpoint)) {
    return { success: false, error: "Invalid subscription endpoint." };
  }
  const userAgent = (await headers()).get("user-agent") ?? null;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh, auth, userAgent },
    // Re-keyed on every save: the subscription row follows whichever account
    // is signed in on this browser (device handed to someone else, etc.), and
    // p256dh/auth can rotate even for a stable endpoint.
    update: { userId, p256dh, auth, userAgent },
  });
  revalidatePath("/settings");
  return { success: true };
}

export async function removePushSubscriptionAction(endpoint: string) {
  const userId = await requireUserId();
  if (endpoint) {
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId } });
  }
  revalidatePath("/settings");
  return { success: true };
}

export async function sendTestPushAction() {
  const userId = await requireUserId();
  return sendTestPushToUser(userId);
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

export type GenerateApiTokenState = { error: string | null; rawToken: string | null };

// The raw token is only ever available here, in the state this returns —
// nothing persists it in recoverable form, so the panel must show it once
// and the player has to copy it before navigating away.
export async function generateApiTokenAction(
  _prevState: GenerateApiTokenState,
  formData: FormData,
): Promise<GenerateApiTokenState> {
  const userId = await requireUserId();
  try {
    const rawToken = await generateApiToken(userId, String(formData.get("name") ?? ""));
    revalidatePath("/settings");
    return { error: null, rawToken };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again.", rawToken: null };
  }
}

export async function revokeApiTokenAction(tokenId: string) {
  const userId = await requireUserId();
  await revokeApiToken(userId, tokenId);
  revalidatePath("/settings");
}
