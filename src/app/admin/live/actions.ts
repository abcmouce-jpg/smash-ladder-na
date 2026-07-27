"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { postMatchCommentAsMod } from "@/lib/match-comments";
import { adminForceConfirmMatch } from "@/lib/matches";
import { adminSetGameWinner, adminResetMatchToZero, adminCancelMatch } from "@/lib/disputes";

async function requireModerator() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  if (session.user.role !== "MOD" && session.user.role !== "ADMIN") {
    throw new Error("Not authorized");
  }
  return session.user.id;
}

export async function postLiveMatchComment(matchId: string, formData: FormData) {
  const modId = await requireModerator();
  const body = String(formData.get("body") ?? "");
  await postMatchCommentAsMod(modId, matchId, body);
  revalidatePath("/admin/live");
}

export type ForceConfirmState = { error: string | null };

// (matchId, winnerId, prevState, formData) shape so useActionState can
// drive it — a plain thrown error (match already closed, bad winnerId)
// would otherwise crash to Next's generic error overlay.
export async function forceConfirmMatchAction(
  matchId: string,
  winnerId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's call signature
  _prevState: ForceConfirmState,
): Promise<ForceConfirmState> {
  await requireModerator();
  try {
    await adminForceConfirmMatch(matchId, winnerId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }
  revalidatePath("/admin/live");
  return { error: null };
}

export type SetGameWinnerState = { error: string | null };

// (matchId, gameNumber, winnerId, prevState) shape — same reasoning as
// forceConfirmMatchAction: useActionState needs the thrown error surfaced as
// state, not a crash. winnerId null clears that game back to undecided.
export async function setGameWinnerAction(
  matchId: string,
  gameNumber: number,
  winnerId: string | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's call signature
  _prevState: SetGameWinnerState,
): Promise<SetGameWinnerState> {
  await requireModerator();
  try {
    await adminSetGameWinner(matchId, gameNumber, winnerId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }
  revalidatePath("/admin/live");
  return { error: null };
}

export type ResetMatchState = { error: string | null };

export async function resetMatchAction(
  matchId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's call signature
  _prevState: ResetMatchState,
): Promise<ResetMatchState> {
  await requireModerator();
  try {
    await adminResetMatchToZero(matchId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }
  revalidatePath("/admin/live");
  return { error: null };
}

export type CancelMatchState = { error: string | null };

// Unconditional escape hatch — unlike the self-service cancelMatch (which
// blocks once a game's decided or reported, so a losing player can't dodge
// out), a mod can cancel regardless of status: an opponent who vanished, a
// dispute nobody can resolve, bad-faith reporting, etc.
export async function cancelMatchAction(
  matchId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's call signature
  _prevState: CancelMatchState,
): Promise<CancelMatchState> {
  await requireModerator();
  try {
    await adminCancelMatch(matchId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }
  revalidatePath("/admin/live");
  return { error: null };
}
