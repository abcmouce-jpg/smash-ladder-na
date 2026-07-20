"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { cancelLobbyEntry, joinLobbyAndTryPair, setMatchRoomCode } from "@/lib/lobby";
import {
  requireActiveUser,
  requireNotBanned,
  setMaxMatchDistance,
  setMaxRatingGap,
  setUserRegion,
  setUserStartggUrl,
  setUsername,
  setWiredConnection,
} from "@/lib/account";
import {
  pickGameStage,
  reportGameResult,
  startFirstGame,
  strikeGameStage,
} from "@/lib/match-games";
import { postMatchComment } from "@/lib/match-comments";
import { cancelMatch } from "@/lib/matches";
import { fileMatchReport } from "@/lib/reports";
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- useActionState requires this exact (prevState, formData) shape
export async function joinLobby(_prevState: JoinLobbyState, _formData: FormData): Promise<JoinLobbyState> {
  const userId = await requireUserId();
  try {
    await requireNotBanned(userId); // ranked play stays open at Level-1 (SUSPENDED)
    await enforceRateLimit({
      count: () =>
        prisma.ratingLobbyEntry.count({ where: { userId, joinedAt: { gt: minutesAgo(1) } } }),
      limit: 5,
      windowLabel: "minute",
    });
    await joinLobbyAndTryPair(userId);
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

export async function pickStage(matchId: string, gameNumber: number, stage: string) {
  const userId = await requireUserId();
  await requireNotBanned(userId);
  await ignoringStaleGameRaces(() => pickGameStage(userId, matchId, gameNumber, stage));
  revalidatePath("/lobby");
}

export async function reportGame(matchId: string, gameNumber: number, won: boolean) {
  const userId = await requireUserId();
  await requireNotBanned(userId); // must still be able to close out ranked matches at Level-1
  await reportGameResult(userId, matchId, gameNumber, won);
  revalidatePath("/lobby");
}

export async function sendMatchComment(matchId: string, body: string) {
  const userId = await requireUserId();
  await enforceRateLimit({
    count: () =>
      prisma.matchComment.count({ where: { authorId: userId, createdAt: { gt: minutesAgo(1) } } }),
    limit: 15,
    windowLabel: "minute",
  });
  await postMatchComment(userId, matchId, body);
  revalidatePath("/lobby");
}

export async function cancelMatchInProgress(matchId: string) {
  const userId = await requireUserId();
  await cancelMatch(userId, matchId);
  revalidatePath("/lobby");
}

export async function reportConduct(matchId: string, reason: string) {
  const userId = await requireUserId();
  await requireActiveUser(userId); // Level-1 (SUSPENDED) can't file new reports — no retaliation
  await enforceRateLimit({
    count: () =>
      prisma.conductReport.count({ where: { reporterId: userId, createdAt: { gt: minutesAgo(60) } } }),
    limit: 5,
    windowLabel: "hour",
  });
  await fileMatchReport(userId, matchId, reason);
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

export type StartggUrlState = { error: string | null };

// (prevState, formData) shape so useActionState can drive it — a plain
// thrown error (e.g. pasting a non-start.gg link) would otherwise crash to
// Next's generic error overlay instead of showing an inline message.
export async function updateStartggUrl(
  _prevState: StartggUrlState,
  formData: FormData,
): Promise<StartggUrlState> {
  const userId = await requireUserId();
  try {
    await setUserStartggUrl(userId, String(formData.get("startggUrl") ?? ""));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }
  revalidatePath("/lobby");
  revalidatePath(`/players/${userId}`);
  return { error: null };
}

export async function updateUsername(username: string) {
  const userId = await requireUserId();
  await setUsername(userId, username);
  revalidatePath("/lobby");
  revalidatePath(`/players/${userId}`);
  revalidatePath("/leaderboard");
}

export type WiredConnectionState = { error: string | null };

export async function updateWiredConnection(
  _prevState: WiredConnectionState,
  formData: FormData,
): Promise<WiredConnectionState> {
  const userId = await requireUserId();
  try {
    await setWiredConnection(userId, formData.get("wired") === "on");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong — try again." };
  }
  revalidatePath("/lobby");
  revalidatePath(`/players/${userId}`);
  return { error: null };
}

export async function reportOpponentCharacterAction(matchId: string, character: string) {
  const userId = await requireUserId();
  await reportOpponentCharacter(userId, matchId, character);
  revalidatePath("/lobby");
  revalidatePath("/characters");
  revalidatePath("/leaderboard");
}
