"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { cancelLobbyEntry, joinLobbyAndTryPair, setMatchRoomCode } from "@/lib/lobby";
import { requireActiveUser } from "@/lib/account";
import {
  pickGameStage,
  reportGameResult,
  startFirstGame,
  strikeGameStage,
} from "@/lib/match-games";
import { postMatchComment } from "@/lib/match-comments";
import { cancelMatch } from "@/lib/matches";
import { fileMatchReport } from "@/lib/reports";

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

export async function joinLobby() {
  const userId = await requireUserId();
  await requireActiveUser(userId);
  await joinLobbyAndTryPair(userId);
  revalidatePath("/lobby");
}

export async function cancelLobby() {
  const userId = await requireUserId();
  await cancelLobbyEntry(userId);
  revalidatePath("/lobby");
}

export async function submitRoomCode(matchId: string, roomCode: string) {
  const userId = await requireUserId();
  await setMatchRoomCode(userId, matchId, roomCode.trim());
  revalidatePath("/lobby");
}

export async function beginFirstGame(matchId: string) {
  const userId = await requireUserId();
  await startFirstGame(userId, matchId);
  revalidatePath("/lobby");
}

export async function strikeStage(matchId: string, gameNumber: number, stage: string) {
  const userId = await requireUserId();
  await ignoringStaleGameRaces(() => strikeGameStage(userId, matchId, gameNumber, stage));
  revalidatePath("/lobby");
}

export async function pickStage(matchId: string, gameNumber: number, stage: string) {
  const userId = await requireUserId();
  await ignoringStaleGameRaces(() => pickGameStage(userId, matchId, gameNumber, stage));
  revalidatePath("/lobby");
}

export async function reportGame(matchId: string, gameNumber: number, won: boolean) {
  const userId = await requireUserId();
  await requireActiveUser(userId);
  await reportGameResult(userId, matchId, gameNumber, won);
  revalidatePath("/lobby");
}

export async function sendMatchComment(matchId: string, body: string) {
  const userId = await requireUserId();
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
  await fileMatchReport(userId, matchId, reason);
  revalidatePath("/lobby");
}
