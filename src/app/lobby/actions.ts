"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { cancelLobbyEntry, joinLobbyAndTryPair, setMatchRoomCode } from "@/lib/lobby";
import {
  requireActiveUser,
  requireNotBanned,
  setAvoidPracticeOpponents,
  setMaxMatchDistance,
  setMaxRatingGap,
  setRematchCooldown,
  setRequireWiredOpponent,
  setUserRegion,
  setWiredConnection,
} from "@/lib/account";
import {
  pickGameCharacter,
  pickGameStage,
  reportGameResult,
  startFirstGame,
  strikeGameStage,
  unstrikeLastGameStage,
} from "@/lib/match-games";
import { postMatchComment } from "@/lib/match-comments";
import { cancelMatch, leaveMatch, requestRematch } from "@/lib/matches";
import { requestDisputeResolution } from "@/lib/disputes";
import { fileConnectionReport, fileMatchReport } from "@/lib/reports";
import { reportOpponentCharacter } from "@/lib/character-stats";
import { prisma } from "@/lib/db";
import { enforceRateLimit, minutesAgo } from "@/lib/rate-limit";

async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return session.user.id;
}

// The stage-strike/pick UI polls and re-renders every few seconds, so a
// click queued just before that refresh can land after state's moved on.
// That's an expected, self-correcting race — not worth a hard crash.
const STALE_GAME_ERRORS = new Set([
  "Stage already decided",
  "Striking is done — waiting on a pick",
  "Not your turn to strike",
  "Stage already struck or invalid",
  "Striking isn't finished yet",
  "Not your turn to pick",
  "Not a valid remaining stage",
  "This game is already decided",
  "You already reported this game",
  "You already picked your character for this game",
  "Wait for your opponent to pick their character first",
  "Nothing to undo yet",
  "You can only undo your own most recent strike",
  "Both players must lock in their character before striking a stage",
  "Both players must lock in their character before picking a stage",
]);

async function ignoringStaleGameRaces(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    if (!(err instanceof Error) || !STALE_GAME_ERRORS.has(err.message)) throw err;
  }
}

export type JoinLobbyState = { error: string | null };

// Takes (prevState, formData) so it can be driven by useActionState on the
// client — a plain thrown error here would otherwise vanish silently, since
// nothing was displaying it: the button's pending state would just clear
// and the page would fall back to the pre-join view with zero explanation
// (e.g. hitting the rate limit, or being region-locked out).
export async function joinLobby(_prevState: JoinLobbyState, formData: FormData): Promise<JoinLobbyState> {
  const userId = await requireUserId();
  const isPracticing = formData.get("isPracticing") === "on";
  try {
    await requireNotBanned(userId); // ranked play stays open at Level-1 (SUSPENDED)
    await enforceRateLimit({
      count: () =>
        prisma.ratingLobbyEntry.count({ where: { userId, joinedAt: { gt: minutesAgo(1) } } }),
      limit: 5,
      windowLabel: "minute",
    });
    await joinLobbyAndTryPair(userId, isPracticing);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }
  revalidatePath("/lobby");
  return { error: null };
}

export async function cancelLobby() {
  const userId = await requireUserId();
  await cancelLobbyEntry(userId);
  revalidatePath("/lobby");
}

export async function submitRoomCode(matchId: string, roomCode: string) {
  const userId = await requireUserId();
  await requireNotBanned(userId); // still a ranked-lobby action, mid-match
  await setMatchRoomCode(userId, matchId, roomCode.trim());
  revalidatePath("/lobby");
}

export async function beginFirstGame(matchId: string) {
  const userId = await requireUserId();
  await requireNotBanned(userId);
  await startFirstGame(userId, matchId);
  revalidatePath("/lobby");
}

export async function strikeStage(matchId: string, gameNumber: number, stage: string) {
  const userId = await requireUserId();
  await requireNotBanned(userId);
  await ignoringStaleGameRaces(() => strikeGameStage(userId, matchId, gameNumber, stage));
  revalidatePath("/lobby");
}

