"use server";

import { revalidatePath } from "next/cache";
import { tr } from "@/lib/lang";
import { getLang } from "@/lib/i18n";
import { auth, signOut } from "@/auth";
import { deleteMyAccount } from "@/lib/account";
import { blockUser } from "@/lib/blocks";
import { adminCorrectOldMatchResult, adminOverrideMatchResult, requestResultCorrection } from "@/lib/matches";
import { adminCancelMatch, adminUndoOldMatch } from "@/lib/disputes";
import { moderateUserDirectly } from "@/lib/reports";
import { banIp } from "@/lib/ip-bans";
import { listMatchComments, listMatchCommentsAsMod } from "@/lib/match-comments";
import { errorMessage, LocalizedError } from "@/lib/localized-error";

async function requireModerator() {
  const session = await auth();
  if (!session?.user?.id)
    throw new LocalizedError({ en: "Not signed in", es: "No has iniciado sesión", ja: "ログインしていません" });
  if (session.user.role !== "MOD" && session.user.role !== "ADMIN") {
    throw new LocalizedError({ en: "Not authorized", es: "No autorizado", ja: "権限がありません" });
  }
  return session.user.id;
}

function parseSuspensionHours(customRaw: FormDataEntryValue | null, presetRaw: FormDataEntryValue | null) {
  const custom = Number(customRaw);
  if (customRaw && Number.isFinite(custom) && custom > 0) return custom;

  if (presetRaw === "indefinite" || presetRaw === null) return null;
  const hours = Number(presetRaw);
  return Number.isFinite(hours) ? hours : null;
}

export async function deleteAccountAction() {
  const session = await auth();
  if (!session?.user?.id)
    throw new LocalizedError({ en: "Not signed in", es: "No has iniciado sesión", ja: "ログインしていません" });
  await deleteMyAccount(session.user.id);
  await signOut({ redirectTo: "/" });
}

export type BlockState = { error: string | null };

// (prevState, formData) shape so useActionState can drive it — hitting the
// block-count cap throws, and a plain thrown error would otherwise crash to
// Next's generic error overlay instead of showing an inline message.
export async function blockUserAction(
  blockedId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's call signature
  _prevState: BlockState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's call signature
  _formData: FormData,
): Promise<BlockState> {
  const session = await auth();
  if (!session?.user?.id)
    throw new LocalizedError({ en: "Not signed in", es: "No has iniciado sesión", ja: "ログインしていません" });
  try {
    await blockUser(session.user.id, blockedId);
  } catch (err) {
    return { error: errorMessage(err, await getLang()) };
  }
  revalidatePath(`/players/${blockedId}`);
  revalidatePath("/settings");
  return { error: null };
}

export type CorrectionState = { error: string | null; message: string | null };

export async function requestCorrectionAction(
  matchId: string,
  _prevState: CorrectionState,
  formData: FormData,
): Promise<CorrectionState> {
  const session = await auth();
  if (!session?.user?.id)
    throw new LocalizedError({ en: "Not signed in", es: "No has iniciado sesión", ja: "ログインしていません" });
  const winnerId = String(formData.get("winnerId") ?? "");
  try {
    const result = await requestResultCorrection(session.user.id, matchId, winnerId);
    revalidatePath(`/players/${session.user.id}`);
    if (result.applied) {
      return {
        error: null,
        message: tr(await getLang(), {
          en: "Correction applied — ratings updated.",
          es: "Corrección aplicada — clasificaciones actualizadas.",
          ja: "訂正を反映しました。レートを更新しました。",
        }),
      };
    }
    if (result.disputed) {
      return {
        error: null,
        message: tr(await getLang(), {
          en: "Your correction doesn't match what your opponent submitted — a mod will review it.",
          es: "Tu corrección no coincide con la de tu rival — un moderador lo revisará.",
          ja: "あなたの訂正内容が相手の申告と食い違っています。モデレーターが確認します。",
        }),
      };
    }
    return {
      error: null,
      message: tr(await getLang(), {
        en: "Submitted — waiting for your opponent to agree.",
        es: "Enviado — esperando que tu rival esté de acuerdo.",
        ja: "送信しました。相手の同意を待っています。",
      }),
    };
  } catch (err) {
    return { error: errorMessage(err, await getLang()), message: null };
  }
}

export type ModerationState = { error: string | null };

// Mod-only, no report or threshold required — the "insta" direct tool.
export async function moderateUserAction(
  targetUserId: string,
  _prevState: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  const modId = await requireModerator();
  const action = String(formData.get("action") ?? "") as "SUSPEND" | "BAN" | "REINSTATE";
  const suspensionHours = parseSuspensionHours(formData.get("customHours"), formData.get("suspensionHours"));
  const reason = String(formData.get("reason") ?? "");
  try {
    await moderateUserDirectly(modId, targetUserId, action, { suspensionHours, reason });
  } catch (err) {
    return { error: errorMessage(err, await getLang()) };
  }
  revalidatePath(`/players/${targetUserId}`);
  return { error: null };
}