export async function unstrikeStage(matchId: string, gameNumber: number) {
  const userId = await requireUserId();
  await requireNotBanned(userId);
  await ignoringStaleGameRaces(() => unstrikeLastGameStage(userId, matchId, gameNumber));
  revalidatePath("/lobby");
}

export async function pickStage(matchId: string, gameNumber: number, stage: string) {
  const userId = await requireUserId();
  await requireNotBanned(userId);
  await ignoringStaleGameRaces(() => pickGameStage(userId, matchId, gameNumber, stage));
  revalidatePath("/lobby");
}

export async function pickCharacter(matchId: string, gameNumber: number, formData: FormData) {
  const userId = await requireUserId();
  await requireNotBanned(userId);
  const character = String(formData.get("character") ?? "");
  await ignoringStaleGameRaces(() => pickGameCharacter(userId, matchId, gameNumber, character));
  revalidatePath("/lobby");
}

export async function reportGame(matchId: string, gameNumber: number, won: boolean) {
  const userId = await requireUserId();
  await requireNotBanned(userId); // must still be able to close out ranked matches at Level-1
  await reportGameResult(userId, matchId, gameNumber, won);
  revalidatePath("/lobby");
}

export type DisputeResolutionState = { error: string | null; message: string | null };

// (matchId, gameNumber, prevState, formData) shape so useActionState can
// drive it — a plain thrown error (e.g. the other side already reset the
// vote) would otherwise crash to Next's generic error overlay instead of
// showing an inline message.
export async function requestDisputeResolutionAction(
  matchId: string,
  gameNumber: number,
  _prevState: DisputeResolutionState,
  formData: FormData,
): Promise<DisputeResolutionState> {
  const userId = await requireUserId();
  const winnerId = String(formData.get("winnerId") ?? "");
  try {
    const result = await requestDisputeResolution(userId, matchId, gameNumber, winnerId);
    revalidatePath("/lobby");
    if (result.resolved) {
      return { error: null, message: "You both agreed — the game is resolved." };
    }
    if (result.stillDisputed) {
      return {
        error: null,
        message: "That doesn't match what your opponent picked — still waiting on a mod.",
      };
    }
    return { error: null, message: "Submitted — waiting for your opponent to agree." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again.", message: null };
  }
}

export type SendCommentState = { error: string | null };

// (matchId, prevState, formData) shape so useActionState can drive it —
// hitting the rate limit (or the sender no longer being a participant)
// used to crash the whole match card to Next's generic error overlay
// instead of showing an inline message. Seen in production: two players
// chatting quickly through a close set can hit 15 messages/minute.
export async function sendMatchCommentAction(
  matchId: string,
  _prevState: SendCommentState,
  formData: FormData,
): Promise<SendCommentState> {
  const userId = await requireUserId();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: null };
  try {
    await enforceRateLimit({
      count: () =>
        prisma.matchComment.count({ where: { authorId: userId, createdAt: { gt: minutesAgo(1) } } }),
      limit: 15,
      windowLabel: "minute",
    });
    await postMatchComment(userId, matchId, body);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }
  revalidatePath("/lobby");
  return { error: null };
}

export type CancelMatchState = { error: string | null };