export type BanIpState = { error: string | null; message: string | null };

// Bans the network, not the account — meant for when a mod suspects a
// banned player will just sign up again with a fresh Discord account from
// the same connection. Checked in auth.ts's signIn callback.
export async function banPlayerIpAction(
  targetUserId: string,
  ip: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's call signature
  _prevState: BanIpState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's call signature
  _formData: FormData,
): Promise<BanIpState> {
  await requireModerator();
  try {
    await banIp(ip, `Last known IP of player ${targetUserId}`);
  } catch (err) {
    return { error: errorMessage(err, await getLang()), message: null };
  }
  return { error: null, message: `Banned ${ip}.` };
}

export type AdminOverrideState = { error: string | null };

// Unconditional mod override of a confirmed match's winner — see
// adminOverrideMatchResult for the eligibility guard (still each player's
// most recent confirmed match, season still active).
export async function adminOverrideResultAction(
  matchId: string,
  viewedPlayerId: string,
  winnerId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's call signature
  _prevState: AdminOverrideState,
): Promise<AdminOverrideState> {
  await requireModerator();
  try {
    await adminOverrideMatchResult(matchId, winnerId);
  } catch (err) {
    return { error: errorMessage(err, await getLang()) };
  }
  revalidatePath(`/players/${viewedPlayerId}`);
  return { error: null };
}

// Fully undoes a confirmed match — e.g. one side got auto-forfeited by the
// AFK/no-show timer by accident. Reverts both players' rating back to what
// it was right before this match and cancels it outright, rather than just
// flipping the winner — see adminCancelMatch for the eligibility guard
// (still each player's most recent confirmed match, season still active).
export async function adminUndoMatchAction(
  matchId: string,
  viewedPlayerId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's call signature
  _prevState: AdminOverrideState,
): Promise<AdminOverrideState> {
  await requireModerator();
  try {
    await adminCancelMatch(matchId);
  } catch (err) {
    return { error: errorMessage(err, await getLang()) };
  }
  revalidatePath(`/players/${viewedPlayerId}`);
  return { error: null };
}

// Counterparts to the two actions above for a match that's no longer each
// player's most recent confirmed one — e.g. the player kept queueing
// overnight before a mod got to a bad result. See adminCorrectOldMatchResult
// / adminUndoOldMatch for the relative-delta approach this uses instead.
export async function adminCorrectOldResultAction(
  matchId: string,
  viewedPlayerId: string,
  winnerId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's call signature
  _prevState: AdminOverrideState,
): Promise<AdminOverrideState> {
  await requireModerator();
  try {
    await adminCorrectOldMatchResult(matchId, winnerId);
  } catch (err) {
    return { error: errorMessage(err, await getLang()) };
  }
  revalidatePath(`/players/${viewedPlayerId}`);
  return { error: null };
}

export async function adminUndoOldMatchAction(
  matchId: string,
  viewedPlayerId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's call signature
  _prevState: AdminOverrideState,
): Promise<AdminOverrideState> {
  await requireModerator();
  try {
    await adminUndoOldMatch(matchId);
  } catch (err) {
    return { error: errorMessage(err, await getLang()) };
  }
  revalidatePath(`/players/${viewedPlayerId}`);
  return { error: null };
}

function serializeComments(
  comments: {
    id: string;
    author: { username: string };
    body: string;
    translatedBody?: string | null;
    createdAt: Date;
  }[],
) {
  return comments.map((c) => ({
    id: c.id,
    author: { username: c.author.username },
    body: c.body,
    translatedBody: c.translatedBody ?? null,
    createdAt: c.createdAt.toISOString(),
  }));
}

// Fetched on demand (not preloaded with the rest of match history) — a long
// career could have hundreds of past matches, and most chat logs never get
// revisited. listMatchComments already restricts this to the match's two
// participants regardless of how long ago it confirmed, so no extra check
// needed here beyond being signed in.
export async function getMatchChatLogAction(matchId: string) {
  const session = await auth();
  if (!session?.user?.id)
    throw new LocalizedError({ en: "Not signed in", es: "No has iniciado sesión", ja: "ログインしていません" });
  const comments = await listMatchComments(session.user.id, matchId);
  return serializeComments(comments);
}

// Mod spectator path — same reasoning as listMatchCommentsAsMod (used for
// still-live matches on the Live matches page), just extended to any past
// match too now that mods can review an already-completed set's chat from
// the player's profile page, not just while it's in progress.
export async function getMatchChatLogAsModAction(matchId: string) {
  await requireModerator();
  const comments = await listMatchCommentsAsMod(matchId);
  return serializeComments(comments);
}