// (prevState, formData) shape so useActionState can drive it — cancelling
// is now blocked once a game's been decided or reported, and a plain thrown
// error would otherwise crash to Next's generic error overlay instead of
// showing an inline message.
export async function cancelMatchInProgress(
  matchId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's call signature
  _prevState: CancelMatchState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- required by useActionState's call signature
  _formData: FormData,
): Promise<CancelMatchState> {
  const userId = await requireUserId();
  try {
    await cancelMatch(userId, matchId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }
  revalidatePath("/lobby");
  return { error: null };
}

export async function leaveMatchAction(matchId: string) {
  const userId = await requireUserId();
  await leaveMatch(userId, matchId);
  revalidatePath("/lobby");
}

export async function requestRematchAction(matchId: string) {
  const userId = await requireUserId();
  await requestRematch(userId, matchId);
  revalidatePath("/lobby");
}

export type ReportConductState = { error: string | null; message: string | null };

// (matchId, prevState, formData) shape so useActionState can drive it —
// same rate-limit crash risk as sendMatchCommentAction, just a much wider
// window (5/hour instead of 15/minute) so it's rarer in practice.
export async function reportConductAction(
  matchId: string,
  _prevState: ReportConductState,
  formData: FormData,
): Promise<ReportConductState> {
  const userId = await requireUserId();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: null, message: null };
  try {
    await requireActiveUser(userId); // Level-1 (SUSPENDED) can't file new reports — no retaliation
    await enforceRateLimit({
      count: () =>
        prisma.conductReport.count({ where: { reporterId: userId, createdAt: { gt: minutesAgo(60) } } }),
      limit: 5,
      windowLabel: "hour",
    });
    await fileMatchReport(userId, matchId, reason);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Something went wrong — try again.",
      message: null,
    };
  }
  revalidatePath("/lobby");
  return { error: null, message: "Reported — a mod will review it." };
}

export async function signalTypingAction(matchId: string) {
  const userId = await requireUserId();
  await prisma.matchTypingStatus.upsert({
    where: { matchId_userId: { matchId, userId } },
    update: { lastTypingAt: new Date() },
    create: { matchId, userId, lastTypingAt: new Date() },
  });
}

export async function reportConnection(matchId: string) {
  const userId = await requireUserId();
  await requireActiveUser(userId); // suspension blocks filing new reports, same as reportConduct
  await fileConnectionReport(userId, matchId);
  revalidatePath("/lobby");
}

export async function updateRegion(region: string) {
  const userId = await requireUserId();
  await setUserRegion(userId, region || null);
  revalidatePath("/lobby");
}

export async function updateMaxMatchDistance(maxMatchDistanceKm: number | null) {
  const userId = await requireUserId();
  await setMaxMatchDistance(userId, maxMatchDistanceKm);
  revalidatePath("/lobby");
}

export async function updateMaxRatingGap(maxRatingGap: number | null) {
  const userId = await requireUserId();
  await setMaxRatingGap(userId, maxRatingGap);
  revalidatePath("/lobby");
}

export async function updateRematchCooldown(rematchCooldownHours: number | null) {
  const userId = await requireUserId();
  await setRematchCooldown(userId, rematchCooldownHours);
  revalidatePath("/lobby");
}

// Throws instead of returning an error state, since the matchmaking form surfaces it
export async function updateWiredConnection(wired: boolean) {
  const userId = await requireUserId();
  await setWiredConnection(userId, wired);
  revalidatePath("/lobby");
  revalidatePath(`/players/${userId}`);
}

export async function updateRequireWiredOpponent(requireWired: boolean) {
  const userId = await requireUserId();
  await setRequireWiredOpponent(userId, requireWired);
  revalidatePath("/lobby");
}

export async function updateAvoidPracticeOpponents(avoid: boolean) {
  const userId = await requireUserId();
  await setAvoidPracticeOpponents(userId, avoid);
  revalidatePath("/lobby");
}

export type ReportCharacterState = { reportedCharacter: string | null; error: string | null };

// (matchId, prevState, formData) shape so useActionState can drive it and
// show a confirmation — the select always defaulting to "Skip" regardless
// of what was actually saved made a successful report look like it had
// silently failed.
export async function reportOpponentCharacterAction(
  matchId: string,
  _prevState: ReportCharacterState,
  formData: FormData,
): Promise<ReportCharacterState> {
  const userId = await requireUserId();
  const character = String(formData.get("character") ?? "");
  if (!character) return { reportedCharacter: null, error: null };

  try {
    await reportOpponentCharacter(userId, matchId, character);
  } catch (err) {
    return {
      reportedCharacter: null,
      error: err instanceof Error ? err.message : "Something went wrong — try again.",
    };
  }
  revalidatePath("/lobby");
  revalidatePath("/characters");
  revalidatePath("/leaderboard");
  return { reportedCharacter: character, error: null };
}
